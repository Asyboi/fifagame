// ── Unified input: keyboard + Gamepad API (Xbox/PS layout) ──────
// Produces a per-frame snapshot: move vector, sprint, and edge events
// (pass, through, shootRelease{power}, tackle, switch, skill, pause).

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'pass',
  KeyE: 'through',
  KeyF: 'shoot',
  KeyR: 'tackle',
  KeyQ: 'switch', Tab: 'switch',
  KeyC: 'skill',
  Escape: 'pause', KeyP: 'pause',
};

// standard-mapping gamepad buttons
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9 };

const SHOOT_CHARGE_TIME = 0.9; // seconds to full power

export class Input {
  constructor() {
    this.keys = new Set();
    this.prevButtons = {};
    this.shootHeld = 0;
    this._events = [];
    this.gamepadConnected = false;

    const inFormField = (e) =>
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);

    window.addEventListener('keydown', (e) => {
      const action = KEYMAP[e.code];
      if (!action || inFormField(e)) return;
      e.preventDefault();
      if (!this.keys.has(e.code)) this._edge(action, true);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      const action = KEYMAP[e.code];
      if (!action || inFormField(e)) return;
      e.preventDefault();
      this.keys.delete(e.code);
      this._edge(action, false);
    });
    window.addEventListener('gamepadconnected', () => (this.gamepadConnected = true));
    window.addEventListener('gamepaddisconnected', () => (this.gamepadConnected = false));
  }

  _edge(action, down) {
    if (down) {
      if (action === 'shoot') this._shootDown = true;
      else if (['pass', 'through', 'tackle', 'switch', 'skill', 'pause'].includes(action)) {
        this._events.push({ type: action });
      }
    } else if (action === 'shoot' && this._shootDown) {
      this._shootDown = false;
      this._events.push({ type: 'shootRelease', power: Math.min(1, this.shootHeld / SHOOT_CHARGE_TIME) });
      this.shootHeld = 0;
    }
  }

  _keyActive(action) {
    for (const code of this.keys) if (KEYMAP[code] === action) return true;
    return false;
  }

  /** Poll once per frame. Returns { move:{x,z}, sprint, shootCharge, events[] } */
  poll(dt) {
    let x = 0, z = 0;
    if (this._keyActive('left')) x -= 1;
    if (this._keyActive('right')) x += 1;
    if (this._keyActive('up')) z -= 1;
    if (this._keyActive('down')) z += 1;
    let sprint = this._keyActive('sprint');
    let shootHeldNow = !!this._shootDown;

    // ── gamepad ──
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected && p.mapping === 'standard') ||
      [...pads].find((p) => p && p.connected);
    if (pad) {
      this.gamepadConnected = true;
      const dz = (v) => (Math.abs(v) > 0.18 ? v : 0);
      const gx = dz(pad.axes[0] ?? 0);
      const gy = dz(pad.axes[1] ?? 0);
      if (Math.abs(gx) + Math.abs(gy) > 0.05) {
        x = gx;
        z = gy;
      }
      // dpad
      if (pad.buttons[12]?.pressed) z = -1;
      if (pad.buttons[13]?.pressed) z = 1;
      if (pad.buttons[14]?.pressed) x = -1;
      if (pad.buttons[15]?.pressed) x = 1;

      const pressed = (i) => !!pad.buttons[i]?.pressed;
      const just = (name, i) => {
        const now = pressed(i);
        const was = !!this.prevButtons[name];
        this.prevButtons[name] = now;
        return now && !was;
      };
      const justReleased = (name, i) => {
        const now = pressed(i);
        const was = !!this.prevButtons[name];
        this.prevButtons[name] = now;
        return !now && was;
      };

      if (just('A', PAD.A)) this._events.push({ type: 'pass' });
      if (just('Y', PAD.Y)) this._events.push({ type: 'through' });
      if (just('X', PAD.X)) this._events.push({ type: 'tackle' });
      if (just('LB', PAD.LB)) this._events.push({ type: 'switch' });
      if (just('LT', PAD.LT)) this._events.push({ type: 'skill' });
      if (just('START', PAD.START)) this._events.push({ type: 'pause' });

      if (pressed(PAD.B)) {
        this._padShoot = true;
        shootHeldNow = true;
      } else if (justReleased('B', PAD.B) || (this._padShoot && !pressed(PAD.B))) {
        this._padShoot = false;
        this._events.push({
          type: 'shootRelease',
          power: Math.min(1, this.shootHeld / SHOOT_CHARGE_TIME),
        });
        this.shootHeld = 0;
      }
      if (pressed(PAD.RT)) sprint = true;
    }

    if (shootHeldNow) this.shootHeld += dt;

    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    const events = this._events;
    this._events = [];
    return {
      move: { x, z },
      sprint,
      shootCharge: shootHeldNow ? Math.min(1, this.shootHeld / SHOOT_CHARGE_TIME) : 0,
      events,
    };
  }
}
