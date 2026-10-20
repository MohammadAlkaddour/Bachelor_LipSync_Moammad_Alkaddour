import { IDLE_POSE_NAME, RHUBARB_POSE_MAP } from '../config/rhubarbPoseMap.js';
import { SAMPLE_DURATION_TOLERANCE } from '../config/testSamples.js';
import { validateRhubarbData } from '../utils/validateRhubarbData.js';

export const LIPSYNC_LOOK_AHEAD = 0.05;

// X cues shorter than this are treated as gaps, not full rest poses.
export const LIPSYNC_IDLE_THRESHOLD = 0.08;

// Manual calibration on top of the measured output latency; positive delays the mouth.
export const LIPSYNC_AUDIO_OFFSET = 0.02;

export const MODE_SHAPE_KEYS = 'shapeKeys';
export const MODE_POSE_FRAMES = 'poseFrames';

export class LipSyncController {
  constructor({ lookAhead, idleThreshold, audioOffset } = {}) {
    this.mode = null;
    this.poseController = null;

    this.audio = new Audio();
    this.audio.preload = 'auto';

    this.mouthCues = [];
    this.sample = null;

    this.lookAhead = lookAhead ?? LIPSYNC_LOOK_AHEAD;
    this.idleThreshold = idleThreshold ?? LIPSYNC_IDLE_THRESHOLD;
    this.audioOffset = audioOffset ?? LIPSYNC_AUDIO_OFFSET;

    // Only reads the device output latency; the audio element is not routed through it.
    this.latencyProbe = typeof AudioContext === 'function' ? new AudioContext() : null;

    // Off while recording: the captured audio track has no output latency.
    this.compensateOutputLatency = true;

    this.currentCueValue = null;
    this.nextCueValue = null;
    this.mappedPoseName = null;
    this.nextPoseName = null;
  }

  setTarget(mode, controller) {
    this.mode = mode;
    this.poseController = controller;
  }

  async loadSample({ id, name, audio: audioUrl, visemes: jsonUrl }) {
    this.restart();

    const response = await fetch(jsonUrl);

    if (!response.ok) {
      throw new Error(`Failed to load Rhubarb JSON: ${jsonUrl} (${response.status})`);
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(`Rhubarb file is not valid JSON: ${jsonUrl}`);
    }

    const rhubarb = validateRhubarbData(data, jsonUrl);
    const previousSrc = this.audio.currentSrc || this.audio.src;
    let audioDuration;

    try {
      audioDuration = await loadAudioSource(this.audio, audioUrl);
    } catch (error) {
      if (previousSrc) {
        this.audio.src = previousSrc;
        this.audio.load();
      }
      throw error;
    }

    this.mouthCues = rhubarb.mouthCues;
    this.sample = { id, name, audioDuration, jsonDuration: rhubarb.duration };
    this.restart();

    console.log(
      `Sample: ${name} (${id})\n` +
        `Audio duration: ${audioDuration.toFixed(2)} s\n` +
        `JSON duration: ${rhubarb.duration.toFixed(2)} s\n` +
        `Number of mouth cues: ${rhubarb.mouthCues.length}\n` +
        `Used Rhubarb values: ${rhubarb.usedValues.join(', ')}`
    );

    for (const warning of rhubarb.warnings) {
      console.warn(`Rhubarb JSON (${jsonUrl}): ${warning}`);
    }

    const durationDifference = Math.abs(audioDuration - rhubarb.duration);

    if (durationDifference > SAMPLE_DURATION_TOLERANCE) {
      console.warn(
        `Sample "${name}": WAV duration (${audioDuration.toFixed(2)} s) and Rhubarb ` +
          `duration (${rhubarb.duration.toFixed(2)} s) differ by ${durationDifference.toFixed(2)} s. ` +
          'The JSON may belong to a different audio file.'
      );
    }

    return this.sample;
  }

  // The probe only reports latency while running and resumes only from a user gesture.
  resumeLatencyProbe() {
    if (this.latencyProbe?.state === 'suspended') {
      this.latencyProbe.resume().catch(() => {});
    }
  }

  getOutputLatency() {
    const probe = this.latencyProbe;

    if (!this.compensateOutputLatency || !probe || probe.state !== 'running') {
      return 0;
    }

    return (probe.outputLatency || 0) + (probe.baseLatency || 0);
  }

  // currentTime is the decode position; it is only heard after the output latency.
  getPlaybackTime() {
    return Math.max(0, this.audio.currentTime - this.getOutputLatency() - this.audioOffset);
  }

