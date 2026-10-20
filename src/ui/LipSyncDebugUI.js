export function createLipSyncDebugUI(lipSyncController) {
  const panel = document.createElement('div');
  panel.id = 'lipsync-debug-ui';
  panel.innerHTML = '<h3>Lip-sync debug</h3>';

  const lineKeys = [
    'mode',
    'time',
    'cue',
    'pose',
    'nextPose',
    'strongest',
    'second',
    'speeds',
    'lookAhead',
  ];

  const lines = {};

  for (const key of lineKeys) {
    const element = document.createElement('div');
    element.className = 'lipsync-debug-line';
    panel.appendChild(element);
    lines[key] = element;
  }

  document.body.appendChild(panel);

  function rankWeights(weights) {
    return Object.entries(weights || {})
      .map(([name, weight]) => ({ name, weight }))
      .sort((a, b) => b.weight - a.weight);
  }

  function formatEntry(entry) {
    return entry ? `${entry.name} (${entry.weight.toFixed(2)})` : '—';
  }

  // called once per frame from the render loop
  panel.updateDisplay = () => {
    const controller = lipSyncController.poseController;
    const ranked = rankWeights(controller?.currentWeights);

    lines.mode.textContent = `mode: ${lipSyncController.mode ?? '—'}`;
    lines.time.textContent =
      `time: ${lipSyncController.getPlaybackTime().toFixed(2)}s  ` +
      `(output latency ${(lipSyncController.getOutputLatency() * 1000).toFixed(0)} ms)`;
    lines.cue.textContent =
      `cue: ${lipSyncController.currentCueValue ?? '—'}  ` +
      `next cue: ${lipSyncController.nextCueValue ?? '—'}`;
    lines.pose.textContent = `pose: ${lipSyncController.mappedPoseName ?? '—'}`;
    lines.nextPose.textContent = `next pose: ${lipSyncController.nextPoseName ?? '—'}`;
    lines.strongest.textContent = `strongest: ${formatEntry(ranked[0])}`;
    lines.second.textContent = `second: ${formatEntry(ranked[1])}`;
    lines.speeds.textContent =
      `attack: ${controller?.attackSpeed ?? '—'}  release: ${controller?.releaseSpeed ?? '—'}`;
    lines.lookAhead.textContent = `lookAhead: ${lipSyncController.lookAhead.toFixed(3)}s`;
  };

  panel.updateDisplay();

  return panel;
}
