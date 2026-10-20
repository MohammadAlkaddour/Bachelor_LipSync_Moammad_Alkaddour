import './style.css';
import * as THREE from 'three';

import { SceneSetup } from './core/SceneSetup.js';
import { ModelLoader } from './core/ModelLoader.js';
import { ShapeKeyController } from './core/ShapeKeyController.js';
import { PoseFrameController } from './core/PoseFrameController.js';
import {
  LipSyncController,
  MODE_POSE_FRAMES,
  MODE_SHAPE_KEYS,
} from './core/LipSyncController.js';
import { EvaluationMonitor } from './evaluation/EvaluationMonitor.js';
import { BenchmarkRunner } from './evaluation/BenchmarkRunner.js';
import { buildRunRows, downloadBlob, downloadTextFile, toCsv, toJson } from './evaluation/exportResults.js';
import { recordPlayback } from './study/recordPlayback.js';
import { createManualPoseUI } from './ui/ManualPoseUI.js';
import { createLipSyncDebugUI } from './ui/LipSyncDebugUI.js';
import { createControlPanel } from './ui/ControlPanel.js';
import { createEvaluationPanel } from './ui/EvaluationPanel.js';
import { ASSET_PATHS } from './config/assetPaths.js';
import { BENCHMARK_CONFIG, EVALUATION_ASSETS, EVALUATION_CAMERA } from './config/evaluationConfig.js';
import { STUDY_VERSIONS, STUDY_VIDEO_CONFIG } from './config/studyCaptureConfig.js';
import { DEFAULT_TEST_SAMPLE_ID, TEST_SAMPLES } from './config/testSamples.js';
import { IDLE_POSE_NAME } from './config/rhubarbPoseMap.js';
import { inspectMorphTargets } from './utils/inspectMorphTargets.js';
import { fixTeethSkinning } from './utils/fixTeethSkinning.js';
import { removeUpperTeethOffset } from './utils/removeUpperTeethOffset.js';
import { describeModel } from './utils/describeModel.js';

const EXPECTED_POSE_FRAME_CLIPS = [
  'anim_lipshape_A',
  'anim_lipshape_AO_ER',
  'anim_lipshape_EH_AE',
  'anim_lipshape_F_V',
  'anim_lipshape_idle',
  'anim_lipshape_KST',
  'anim_lipshape_L',
  'anim_lipshape_PBM',
  'anim_lipshape_UW_OW_W',
];

const MODES = [MODE_SHAPE_KEYS, MODE_POSE_FRAMES];

const app = document.querySelector('#app');

const sceneSetup = new SceneSetup(app);
const modelLoader = new ModelLoader();
const clock = new THREE.Clock();
const evaluationMonitor = new EvaluationMonitor();

let activeMode = MODE_SHAPE_KEYS;
let activeSampleId = null;
let isLoadingSample = false;

const characters = {
  [MODE_SHAPE_KEYS]: null,
  [MODE_POSE_FRAMES]: null,
};

const modelLoadMetrics = {};
const modelStats = {};

let shapeKeyController = null;
let poseFrameController = null;
let lipSyncController = null;
let benchmarkRunner = null;

let studyCaptureCameraState = null;
let isRecordingStudyVideos = false;
let gpuRendererName = null;

let lipSyncDebugUI = null;
let controlPanel = null;
let evaluationPanel = null;

let testCube = null;

function addDebugCube() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x44aa88 });
  testCube = new THREE.Mesh(geometry, material);
  sceneSetup.scene.add(testCube);
}

function recordModelLoad(mode, { loadStart, setupStart, bytes, timings, loadOrder }) {
  const end = performance.now();

  modelLoadMetrics[mode] = {
    loadOrder,
    downloadedBytes: bytes,
    downloadMs: timings.downloadMs,
    parseMs: timings.parseMs,
    setupMs: end - setupStart,
    totalMs: end - loadStart,
    firstRenderMs: null,
  };

  if (bytes !== EVALUATION_ASSETS[mode].bytes) {
    console.warn(
      `${EVALUATION_ASSETS[mode].file}: downloaded ${bytes} bytes, but assetMetrics.json lists ` +
        `${EVALUATION_ASSETS[mode].bytes}. Restart Vite or run "npm run metrics:assets".`
    );
  }
}

