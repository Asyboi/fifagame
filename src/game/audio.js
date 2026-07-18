// ── Synthesized match audio (WebAudio, no external assets) ──────
export class MatchAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this._startCrowd();
  }

  _noiseBuffer(seconds = 2) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _startCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(4);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 620;
    filter.Q.value = 0.5;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.08;
    src.connect(filter).connect(this.crowdGain).connect(this.master);
    src.start();
    // slow murmur modulation
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(this.crowdGain.gain);
    lfo.start();
  }

  /** Swell the crowd (0..1 excitement). */
  crowdExcite(level, seconds = 2.5) {
    if (!this.ctx) return;
    const g = this.crowdGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.08 + level * 0.4, now + 0.15);
    g.linearRampToValueAtTime(0.08, now + seconds);
  }

  whistle(long = false) {
    if (!this.ctx) return;
    const blasts = long ? [0, 0.35, 0.7] : [0];
    for (const t0 of blasts) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      const now = this.ctx.currentTime + t0;
      osc.frequency.setValueAtTime(2200, now);
      osc.frequency.linearRampToValueAtTime(2350, now + 0.08);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.02);
      g.gain.linearRampToValueAtTime(0, now + (long ? 0.3 : 0.5));
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.6);
    }
  }

  kick(power = 0.6) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25 * power + 0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  goal() {
    if (!this.ctx) return;
    this.crowdExcite(1, 4.5);
    // rising cheer chord
    const now = this.ctx.currentTime;
    for (const [freq, delay] of [[392, 0], [494, 0.12], [587, 0.24]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, now + delay);
      g.gain.linearRampToValueAtTime(0.08, now + delay + 0.05);
      g.gain.linearRampToValueAtTime(0, now + delay + 0.8);
      osc.connect(g).connect(this.master);
      osc.start(now + delay);
      osc.stop(now + delay + 1);
    }
  }

  click() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.frequency.value = 880;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  setMuted(muted) {
    if (this.master) this.master.gain.value = muted ? 0 : 0.7;
    this.enabled = !muted;
  }
}
