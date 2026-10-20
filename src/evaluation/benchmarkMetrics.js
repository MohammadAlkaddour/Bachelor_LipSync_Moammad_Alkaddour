// work time is main-thread time per frame; GPU time is not included
export const RUN_METRICS = [
  { key: 'averageFps', label: 'Average FPS', unit: '', digits: 2 },
  { key: 'averageFrameTimeMs', label: 'Average Frame Time', unit: 'ms', digits: 3 },
  { key: 'medianFrameTimeMs', label: 'Median Frame Time', unit: 'ms', digits: 3 },
  { key: 'p95FrameTimeMs', label: '95th Percentile Frame Time', unit: 'ms', digits: 3 },
  { key: 'maxFrameTimeMs', label: 'Maximum Frame Time', unit: 'ms', digits: 3 },
  { key: 'minimumFps', label: 'Minimum FPS (1000 / max frame time)', unit: '', digits: 2 },
  { key: 'averageWorkTimeMs', label: 'Average Frame Work Time (main thread)', unit: 'ms', digits: 3 },
  { key: 'p95WorkTimeMs', label: '95th Percentile Frame Work Time', unit: 'ms', digits: 3 },
  { key: 'frameCount', label: 'Rendered Frames', unit: '', digits: 0 },
  { key: 'durationSeconds', label: 'Test Duration', unit: 's', digits: 3 },
];

export const RUN_METRIC_KEYS = RUN_METRICS.map((metric) => metric.key);
