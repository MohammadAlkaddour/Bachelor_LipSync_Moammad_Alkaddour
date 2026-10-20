// CSV: one row per run, comma separator, dot decimals, RFC 4180 quoting
const CSV_COLUMNS = [
  'recordedAt',
  'userAgent',
  'viewportWidth',
  'viewportHeight',
  'devicePixelRatio',
  'rendererPixelRatio',
  'drawingBufferWidth',
  'drawingBufferHeight',
  'gpuRenderer',
  'crossOriginIsolated',
  'sampleId',
  'sampleName',
  'mode',
  'runNumber',
  'audioDurationSeconds',
  'assetFile',
  'assetBytes',
  'loadTimeMs',
  'loadDownloadMs',
  'loadParseMs',
  'loadSetupMs',
  'firstRenderMs',
  'frameCount',
  'durationSeconds',
  'averageFps',
  'averageFrameTimeMs',
  'medianFrameTimeMs',
  'p95FrameTimeMs',
  'maxFrameTimeMs',
  'minimumFps',
  'averageWorkTimeMs',
  'p95WorkTimeMs',
  'browserHeapStartBytes',
  'browserHeapEndBytes',
];

export function buildRunRows(dataset) {
  const rows = [];

  for (const [mode, runs] of Object.entries(dataset.runs)) {
    const asset = dataset.assets[mode];
    const load = dataset.modelLoad[mode];

    for (const run of runs) {
      rows.push({
        recordedAt: run.recordedAt,
        userAgent: run.conditions.userAgent,
        viewportWidth: run.conditions.viewport.width,
        viewportHeight: run.conditions.viewport.height,
        devicePixelRatio: run.conditions.devicePixelRatio,
        rendererPixelRatio: run.conditions.renderer.pixelRatio,
        drawingBufferWidth: run.conditions.renderer.drawingBufferWidth,
        drawingBufferHeight: run.conditions.renderer.drawingBufferHeight,
        gpuRenderer: run.conditions.renderer.gpu,
        crossOriginIsolated: run.conditions.crossOriginIsolated,
        sampleId: run.sampleId,
        sampleName: run.sampleName,
        mode,
        runNumber: run.runNumber,
        audioDurationSeconds: run.audioDurationSeconds,
        assetFile: asset.file,
        assetBytes: asset.bytes,
        loadTimeMs: load?.totalMs,
        loadDownloadMs: load?.downloadMs,
        loadParseMs: load?.parseMs,
        loadSetupMs: load?.setupMs,
        firstRenderMs: load?.firstRenderMs,
        frameCount: run.frameCount,
        durationSeconds: run.durationSeconds,
        averageFps: run.averageFps,
        averageFrameTimeMs: run.averageFrameTimeMs,
        medianFrameTimeMs: run.medianFrameTimeMs,
        p95FrameTimeMs: run.p95FrameTimeMs,
        maxFrameTimeMs: run.maxFrameTimeMs,
        minimumFps: run.minimumFps,
        averageWorkTimeMs: run.averageWorkTimeMs,
        p95WorkTimeMs: run.p95WorkTimeMs,
        browserHeapStartBytes: run.heapDebug?.startBytes,
        browserHeapEndBytes: run.heapDebug?.endBytes,
      });
    }
  }

  return rows;
}

export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];

  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => formatCsvValue(row[column])).join(','));
  }

  return `${lines.join('\r\n')}\r\n`;
}

export function toJson(dataset) {
  return JSON.stringify(dataset, null, 2);
}

export function downloadTextFile(fileName, content, mimeType) {
  downloadBlob(fileName, new Blob([content], { type: mimeType }));
}

export function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatCsvValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Number(value.toFixed(6))) : '';

  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