  play() {
    this.resumeLatencyProbe();
    const playResult = this.audio.play();

    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch((error) => {
        console.error('LipSyncController: audio play failed', error);
      });
    }
  }

  pause() {
    this.audio.pause();
  }

  restart() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.currentCueValue = null;
    this.nextCueValue = null;
    this.mappedPoseName = null;
    this.nextPoseName = null;
  }

  togglePlayback() {
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  findCueIndexAt(time) {
    for (let i = 0; i < this.mouthCues.length; i += 1) {
      const cue = this.mouthCues[i];

      if (time >= cue.start && time < cue.end) {
        return i;
      }
    }

    return -1;
  }

  findCueAt(time) {
    const index = this.findCueIndexAt(time);
    return index >= 0 ? this.mouthCues[index] : null;
  }

  isShortIdle(cue) {
    return Boolean(
      cue && cue.value === 'X' && cue.end - cue.start < this.idleThreshold
    );
  }

  mapCue(cue) {
    if (!cue) {
      return null;
    }

    return Object.prototype.hasOwnProperty.call(RHUBARB_POSE_MAP, cue.value)
      ? RHUBARB_POSE_MAP[cue.value]
      : null;
  }

  findPreviousCue(index) {
    for (let i = index - 1; i >= 0; i -= 1) {
      const cue = this.mouthCues[i];

      if (!this.isShortIdle(cue)) {
        return cue;
      }
    }

    return null;
  }

  findNextCue(index) {
    for (let i = index + 1; i < this.mouthCues.length; i += 1) {
      const cue = this.mouthCues[i];

      if (!this.isShortIdle(cue)) {
        return cue;
      }
    }

    return null;
  }

  addContribution(weights, poseName, amount) {
    // Idle is implicit: morphs decay to 0 or the idle clip takes the remaining weight.
    if (!poseName || poseName === IDLE_POSE_NAME || amount <= 0) {
      return;
    }

    weights[poseName] = (weights[poseName] || 0) + amount;
  }

  computeTargetWeights(time) {
    const weights = {};
    const index = this.findCueIndexAt(time);

    if (index < 0) {
      return weights;
    }

    const cue = this.mouthCues[index];
    const previous = this.findPreviousCue(index);
    const next = this.findNextCue(index);

    if (this.isShortIdle(cue)) {
      const duration = Math.max(cue.end - cue.start, 1e-6);
      const u = Math.min(Math.max((time - cue.start) / duration, 0), 1);
      this.addContribution(weights, this.mapCue(previous), 1 - u);
      this.addContribution(weights, this.mapCue(next), u);
      return this.applyPoseStrength(weights);
    }

    const window = this.lookAhead;
    const local = time - cue.start;
    const remain = cue.end - time;
    const fadeIn = window > 0 ? Math.min(Math.max(local / window, 0), 1) : 1;
    const fadeOut = window > 0 ? Math.min(Math.max(remain / window, 0), 1) : 1;

    this.addContribution(weights, this.mapCue(previous), 1 - fadeIn);
    this.addContribution(weights, this.mapCue(cue), fadeIn * fadeOut);
    this.addContribution(weights, this.mapCue(next), 1 - fadeOut);

    return this.applyPoseStrength(weights);
  }

  applyPoseStrength(blendWeights) {
    const scaled = {};
    let sum = 0;

    for (const value of Object.values(blendWeights)) {
      sum += value;
    }

    const normalize = sum > 1 ? 1 / sum : 1;
    const getStrength =
      this.poseController.getPoseStrength?.bind(this.poseController) ||
      (() => 1);

    for (const [poseName, amount] of Object.entries(blendWeights)) {
      scaled[poseName] = amount * normalize * getStrength(poseName);
    }

    return scaled;
  }

  update() {
    const currentTime = this.getPlaybackTime();
    const currentIndex = this.findCueIndexAt(currentTime);
    const currentCue = currentIndex >= 0 ? this.mouthCues[currentIndex] : null;
    const displayNext =
      currentIndex >= 0
        ? this.mouthCues[currentIndex + 1] || this.findNextCue(currentIndex)
        : this.findCueAt(currentTime);

    this.currentCueValue = currentCue ? currentCue.value : 'X';
    this.nextCueValue = displayNext ? displayNext.value : 'X';
    this.mappedPoseName = this.mapCue(currentCue) ?? IDLE_POSE_NAME;
    this.nextPoseName = this.mapCue(displayNext) ?? IDLE_POSE_NAME;

    if (!this.poseController || this.audio.paused) {
      return;
    }

    if (this.mode !== MODE_SHAPE_KEYS && this.mode !== MODE_POSE_FRAMES) {
      return;
    }

    const lookAheadTime = currentTime + this.lookAhead;
    const targets = this.computeTargetWeights(lookAheadTime);
    this.poseController.setTargetWeights(targets);
  }
}

function loadAudioSource(audio, url) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };

    const onLoaded = () => {
      cleanup();

      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        reject(new Error(`Audio duration is invalid for ${url} (${audio.duration})`));
        return;
      }

      resolve(audio.duration);
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load audio: ${url}`));
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    audio.src = url;
    audio.load();
  });
}
