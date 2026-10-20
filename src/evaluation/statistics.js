export function mean(values) {
  if (values.length === 0) return null;

  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

// sample standard deviation (n - 1)
export function standardDeviation(values) {
  if (values.length < 2) return null;

  const average = mean(values);
  let squares = 0;
  for (const value of values) squares += (value - average) ** 2;
  return Math.sqrt(squares / (values.length - 1));
}

export function minimum(values) {
  return values.length === 0 ? null : values.reduce((a, b) => Math.min(a, b));
}

export function maximum(values) {
  return values.length === 0 ? null : values.reduce((a, b) => Math.max(a, b));
}

// expects ascending values; linear interpolation like numpy.percentile
export function percentile(sortedValues, p) {
  const n = sortedValues.length;
  if (n === 0) return null;

  const rank = (p / 100) * (n - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const fraction = rank - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * fraction;
}

export function computeRunStatistics(frameTimes, workTimes) {
  const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);
  const sortedWorkTimes = [...workTimes].sort((a, b) => a - b);
  const averageFrameTime = mean(frameTimes);
  const maxFrameTime = maximum(frameTimes);

  return {
    frameCount: frameTimes.length,
    averageFps: averageFrameTime ? 1000 / averageFrameTime : null,
    averageFrameTimeMs: averageFrameTime,
    medianFrameTimeMs: percentile(sortedFrameTimes, 50),
    p95FrameTimeMs: percentile(sortedFrameTimes, 95),
    maxFrameTimeMs: maxFrameTime,
    minimumFps: maxFrameTime ? 1000 / maxFrameTime : null,
    averageWorkTimeMs: mean(workTimes),
    p95WorkTimeMs: percentile(sortedWorkTimes, 95),
  };
}

export function aggregateRuns(runs, metricKeys) {
  const aggregates = {};

  for (const key of metricKeys) {
    const values = runs.map((run) => run[key]).filter((value) => typeof value === 'number');

    aggregates[key] = {
      n: values.length,
      mean: mean(values),
      sd: standardDeviation(values),
      min: minimum(values),
      max: maximum(values),
    };
  }

  return aggregates;
}