async function loadShapeKeyCharacter(loadOrder) {
  const loadStart = performance.now();
  const { gltf, bytes, timings } = await modelLoader.loadModel(ASSET_PATHS.models.shapeKeyCharacter01);
  const setupStart = performance.now();
  const character = gltf.scene;

  characters[MODE_SHAPE_KEYS] = character;
  shapeKeyController = new ShapeKeyController(character, {
    maxInfluence: 0.85,
    attackSpeed: 22,
    releaseSpeed: 16,
  });

  recordModelLoad(MODE_SHAPE_KEYS, { loadStart, setupStart, bytes, timings, loadOrder });

  console.log('Shape-Key model loaded successfully:', character);
  inspectMorphTargets(character);
  modelStats[MODE_SHAPE_KEYS] = describeModel(character);
}

async function loadPoseFrameCharacter(loadOrder) {
  const loadStart = performance.now();
  const { gltf, bytes, timings } = await modelLoader.loadModel(ASSET_PATHS.models.poseFrameCharacter01);
  const setupStart = performance.now();
  const character = gltf.scene;

  fixTeethSkinning(character);
  removeUpperTeethOffset(gltf.animations);

  characters[MODE_POSE_FRAMES] = character;
  poseFrameController = new PoseFrameController(character, gltf.animations, {
    attackSpeed: 22,
    releaseSpeed: 16,
  });

  recordModelLoad(MODE_POSE_FRAMES, { loadStart, setupStart, bytes, timings, loadOrder });

  console.log('Pose-Frame model loaded successfully:', character);
  console.table(
    gltf.animations.map((clip, index) => ({
      index,
      name: clip.name,
      duration: clip.duration,
      tracks: clip.tracks.length,
    }))
  );

  const clipNames = new Set(gltf.animations.map((clip) => clip.name));
  const missingClips = EXPECTED_POSE_FRAME_CLIPS.filter((name) => !clipNames.has(name));

  if (missingClips.length > 0) {
    console.error('Pose-Frame model is missing clips:', missingClips);
  } else {
    console.log(`All ${EXPECTED_POSE_FRAME_CLIPS.length} expected Pose-Frame clips found.`);
  }

  modelStats[MODE_POSE_FRAMES] = describeModel(character, gltf.animations);
}

// gl.finish() waits for the GPU, so upload and shader compilation are timed per model.
function measureFirstRenders() {
  const gl = sceneSetup.renderer.getContext();

  for (const mode of MODES) {
    sceneSetup.scene.add(characters[mode]);
    const start = performance.now();
    sceneSetup.render();
    gl.finish();
    modelLoadMetrics[mode].firstRenderMs = performance.now() - start;
    sceneSetup.scene.remove(characters[mode]);
  }
}

