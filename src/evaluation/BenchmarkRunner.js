export class BenchmarkRunner {
  constructor({ monitor, audio, activateMode, resetTestState, captureConditions, getRunContext, onStateChange }) {
    this.monitor = monitor;
    this.audio = audio;
    this.activateMode = activateMode;
    this.resetTestState = resetTestState;
    this.captureConditions = captureConditions;
    this.getRunContext = getRunContext;
    this.onStateChange = onStateChange;

    this.isRunning = false;
    this.abortReason = null;

    this.rejectPending = null;

    this.state = { phase: 'idle' };
  }

  async run(modes, { benchmarkRuns, warmUpMs, settleMs }) {
    if (this.isRunning) return false;

    this.isRunning = true;
    this.abortReason = null;

    // interleave modes (A, B, A, B, ...) so slow drifts affect both equally
    const schedule = [];
    for (let runNumber = 1; runNumber <= benchmarkRuns; runNumber++) {
      for (const mode of modes) schedule.push({ mode, runNumber });
    }

    const onResize = () => this.abort('window was resized');
    const onVisibility = () => {
      if (document.hidden) this.abort('tab was hidden');
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    const warmedUpModes = new Set();
    let reference = null;
    let completed = false;

    try {
      for (const [index, { mode, runNumber }] of schedule.entries()) {
        const progress = { mode, runNumber, runsPerMode: benchmarkRuns, step: index + 1, totalSteps: schedule.length };

        this.setState({ phase: 'warm-up', ...progress });
        this.activateMode(mode);
        // warm-up and settle time is rendered but not measured
        await this.wait(warmedUpModes.has(mode) ? settleMs : warmUpMs + settleMs);
        warmedUpModes.add(mode);

        const conditions = this.captureConditions();
        reference ??= conditions;
        this.assertConditions(reference, conditions);

        this.resetTestState();
        this.monitor.start(mode, this.getRunContext(mode, runNumber, conditions));
        this.setState({ phase: 'measuring', ...progress });

        await this.playToEnd();

        this.assertConditions(reference, this.captureConditions());
        const result = this.monitor.stop();
        console.log(`Benchmark run ${index + 1}/${schedule.length} (${mode} #${runNumber}):`, result);
      }

      completed = true;
      this.setState({ phase: 'completed', totalSteps: schedule.length });
    } catch (error) {
      this.monitor.abort();
      const reason = this.abortReason ?? error.message;
      console.warn(`Benchmark aborted: ${reason}`);
      this.setState({ phase: 'aborted', reason });
    } finally {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      this.rejectPending = null;
      this.resetTestState();
      this.isRunning = false;
    }

    return completed;
  }

  abort(reason) {
    if (!this.isRunning || this.abortReason) return;

    this.abortReason = reason;
    this.rejectPending?.(new Error(reason));
    this.audio.pause();
  }

  setState(state) {
    this.state = state;
    this.onStateChange?.(state);
  }

  wait(ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rejectPending = null;
        resolve();
      }, ms);

      this.rejectPending = (error) => {
        clearTimeout(timer);
        reject(error);
      };
    });
  }

  playToEnd() {
    const audio = this.audio;

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('error', onError);
        this.rejectPending = null;
      };
      const fail = (error) => {
        cleanup();
        reject(error);
      };
      const onEnded = () => {
        cleanup();
        resolve();
      };
      // 'pause' also fires at the end, only an earlier pause invalidates the run
      const onPause = () => {
        if (!audio.ended) fail(new Error('playback was paused'));
      };
      const onError = () => fail(new Error('audio playback error'));

      audio.addEventListener('ended', onEnded);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('error', onError);
      this.rejectPending = fail;

      audio.play().catch((error) => fail(new Error(`audio could not start (${error.message})`)));
    });
  }

  assertConditions(reference, current) {
    for (const key of Object.keys(reference)) {
      if (JSON.stringify(reference[key]) !== JSON.stringify(current[key])) {
        throw new Error(`test condition changed: ${key}`);
      }
    }
  }
}
