// Procedural match audio — WebAudio only, no files.
// Crowd bed (filtered noise) swells with excitement; whistle, kicks, post clang,
// goal cheer, UI blips. Mute persisted to localStorage.

export function createAudio() {
  let ctx = null;
  let master = null;
  let bed = null;
  let bedGain = null;
  let bedFilter = null;
  let muted = false;
  try { muted = localStorage.getItem('wsc-muted') === '1'; } catch { /* private mode */ }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function startBed() {
    if (!ensure() || bed) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3);
    src.loop = true;
    bedFilter = ctx.createBiquadFilter();
    bedFilter.type = 'bandpass';
    bedFilter.frequency.value = 420;
    bedFilter.Q.value = 0.6;
    bedGain = ctx.createGain();
    bedGain.gain.value = 0.05;
    src.connect(bedFilter).connect(bedGain).connect(master);
    src.start();
    bed = src;
  }

  function stopBed() {
    try { bed?.stop(); } catch { /* already stopped */ }
    bed = null;
  }

  function tone({ freq = 440, type = 'sine', t0 = 0, dur = 0.15, vol = 0.2, slideTo = null, curve = 'exp' }) {
    if (!ensure()) return;
    const now = ctx.currentTime + t0;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    g.gain.setValueAtTime(vol, now);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    else g.gain.linearRampToValueAtTime(0, now + dur);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  function noise({ t0 = 0, dur = 0.2, vol = 0.3, freq = 800, q = 1, type = 'bandpass' }) {
    if (!ensure()) return;
    const now = ctx.currentTime + t0;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(Math.max(0.3, dur));
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f).connect(g).connect(master);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  return {
    ensure,

    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('wsc-muted', m ? '1' : '0'); } catch { /* ignore */ }
      if (master) master.gain.value = m ? 0 : 0.9;
    },
    toggleMuted() { this.setMuted(!muted); return muted; },

    startBed,
    stopBed,

    /** 0..1 — opens the crowd filter and lifts the bed. */
    setExcitement(x) {
      if (!bedGain || !ctx) return;
      const t = ctx.currentTime;
      bedGain.gain.setTargetAtTime(0.04 + x * 0.11, t, 0.25);
      bedFilter.frequency.setTargetAtTime(380 + x * 700, t, 0.3);
    },

    whistle(blasts = 1) {
      for (let i = 0; i < blasts; i++) {
        const t0 = i * 0.35;
        tone({ freq: 2350, type: 'square', t0, dur: 0.28, vol: 0.12 });
        tone({ freq: 2600, type: 'sine', t0, dur: 0.28, vol: 0.1, slideTo: 2300 });
      }
    },

    kick(power = 0.5) {
      tone({ freq: 130 + power * 40, type: 'sine', dur: 0.1 + power * 0.06, vol: 0.25 + power * 0.2, slideTo: 45 });
      noise({ dur: 0.06, vol: 0.12 + power * 0.1, freq: 900, q: 0.8 });
    },

    thud() {
      tone({ freq: 85, type: 'sine', dur: 0.09, vol: 0.2, slideTo: 40 });
    },

    post() {
      tone({ freq: 640, type: 'square', dur: 0.4, vol: 0.1 });
      tone({ freq: 955, type: 'sine', dur: 0.5, vol: 0.08 });
    },

    cheer(big = 1) {
      noise({ dur: 2.4, vol: 0.5 * big, freq: 700, q: 0.4, type: 'lowpass' });
      noise({ t0: 0.1, dur: 1.8, vol: 0.3 * big, freq: 1400, q: 0.7 });
      tone({ freq: 523, type: 'triangle', t0: 0.05, dur: 0.5, vol: 0.06 });
      tone({ freq: 659, type: 'triangle', t0: 0.2, dur: 0.5, vol: 0.06 });
      tone({ freq: 784, type: 'triangle', t0: 0.35, dur: 0.7, vol: 0.06 });
    },

    groan() {
      noise({ dur: 1.2, vol: 0.25, freq: 300, q: 0.6, type: 'lowpass' });
    },

    ui() {
      tone({ freq: 880, type: 'sine', dur: 0.07, vol: 0.12 });
    },

    count(final = false) {
      tone({ freq: final ? 1320 : 660, type: 'sine', dur: final ? 0.4 : 0.12, vol: 0.15 });
    },
  };
}
