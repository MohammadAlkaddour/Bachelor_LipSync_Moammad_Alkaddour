import { MODE_POSE_FRAMES, MODE_SHAPE_KEYS } from '../core/LipSyncController.js';
import { MODE_LABELS, MODE_TABLE_LABELS } from '../config/evaluationConfig.js';
import { RUN_METRICS } from '../evaluation/benchmarkMetrics.js';

const MODES = [MODE_SHAPE_KEYS, MODE_POSE_FRAMES];

const COMPARISON_METRIC_KEYS = [
  'averageFps',
  'averageFrameTimeMs',
  'medianFrameTimeMs',
  'p95FrameTimeMs',
  'maxFrameTimeMs',
  'minimumFps',
  'averageWorkTimeMs',
  'p95WorkTimeMs',
  'frameCount',
];

const RUN_TABLE_KEYS = ['frameCount', 'averageFps', 'averageFrameTimeMs', 'medianFrameTimeMs', 'p95FrameTimeMs', 'maxFrameTimeMs'];

const METRICS_BY_KEY = Object.fromEntries(RUN_METRICS.map((metric) => [metric.key, metric]));

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function formatNumber(value, digits) {
  return typeof value === 'number' ? value.toFixed(digits) : '—';
}

function formatValue(value, metric) {
  const text = formatNumber(value, metric.digits);
  return metric.unit && text !== '—' ? `${text} ${metric.unit}` : text;
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString('en-US')} B (${(bytes / 1048576).toFixed(2)} MiB)`;
}

function formatAggregate(aggregate, metric) {
  if (!aggregate || aggregate.n === 0) return '—';

  const mean = formatValue(aggregate.mean, metric);
  return aggregate.sd === null ? mean : `${mean} ± ${formatNumber(aggregate.sd, metric.digits)}`;
}

function createButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

// Reports measured values only, without interpretation
export function createEvaluationPanel({
  monitor,
  getActiveMode,
  getSampleName,
  getAssetReport,
  benchmarkConfig,
  onRun,
  onAbort,
  onExportCsv,
  onExportJson,
}) {
  const panel = document.createElement('div');
  panel.id = 'evaluation-panel';
  panel.innerHTML = '<h3>Technical evaluation</h3>';

  const liveEl = document.createElement('div');
  liveEl.className = 'evaluation-live';

  const statusEl = document.createElement('div');
  statusEl.className = 'evaluation-status';

  const scopeSelect = document.createElement('select');
  scopeSelect.className = 'panel-select';
  scopeSelect.innerHTML = `
    <option value="both">Both modes (interleaved)</option>
    <option value="active">Active mode only</option>`;

  let isBenchmarkRunning = false;

  const runButton = createButton('Run Technical Evaluation', () => {
    if (isBenchmarkRunning) onAbort();
    else onRun(scopeSelect.value);
  });
  const csvButton = createButton('Export CSV', onExportCsv);
  const jsonButton = createButton('Export JSON', onExportJson);

  const controlsRow = document.createElement('div');
  controlsRow.className = 'panel-button-row';
  controlsRow.append(runButton, csvButton, jsonButton);

  const configEl = document.createElement('div');
  configEl.className = 'evaluation-debug';
  configEl.textContent =
    `${benchmarkConfig.benchmarkRuns} runs per mode · warm-up ${(benchmarkConfig.warmUpMs / 1000).toFixed(1)} s · ` +
    `settle ${(benchmarkConfig.settleMs / 1000).toFixed(1)} s before each run · fixed evaluation camera`;

  const contentEl = document.createElement('div');

  panel.append(liveEl, scopeSelect, controlsRow, configEl, statusEl, contentEl);
  document.body.appendChild(panel);

  let lastLiveUpdate = 0;

  function updateLive() {
    const now = performance.now();
    if (now - lastLiveUpdate < 250) return;
    lastLiveUpdate = now;

    const frames = monitor.isRunning ? `  |  Recorded frames: ${monitor.currentRun.frameTimes.length}` : '';
    liveEl.textContent =
      `Sample: ${getSampleName() ?? '—'}  |  Active mode: ${MODE_LABELS[getActiveMode()]}  |  ` +
      `Current FPS: ${monitor.currentFps.toFixed(1)}${frames}`;
  }

  function setBenchmarkState(state) {
    isBenchmarkRunning = state.phase === 'warm-up' || state.phase === 'measuring';
    runButton.textContent = isBenchmarkRunning ? 'Abort Evaluation' : 'Run Technical Evaluation';
    scopeSelect.disabled = isBenchmarkRunning;
    csvButton.disabled = isBenchmarkRunning || !monitor.hasRuns();
    jsonButton.disabled = isBenchmarkRunning || !monitor.hasRuns();
    statusEl.classList.toggle('is-error', state.phase === 'aborted');

    if (isBenchmarkRunning) {
      const phase = state.phase === 'warm-up' ? 'warm-up (not measured)' : 'measuring';
      statusEl.textContent =
        `Run ${state.step}/${state.totalSteps}: ${MODE_LABELS[state.mode]} #${state.runNumber} of ${state.runsPerMode} — ${phase}`;
    } else if (state.phase === 'completed') {
      statusEl.textContent = `Completed ${state.totalSteps} runs.`;
    } else if (state.phase === 'aborted') {
      statusEl.textContent = `Aborted: ${state.reason}. Completed runs were kept.`;
    } else {
      statusEl.textContent = '';
    }
  }

  function renderComparison(aggregates, report) {
    const header = `<tr><th>Metric</th>${MODES.map((mode) => `<th>${MODE_TABLE_LABELS[mode]}</th>`).join('')}</tr>`;
    const runCount = `<tr><th>Runs</th>${MODES.map((mode) => `<td>${monitor.results[mode].length}</td>`).join('')}</tr>`;
    const assetRow = `<tr><th>Asset Size</th>${MODES.map((mode) => `<td>${formatBytes(report.assets[mode].bytes)}</td>`).join('')}</tr>`;
    const loadRow = `<tr><th>Model Load Time</th>${MODES.map((mode) => `<td>${formatNumber(report.modelLoad[mode]?.totalMs, 1)} ms</td>`).join('')}</tr>`;

    const metricRows = COMPARISON_METRIC_KEYS.map((key) => {
      const metric = METRICS_BY_KEY[key];
      const cells = MODES.map((mode) => `<td>${formatAggregate(aggregates[mode][key], metric)}</td>`).join('');
      return `<tr><th>${metric.label}</th>${cells}</tr>`;
    }).join('');

    return `
      <table class="evaluation-table">
        <thead>${header}</thead>
        <tbody>${runCount}${assetRow}${loadRow}${metricRows}</tbody>
      </table>
      <div class="evaluation-debug">Run metrics: mean ± sample standard deviation over all runs.
      Model load time: one measurement per page load (download + parse + setup, HTTP cache bypassed).</div>`;
  }

  function renderStatistics(mode, aggregates) {
    if (monitor.results[mode].length === 0) return '';

    const rows = RUN_METRICS.map((metric) => {
      const a = aggregates[mode][metric.key];
      return `<tr><th>${metric.label}</th><td>${formatNumber(a.mean, metric.digits)}</td><td>${formatNumber(a.sd, metric.digits)}</td>` +
        `<td>${formatNumber(a.min, metric.digits)}</td><td>${formatNumber(a.max, metric.digits)}</td></tr>`;
    }).join('');

    return `
      <h4>${MODE_TABLE_LABELS[mode]} — statistics over ${monitor.results[mode].length} runs</h4>
      <table class="evaluation-table">
        <thead><tr><th>Metric</th><th>Mean</th><th>SD</th><th>Min</th><th>Max</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderRuns() {
    const runs = MODES.flatMap((mode) => monitor.results[mode]).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    if (runs.length === 0) return '<div class="evaluation-debug">No runs recorded for this sample yet.</div>';

    const header = `<tr><th>Mode</th><th>Run</th>${RUN_TABLE_KEYS.map((key) => `<th>${METRICS_BY_KEY[key].label.replace(' Frame Time', '')}</th>`).join('')}</tr>`;
    const rows = runs.map((run) =>
      `<tr><td>${MODE_LABELS[run.mode]}</td><td>${run.runNumber}</td>` +
      RUN_TABLE_KEYS.map((key) => `<td>${formatNumber(run[key], METRICS_BY_KEY[key].digits)}</td>`).join('') +
      '</tr>'
    ).join('');

    return `<table class="evaluation-table"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
  }

  function renderHeap() {
    const runs = MODES.flatMap((mode) => monitor.results[mode]).filter((run) => run.heapDebug);
    if (runs.length === 0) return '';

    const rows = runs.map((run) =>
      `<tr><td>${MODE_LABELS[run.mode]}</td><td>${run.runNumber}</td>` +
      `<td>${(run.heapDebug.startBytes / 1048576).toFixed(1)} → ${(run.heapDebug.endBytes / 1048576).toFixed(1)} MiB</td></tr>`
    ).join('');

    return `
      <h4>Optional: JS heap (browser-specific)</h4>
      <div class="evaluation-debug">performance.memory is non-standard (Chromium only) and includes the whole page.
      Debug information, not a cross-browser benchmark metric.</div>
      <table class="evaluation-table"><tbody>${rows}</tbody></table>`;
  }

  function renderAssets(report) {
    const rows = [
      ['File', (mode) => escapeHtml(report.assets[mode].file)],
      ['Size on disk', (mode) => formatBytes(report.assets[mode].bytes)],
      ['SHA-256', (mode) => `<code>${report.assets[mode].sha256.slice(0, 16)}…</code>`],
      ['Load: download', (mode) => `${formatNumber(report.modelLoad[mode]?.downloadMs, 1)} ms`],
      ['Load: parse', (mode) => `${formatNumber(report.modelLoad[mode]?.parseMs, 1)} ms`],
      ['Load: setup', (mode) => `${formatNumber(report.modelLoad[mode]?.setupMs, 1)} ms`],
      ['First render (GPU upload, shaders)', (mode) => `${formatNumber(report.modelLoad[mode]?.firstRenderMs, 1)} ms`],
      ['Vertices', (mode) => report.modelStats[mode]?.vertices.toLocaleString('en-US') ?? '—'],
      ['Triangles', (mode) => report.modelStats[mode]?.triangles.toLocaleString('en-US') ?? '—'],
      ['Morph targets', (mode) => report.modelStats[mode]?.morphTargets ?? '—'],
      ['Bones', (mode) => report.modelStats[mode]?.bones ?? '—'],
      ['Animation tracks', (mode) => report.modelStats[mode]?.animationTracks ?? '—'],
    ];

    return `
      <table class="evaluation-table">
        <thead><tr><th>Asset</th>${MODES.map((mode) => `<th>${MODE_TABLE_LABELS[mode]}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(([label, cell]) => `<tr><th>${label}</th>${MODES.map((mode) => `<td>${cell(mode)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
  }

  function render() {
    const aggregates = monitor.getAggregates();
    const report = getAssetReport();

    contentEl.innerHTML = `
      <h4>Comparison</h4>
      ${renderComparison(aggregates, report)}
      ${MODES.map((mode) => renderStatistics(mode, aggregates)).join('')}
      <h4>Individual runs</h4>
      ${renderRuns()}
      ${renderHeap()}
      <h4>Assets</h4>
      ${renderAssets(report)}`;

    csvButton.disabled = isBenchmarkRunning || !monitor.hasRuns();
    jsonButton.disabled = isBenchmarkRunning || !monitor.hasRuns();
    lastLiveUpdate = 0;
    updateLive();
  }

  render();

  return { render, updateLive, setBenchmarkState };
}
