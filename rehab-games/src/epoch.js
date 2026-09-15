/**
 * Cue-locked epoch scheduler for a motor-imagery paradigm.
 *
 * The movement is open-loop: it happens at a fixed latency after the cue
 * whether or not the patient imagined anything. Nothing here reads input, and
 * nothing can fail — the scheduler's only job is to run the timeline to the
 * millisecond and emit markers at the phase boundaries.
 */

export const DEFAULT_TIMING = {
  rest: 2.0,     // baseline, both hands still
  cue: 0.5,      // side revealed — the event of interest
  flex: 1.5,     // hand closes
  hold: 2.5,     // fist held closed
  extend: 1.5,   // hand opens
  iti: 4.0,      // inter-trial rest
};

export const PHASES = ['rest', 'cue', 'flex', 'hold', 'extend', 'iti'];

/**
 * Balanced randomisation: equal left/right counts, shuffled within blocks of
 * four so no long run of one side occurs and the totals stay matched even if
 * the session is stopped early.
 */
export function balancedSides(trials, rng = Math.random) {
  const out = [];
  const blocks = Math.ceil(trials / 4);
  for (let b = 0; b < blocks; b++) {
    const block = ['left', 'left', 'right', 'right'];
    for (let i = block.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [block[i], block[j]] = [block[j], block[i]];
    }
    out.push(...block);
  }
  return out.slice(0, trials);
}

export class MarkerSink {
  constructor({ url = '', onStatus = () => {} } = {}) {
    this.rows = [];
    this.socket = null;
    this.onStatus = onStatus;
    this.t0 = performance.now();
    if (url) this.connect(url);
  }

  connect(url) {
    try {
      this.socket = new WebSocket(url);
      this.socket.onopen = () => this.onStatus('connected');
      this.socket.onerror = () => this.onStatus('error');
      this.socket.onclose = () => { this.socket = null; this.onStatus('closed'); };
      this.onStatus('connecting');
    } catch (e) {
      this.onStatus('error');
    }
  }

  /**
   * Stamp at the moment of the rAF callback that will draw the change. There
   * is still compositor and display latency after this point — the photodiode
   * patch is what tells you how much.
   */
  emit(label, extra = {}) {
    const row = {
      label,
      t_perf_ms: +(performance.now()).toFixed(3),
      t_session_ms: +(performance.now() - this.t0).toFixed(3),
      t_unix_ms: Date.now(),
      ...extra,
    };
    this.rows.push(row);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify(row)); } catch (e) { /* keep running */ }
    }
    return row;
  }

  toCSV() {
    if (!this.rows.length) return '';
    const cols = [...this.rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set())];
    const esc = (v) => (v === undefined || v === null ? '' : String(v));
    return [cols.join(','), ...this.rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  }

  download(name = 'markers.csv') {
    const blob = new Blob([this.toCSV()], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}

export class EpochScheduler {
  constructor({
    timing = DEFAULT_TIMING,
    trials = 40,
    restJitter = 0.4,   // +/- seconds, breaks temporal entrainment in the EEG
    itiJitter = 1.0,
    markers,
    onPhase = () => {},
    onTrial = () => {},
    onFinish = () => {},
    rng = Math.random,
  } = {}) {
    this.timing = { ...DEFAULT_TIMING, ...timing };
    this.trials = trials;
    this.restJitter = restJitter;
    this.itiJitter = itiJitter;
    this.markers = markers;
    this.onPhase = onPhase;
    this.onTrial = onTrial;
    this.onFinish = onFinish;
    this.rng = rng;
    this.sides = balancedSides(trials, rng);
    this.running = false;
    this.trial = -1;
    this.phaseIndex = 0;
    this.phaseTime = 0;
    this.phaseLength = 0;
    this.side = 'left';
    this.curl = 0;
  }

  get phase() { return PHASES[this.phaseIndex]; }
  get phaseProgress() { return this.phaseLength > 0 ? Math.min(1, this.phaseTime / this.phaseLength) : 1; }

  lengthOf(phase) {
    const base = this.timing[phase];
    if (phase === 'rest') return base + (this.rng() * 2 - 1) * this.restJitter;
    if (phase === 'iti') return base + (this.rng() * 2 - 1) * this.itiJitter;
    return base;
  }

  start() {
    this.running = true;
    this.trial = 0;
    this.side = this.sides[0];
    this.markers?.emit('session_start', { trials: this.trials, timing: JSON.stringify(this.timing) });
    this.onTrial(0, this.side);
    this.enter(0);
  }

  enter(index) {
    this.phaseIndex = index;
    this.phaseTime = 0;
    this.phaseLength = this.lengthOf(this.phase);
    const label = this.phase === 'cue' ? `cue_${this.side}` : this.phase;
    this.markers?.emit(label, {
      trial: this.trial + 1, side: this.side, phase: this.phase,
      planned_ms: +(this.phaseLength * 1000).toFixed(1),
    });
    this.onPhase(this.phase, { side: this.side, trial: this.trial, length: this.phaseLength });
  }

  update(dt) {
    if (!this.running) return;
    this.phaseTime += dt;

    // Curl is derived from the timeline, never from input. Match the easing to
    // the FES/orthosis ramp so the virtual and physical hands stay congruent.
    const p = this.phaseProgress;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    if (this.phase === 'flex') this.curl = ease(p);
    else if (this.phase === 'hold') this.curl = 1;
    else if (this.phase === 'extend') this.curl = 1 - ease(p);
    else this.curl = 0;

    if (this.phaseTime >= this.phaseLength) {
      if (this.phaseIndex < PHASES.length - 1) {
        this.enter(this.phaseIndex + 1);
      } else {
        this.trial += 1;
        if (this.trial >= this.trials) {
          this.running = false;
          this.markers?.emit('session_end', { trials_completed: this.trial });
          this.onFinish();
          return;
        }
        this.side = this.sides[this.trial];
        this.onTrial(this.trial, this.side);
        this.enter(0);
      }
    }
  }
}
