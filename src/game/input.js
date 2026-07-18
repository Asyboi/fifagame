// Unified input: keyboard + standard gamepad -> one snapshot per frame.
// World mapping for the broadcast camera (sits at +z looking at the pitch):
// screen-right = +x, screen-up = -z. So W = -z, D = +x.

const DEADZONE = 0.18;

export function createInput(target = window) {
  const keys = new Set();
  const edge = { pass: false, shootDown: false, shootUp: false, switchPl: false, pause: false, mute: false, any: false };
  let padPrev = [];

  function onKeyDown(e) {
    if (e.repeat) { if (e.code === 'Escape') e.preventDefault(); return; }
    keys.add(e.code);
    edge.any = true;
    switch (e.code) {
      case 'KeyJ': case 'KeyZ': edge.pass = true; break;
      case 'KeyK': case 'KeyX': edge.shootDown = true; break;
      case 'KeyL': case 'KeyQ': edge.switchPl = true; break;
      case 'Escape': edge.pause = true; e.preventDefault(); break;
      case 'KeyM': edge.mute = true; break;
      default: break;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    if (e.code === 'KeyK' || e.code === 'KeyX') edge.shootUp = true;
  }
  function onBlur() { keys.clear(); }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  function pad() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) return p;
    } catch { /* no gamepad API */ }
    return null;
  }

  function readPad(p, snap) {
    const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : v);
    const ax = dz(p.axes[0] || 0); const ay = dz(p.axes[1] || 0);
    if (ax || ay) { snap.mx += ax; snap.mz += ay; snap.usingPad = true; }
    const btn = (i) => Boolean(p.buttons[i]?.pressed);
    const val = (i) => p.buttons[i]?.value || 0;
    const pressedNow = (i) => btn(i) && !padPrev[i];
    const releasedNow = (i) => !btn(i) && padPrev[i];

    if (pressedNow(0)) snap.pass = true;                    // A / cross
    if (pressedNow(2) || pressedNow(1)) snap.shootDown = true; // X/square or B/circle
    if (releasedNow(2) || releasedNow(1)) snap.shootUp = true;
    snap.shootHeld = snap.shootHeld || btn(2) || btn(1);
    if (pressedNow(4)) snap.switchPl = true;                // LB / L1
    snap.sprint = snap.sprint || btn(5) || val(7) > 0.3 || btn(7); // RB / RT
    if (pressedNow(9)) snap.pause = true;                   // Start
    // d-pad as alternate movement
    if (btn(14)) snap.mx -= 1;
    if (btn(15)) snap.mx += 1;
    if (btn(12)) snap.mz -= 1;
    if (btn(13)) snap.mz += 1;
    if (btn(0) || btn(9) || ax || ay) snap.usingPad = true;

    padPrev = p.buttons.map((b) => b.pressed);
  }

  return {
    /** Poll once per frame; consumes edges. */
    poll() {
      const snap = {
        mx: 0, mz: 0, sprint: false,
        pass: edge.pass, shootDown: edge.shootDown, shootUp: edge.shootUp,
        switchPl: edge.switchPl, pause: edge.pause, mute: edge.mute,
        shootHeld: keys.has('KeyK') || keys.has('KeyX'),
        usingPad: false,
        any: edge.any,
      };
      edge.pass = edge.shootDown = edge.shootUp = edge.switchPl = edge.pause = edge.mute = edge.any = false;

      if (keys.has('KeyD') || keys.has('ArrowRight')) snap.mx += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) snap.mx -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) snap.mz += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) snap.mz -= 1;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) snap.sprint = true;

      const p = pad();
      if (p) readPad(p, snap);

      const m = Math.hypot(snap.mx, snap.mz);
      if (m > 1) { snap.mx /= m; snap.mz /= m; }
      return snap;
    },

    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