function readGpuRendererName() {
  const gl = sceneSetup.renderer.getContext();
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

function getActiveController() {
  return activeMode === MODE_SHAPE_KEYS ? shapeKeyController : poseFrameController;
}

function resetActiveControllerToNeutral() {
  if (activeMode === MODE_SHAPE_KEYS && shapeKeyController) {
    for (const name of shapeKeyController.getShapeNames()) {
      shapeKeyController.setShape(name, 0);
    }
  }

  if (activeMode === MODE_POSE_FRAMES && poseFrameController) {
    poseFrameController.resetToNeutral();
  }
}

function resetTestState() {
  lipSyncController?.restart();
  resetActiveControllerToNeutral();
}

// The inactive model is removed, not hidden, so its skeleton is not traversed in tests.
function setActiveMode(mode) {
  activeMode = mode;

  for (const [characterMode, character] of Object.entries(characters)) {
    if (!character) {
      continue;
    }

    if (characterMode === mode) {
      sceneSetup.scene.add(character);
    } else {
      sceneSetup.scene.remove(character);
    }
  }

  lipSyncController?.setTarget(mode, getActiveController());
  resetTestState();

  controlPanel?.setActiveMode(mode);

  if (!benchmarkRunner?.isRunning) {
    evaluationPanel?.render();
  }

  console.log(`MODE: ${mode}`);
}

// Playback is paused first so the Rhubarb cues do not overwrite the manual pose.
function manualSetPose(poseName) {
  if (benchmarkRunner?.isRunning) {
    return;
  }

  if (lipSyncController && !lipSyncController.audio.paused) {
    lipSyncController.pause();
  }

  if (activeMode === MODE_SHAPE_KEYS && shapeKeyController) {
    if (poseName === IDLE_POSE_NAME) {
      shapeKeyController.reset();
    } else {
      shapeKeyController.setPose(poseName);
    }
    return;
  }

  if (activeMode === MODE_POSE_FRAMES && poseFrameController) {
    poseFrameController.setPose(poseName);
  }
}

function restartPlayback() {
  resetTestState();
  lipSyncController?.play();
}

async function selectSample(sampleId) {
  const sample = TEST_SAMPLES[sampleId];

  if (!sample || !lipSyncController || isLoadingSample || benchmarkRunner?.isRunning) {
    return `Sample "${sampleId}" is not available.`;
  }

  isLoadingSample = true;
  controlPanel?.setSampleLoading(true);
  controlPanel?.setSampleStatus(`Loading "${sample.name}"…`);
  resetTestState();

  let errorText = null;

  try {
    const info = await lipSyncController.loadSample({ id: sampleId, ...sample });
    activeSampleId = sampleId;
    evaluationMonitor.setSample(sampleId);
    controlPanel?.setSampleStatus(
      `Audio ${info.audioDuration.toFixed(2)} s, ` +
        `JSON ${info.jsonDuration.toFixed(2)} s, ` +
        `${lipSyncController.mouthCues.length} cues`
    );
  } catch (error) {
    console.error(`Could not load sample "${sample.name}":`, error);
    errorText = `Could not load "${sample.name}".\n${error.message}`;
    const fallback = activeSampleId ? `\nStill using "${TEST_SAMPLES[activeSampleId].name}".` : '';
    controlPanel?.setSampleStatus(errorText + fallback, true);
  } finally {
    resetTestState();
    isLoadingSample = false;
    controlPanel?.setSampleLoading(false);
    controlPanel?.setActiveSample(activeSampleId);
    evaluationPanel?.render();
  }

  return errorText;
}

async function loadInitialSample() {
  const sampleIds = [
    DEFAULT_TEST_SAMPLE_ID,
    ...Object.keys(TEST_SAMPLES).filter((id) => id !== DEFAULT_TEST_SAMPLE_ID),
  ];
  let firstError = null;

  for (const sampleId of sampleIds) {
    const errorText = await selectSample(sampleId);

    if (errorText === null) {
      if (firstError) {
        controlPanel?.setSampleStatus(
          `${firstError}\nFell back to "${TEST_SAMPLES[sampleId].name}".`,
          true
        );
      }
      return;
    }

    firstError ??= errorText;
  }
}

// The benchmark aborts if any of these values changes between runs.
function captureConditions() {
  const renderer = sceneSetup.renderer;
  const gl = renderer.getContext();
  const round = (value) => Number(value.toFixed(5));

  return {
    userAgent: navigator.userAgent,
    crossOriginIsolated: window.crossOriginIsolated,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    renderer: {
      pixelRatio: renderer.getPixelRatio(),
      drawingBufferWidth: gl.drawingBufferWidth,
      drawingBufferHeight: gl.drawingBufferHeight,
      antialias: gl.getContextAttributes().antialias,
      outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
      gpu: gpuRendererName,
    },
    camera: {
      fov: sceneSetup.camera.fov,
      position: sceneSetup.camera.position.toArray().map(round),
      target: sceneSetup.controls.target.toArray().map(round),
    },
    lighting: sceneSetup.scene.children
      .filter((object) => object.isLight)
      .map((light) => ({
        type: light.type,
        color: light.color.getHexString(),
        intensity: light.intensity,
        position: light.position.toArray().map(round),
      })),
    sample: {
      id: activeSampleId,
      audioDurationSeconds: lipSyncController.audio.duration,
      mouthCues: lipSyncController.mouthCues.length,
    },
    lipSync: {
      lookAheadSeconds: lipSyncController.lookAhead,
      idleThresholdSeconds: lipSyncController.idleThreshold,
      audioOffsetSeconds: lipSyncController.audioOffset,
    },
    smoothing: {
      shapeKeys: {
        attackSpeed: shapeKeyController.attackSpeed,
        releaseSpeed: shapeKeyController.releaseSpeed,
        maxInfluence: shapeKeyController.maxInfluence,
        poseStrength: shapeKeyController.poseStrength,
      },
      poseFrames: {
        attackSpeed: poseFrameController.attackSpeed,
        releaseSpeed: poseFrameController.releaseSpeed,
        poseStrength: poseFrameController.poseStrength,
      },
    },
  };
}

function setBenchmarkLocked(locked) {
  controlPanel?.setLocked(locked);
  document.body.classList.toggle('benchmark-running', locked);
}

async function startTechnicalEvaluation(scope) {
  if (!lipSyncController?.sample || benchmarkRunner.isRunning || isLoadingSample || studyCaptureCameraState) {
    return;
  }

  const modes = scope === 'active' ? [activeMode] : MODES;

  if (
    modes.some((mode) => evaluationMonitor.results[mode].length > 0) &&
    !window.confirm('Replace the stored runs of this sample for the selected mode(s)? Export them first if needed.')
  ) {
    return;
  }

  evaluationMonitor.clearRuns(modes);

  const previousMode = activeMode;
  const previousCamera = sceneSetup.lockCamera(EVALUATION_CAMERA);
  setBenchmarkLocked(true);

  await benchmarkRunner.run(modes, BENCHMARK_CONFIG);

  sceneSetup.unlockCamera(previousCamera);
  setBenchmarkLocked(false);
  setActiveMode(previousMode);
  evaluationPanel.render();
}

function buildEvaluationDataset() {
  return {
    exportedAt: new Date().toISOString(),
    sample: {
      id: activeSampleId,
      name: lipSyncController.sample?.name ?? null,
      audioDurationSeconds: lipSyncController.audio.duration,
      mouthCues: lipSyncController.mouthCues.length,
    },
    environment: captureConditions(),
    benchmarkConfig: BENCHMARK_CONFIG,
    evaluationCamera: EVALUATION_CAMERA,
    definitions: {
      frameTime: 'Interval between consecutive requestAnimationFrame callbacks (performance.now()), ms',
      workTime: 'Main-thread time of one frame: lip-sync update, animation update and render call (no GPU time), ms',
      standardDeviation: 'Sample standard deviation (n - 1) across runs',
      percentile: 'Linear interpolation between closest ranks (numpy.percentile default)',
      modelLoad: 'totalMs = download + parse + setup, HTTP cache bypassed; firstRenderMs = first render incl. GPU upload and shader compilation (gl.finish)',
      browserHeap: 'performance.memory (Chromium only), optional debug data',
    },
    assets: EVALUATION_ASSETS,
    modelStats,
    modelLoad: modelLoadMetrics,
    aggregates: evaluationMonitor.getAggregates(),
    runs: evaluationMonitor.results,
  };
}

function exportResults(format) {
  if (!evaluationMonitor.hasRuns()) {
    return;
  }

  const dataset = buildEvaluationDataset();
  const timestamp = dataset.exportedAt.replace(/[:.]/g, '-');
  const baseName = `lipsync-evaluation_${activeSampleId}_${timestamp}`;

  if (format === 'csv') {
    downloadTextFile(`${baseName}.csv`, toCsv(buildRunRows(dataset)), 'text/csv;charset=utf-8');
  } else {
    downloadTextFile(`${baseName}.json`, toJson(dataset), 'application/json');
  }
}

function toggleStudyCaptureMode() {
  if (benchmarkRunner?.isRunning || isRecordingStudyVideos) {
    return;
  }

  const enable = studyCaptureCameraState === null;

  if (enable) {
    studyCaptureCameraState = sceneSetup.lockCamera(EVALUATION_CAMERA);
  } else {
    sceneSetup.unlockCamera(studyCaptureCameraState);
    studyCaptureCameraState = null;
  }

  document.body.classList.toggle('study-capture', enable);
  controlPanel.setStudyCaptureMode(enable);
  resetTestState();
}

function selectStudyVersion(version) {
  setActiveMode(STUDY_VERSIONS[version]);
}

async function recordStudyVideos() {
  if (!studyCaptureCameraState || isRecordingStudyVideos || benchmarkRunner?.isRunning || isLoadingSample) {
    return;
  }

  const config = STUDY_VIDEO_CONFIG;

  if (activeSampleId !== config.sampleId && (await selectSample(config.sampleId)) !== null) {
    controlPanel.setRecordStatus('The German sample could not be loaded.', true);
    return;
  }

  isRecordingStudyVideos = true;
  setBenchmarkLocked(true);
  const previousMode = activeMode;
  sceneSetup.setFixedRenderSize(config.width, config.height);
  // The captured audio stream bypasses the output device, so no latency offset applies.
  lipSyncController.compensateOutputLatency = false;

  try {
    for (const version of Object.keys(STUDY_VERSIONS)) {
      selectStudyVersion(version);
      controlPanel.setRecordStatus(`Recording Version ${version}…`);
      await new Promise((resolve) => window.setTimeout(resolve, config.settleMs));
      resetTestState();

      const video = await recordPlayback({
        canvas: sceneSetup.renderer.domElement,
        audio: lipSyncController.audio,
        fps: config.fps,
        videoBitsPerSecond: config.videoBitsPerSecond,
        tailMs: config.tailMs,
      });

      downloadBlob(config.fileName(version), video);
    }

    controlPanel.setRecordStatus('Both videos were downloaded.');
  } catch (error) {
    console.error('Study video recording failed:', error);
    controlPanel.setRecordStatus(`Recording failed: ${error.message}`, true);
  } finally {
    lipSyncController.compensateOutputLatency = true;
    sceneSetup.clearFixedRenderSize();
    setBenchmarkLocked(false);
    setActiveMode(previousMode);
    isRecordingStudyVideos = false;
  }
}

async function init() {
  try {
    // Loaded sequentially so the timings do not compete for bandwidth or parse time.
    await loadShapeKeyCharacter(1);
    await loadPoseFrameCharacter(2);

    gpuRendererName = readGpuRendererName();

    lipSyncController = new LipSyncController({
      lookAhead: 0.05,
      idleThreshold: 0.08,
    });

    const resumeLatencyProbe = () => lipSyncController.resumeLatencyProbe();
    document.addEventListener('pointerdown', resumeLatencyProbe, true);
    document.addEventListener('keydown', resumeLatencyProbe, true);

    const audio = lipSyncController.audio;
    const updatePlayingState = () => document.body.classList.toggle('is-playing', !audio.paused);
    audio.addEventListener('play', updatePlayingState);
    audio.addEventListener('pause', updatePlayingState);

    measureFirstRenders();
    sceneSetup.scene.add(characters[MODE_SHAPE_KEYS], characters[MODE_POSE_FRAMES]);
    sceneSetup.render();
    console.table(modelLoadMetrics);

    createManualPoseUI(manualSetPose);
    lipSyncDebugUI = createLipSyncDebugUI(lipSyncController);
    controlPanel = createControlPanel({
      samples: Object.entries(TEST_SAMPLES).map(([id, sample]) => ({ id, name: sample.name })),
      onSelectSample: selectSample,
      initialMode: activeMode,
      onSelectMode: setActiveMode,
      studyVersions: STUDY_VERSIONS,
      onSelectStudyVersion: selectStudyVersion,
      onToggleStudyCapture: toggleStudyCaptureMode,
      onRecordStudyVideos: recordStudyVideos,
      onPlay: () => lipSyncController.play(),
      onPause: () => lipSyncController.pause(),
      onRestart: restartPlayback,
    });
    evaluationPanel = createEvaluationPanel({
      monitor: evaluationMonitor,
      getActiveMode: () => activeMode,
      getSampleName: () => lipSyncController.sample?.name ?? null,
      getAssetReport: () => ({ assets: EVALUATION_ASSETS, modelLoad: modelLoadMetrics, modelStats }),
      benchmarkConfig: BENCHMARK_CONFIG,
      onRun: startTechnicalEvaluation,
      onAbort: () => benchmarkRunner.abort('aborted by user'),
      onExportCsv: () => exportResults('csv'),
      onExportJson: () => exportResults('json'),
    });

    benchmarkRunner = new BenchmarkRunner({
      monitor: evaluationMonitor,
      audio,
      activateMode: setActiveMode,
      resetTestState,
      captureConditions,
      getRunContext: (mode, runNumber, conditions) => ({
        runNumber,
        sampleId: activeSampleId,
        sampleName: lipSyncController.sample.name,
        audioDurationSeconds: audio.duration,
        conditions,
      }),
      onStateChange: (state) => {
        evaluationPanel.setBenchmarkState(state);

        // No table re-render during measured playback, it would distort frame times.
        if (state.phase !== 'measuring') {
          evaluationPanel.render();
        }
      },
    });

    setActiveMode(activeMode);
    await loadInitialSample();
  } catch (error) {
    console.error('Failed to load lip-sync prototype:', error);
    console.warn('Showing debug cube as fallback.');
    addDebugCube();
  }
}

function animate() {
  requestAnimationFrame(animate);

  const frameStart = performance.now();
  evaluationMonitor.recordFrame(frameStart);

  const deltaTime = clock.getDelta();

  if (lipSyncController) {
    lipSyncController.update();
  }

  // Only the active controller is updated, so the inactive one adds no CPU cost.
  getActiveController()?.update(deltaTime);

  if (lipSyncDebugUI && !benchmarkRunner?.isRunning && !studyCaptureCameraState) {
    lipSyncDebugUI.updateDisplay();
  }

  if (evaluationPanel && !studyCaptureCameraState) {
    evaluationPanel.updateLive();
  }

  if (testCube) {
    testCube.rotation.y += 0.01;
    testCube.rotation.x += 0.005;
  }

  sceneSetup.render();

  evaluationMonitor.recordWorkTime(performance.now() - frameStart);
}

init();
animate();
