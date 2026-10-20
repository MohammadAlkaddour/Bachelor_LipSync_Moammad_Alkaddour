import { MODE_POSE_FRAMES, MODE_SHAPE_KEYS } from '../core/LipSyncController.js';
import { MODE_LABELS } from '../config/evaluationConfig.js';

function createButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createTitle(text) {
  const title = document.createElement('h3');
  title.textContent = text;
  return title;
}

function createSection(className, ...children) {
  const section = document.createElement('div');
  section.className = `panel-section ${className}`.trim();
  section.append(...children);
  return section;
}

// Study Capture Mode only shows the blinded Version A/B buttons and playback controls
export function createControlPanel({
  samples,
  onSelectSample,
  initialMode,
  onSelectMode,
  studyVersions,
  onSelectStudyVersion,
  onToggleStudyCapture,
  onRecordStudyVideos,
  onPlay,
  onPause,
  onRestart,
}) {
  const panel = document.createElement('div');
  panel.id = 'control-panel';

  const sampleSelect = document.createElement('select');
  sampleSelect.className = 'panel-select';

  for (const sample of samples) {
    const option = document.createElement('option');
    option.value = sample.id;
    option.textContent = sample.name;
    sampleSelect.appendChild(option);
  }

  sampleSelect.addEventListener('change', () => onSelectSample(sampleSelect.value));

  const sampleStatus = document.createElement('div');
  sampleStatus.className = 'panel-status';

  const modeRow = document.createElement('div');
  modeRow.className = 'panel-button-row';

  const modeButtons = new Map();

  for (const mode of [MODE_SHAPE_KEYS, MODE_POSE_FRAMES]) {
    const button = createButton(MODE_LABELS[mode], () => onSelectMode(mode));
    modeButtons.set(mode, button);
    modeRow.appendChild(button);
  }

  const versionRow = document.createElement('div');
  versionRow.className = 'panel-button-row';

  const versionButtons = new Map();

  for (const version of Object.keys(studyVersions)) {
    const button = createButton(`Version ${version}`, () => onSelectStudyVersion(version));
    versionButtons.set(version, button);
    versionRow.appendChild(button);
  }

  const playbackRow = document.createElement('div');
  playbackRow.className = 'panel-button-row';
  playbackRow.append(
    createButton('Play', onPlay),
    createButton('Pause', onPause),
    createButton('Restart', onRestart)
  );

  const studyButton = createButton('Study Capture Mode', onToggleStudyCapture);
  const studyRow = document.createElement('div');
  studyRow.className = 'panel-button-row';
  studyRow.appendChild(studyButton);

  const recordRow = document.createElement('div');
  recordRow.className = 'panel-button-row';
  recordRow.appendChild(createButton('Record Study Videos', onRecordStudyVideos));

  const recordStatus = document.createElement('div');
  recordStatus.className = 'panel-status';

  panel.append(
    createSection('panel-section--dev', createTitle('Test sample'), sampleSelect, sampleStatus),
    createSection('panel-section--dev', createTitle('Comparison mode'), modeRow),
    createSection('panel-section--study', createTitle('Version'), versionRow),
    createSection('panel-section--study', createTitle('Video'), recordRow, recordStatus),
    createSection('', createTitle('Playback'), playbackRow, studyRow)
  );
  document.body.appendChild(panel);

  function setActiveMode(mode) {
    for (const [id, button] of modeButtons) {
      button.classList.toggle('is-active', id === mode);
    }

    for (const [version, button] of versionButtons) {
      button.classList.toggle('is-active', studyVersions[version] === mode);
    }
  }

  function setActiveSample(sampleId) {
    if (sampleId) {
      sampleSelect.value = sampleId;
    }
  }

  function setSampleLoading(loading) {
    sampleSelect.disabled = loading;
  }

  function setSampleStatus(text, isError = false) {
    sampleStatus.textContent = text;
    sampleStatus.classList.toggle('is-error', isError);
  }

  function setLocked(locked) {
    for (const element of panel.querySelectorAll('button, select')) {
      element.disabled = locked;
    }
  }

  function setStudyCaptureMode(enabled) {
    studyButton.textContent = enabled ? 'Exit Study Capture Mode' : 'Study Capture Mode';
  }

  function setRecordStatus(text, isError = false) {
    recordStatus.textContent = text;
    recordStatus.classList.toggle('is-error', isError);
  }

  setActiveMode(initialMode);

  return {
    setActiveMode,
    setActiveSample,
    setSampleLoading,
    setSampleStatus,
    setLocked,
    setStudyCaptureMode,
    setRecordStatus,
  };
}
