import { RUN_METRIC_KEYS } from './benchmarkMetrics.js';
import { aggregateRuns, computeRunStatistics } from './statistics.js';

function createEmptyResults() {
  return { shapeKeys: [], poseFrames: [] };
}

// rAF is capped at the display refresh rate, so FPS cannot exceed it
export class EvaluationMonitor {
  constructor() {
    // kept per sample so statistics never mix samples
    this.resultsBySample = {};

    this.results = createEmptyResults();

    this.isRunning = false;

    this.currentRun = null;

    this.previousTimestamp = null;

    // smoothed, only for the live display
    this.currentFps = 0;
  }

  recordFrame(timestamp) {
    if (this.previousTimestamp !== null) {
      const frameTime = timestamp - this.previousTimestamp;

      if (frameTime > 0) {
        const instantFps = 1000 / frameTime;
        this.currentFps =
          this.currentFps === 0 ? instantFps : this.currentFps * 0.9 + instantFps * 0.1;
      }

      if (this.isRunning) {
        this.currentRun.frameTimes.push(frameTime);
      }
    }

    this.previousTimestamp = timestamp;
  }

  recordWorkTime(durationMs) {
    if (this.isRunning) {
      this.currentRun.workTimes.push(durationMs);
    }
  }

  setSample(sampleId) {
    this.resultsBySample[sampleId] ??= createEmptyResults();
    this.results = this.resultsBySample[sampleId];
  }

  clearRuns(modes) {
    for (const mode of modes) {
      this.results[mode] = [];
    }
  }

  hasRuns() {
    return Object.values(this.results).some((runs) => runs.length > 0);
  }

  start(mode, context) {
    this.currentRun = {
      mode,
      context,
      resultsTarget: this.results,
      frameTimes: [],
      workTimes: [],
      startTimestamp: performance.now(),
      heapStartBytes: readHeapBytes(),
    };
    this.isRunning = true;
  }

  stop() {
    if (!this.isRunning) {
      return null;
    }

    const run = this.currentRun;
    const heapEndBytes = readHeapBytes();

    const result = {
      mode: run.mode,
      ...run.context,
      recordedAt: new Date().toISOString(),
      durationSeconds: (performance.now() - run.startTimestamp) / 1000,
      ...computeRunStatistics(run.frameTimes, run.workTimes),
      heapDebug:
        run.heapStartBytes !== null && heapEndBytes !== null
          ? { startBytes: run.heapStartBytes, endBytes: heapEndBytes }
          : null,
      frameTimesMs: run.frameTimes,
      workTimesMs: run.workTimes,
    };

    run.resultsTarget[run.mode].push(result);
    this.isRunning = false;
    this.currentRun = null;

    return result;
  }

  abort() {
    this.isRunning = false;
    this.currentRun = null;
  }

  getAggregates() {
    return Object.fromEntries(
      Object.entries(this.results).map(([mode, runs]) => [mode, aggregateRuns(runs, RUN_METRIC_KEYS)])
    );
  }
}

// performance.memory is Chromium-only; debug info, not a benchmark metric
function readHeapBytes() {
  const memory = performance.memory;
  return memory && typeof memory.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
}
