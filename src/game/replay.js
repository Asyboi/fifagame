// ── Goal replay: ring-buffer of transforms, played back slower ──
const BUFFER_SECONDS = 4;
const SAMPLE_HZ = 30;
const MAX_FRAMES = BUFFER_SECONDS * SAMPLE_HZ;

export class ReplayRecorder {
  constructor(players, ball) {
    this.players = players;
    this.ball = ball;
    this.frames = [];
    this._acc = 0;
    this.playing = false;
    this.playIndex = 0;
    this._playAcc = 0;
  }

  record(dt) {
    if (this.playing) return;
    this._acc += dt;
    if (this._acc < 1 / SAMPLE_HZ) return;
    this._acc = 0;
    const frame = {
      ball: { x: this.ball.pos.x, y: this.ball.pos.y, z: this.ball.pos.z },
      players: this.players.map((p) => ({
        x: p.pos.x, z: p.pos.z, facing: p.facing, state: p.state,
      })),
    };
    this.frames.push(frame);
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  start() {
    if (this.frames.length < 10) return false;
    this.playing = true;
    this.playIndex = 0;
    this._playAcc = 0;
    // snapshot live state so we can restore after playback
    this._live = {
      ball: { ...this.frames[this.frames.length - 1].ball },
    };
    return true;
  }

  /** Advance playback at half speed. Returns false when finished. */
  step(dt) {
    if (!this.playing) return false;
    this._playAcc += dt * 0.5 * SAMPLE_HZ;
    this.playIndex = Math.floor(this._playAcc);
    if (this.playIndex >= this.frames.length) {
      this.playing = false;
      return false;
    }
    const f = this.frames[this.playIndex];
    this.ball.pos.set(f.ball.x, f.ball.y, f.ball.z);
    this.ball.vel.set(0, 0, 0);
    this.ball.sync();
    f.players.forEach((pf, i) => {
      const p = this.players[i];
      p.pos.set(pf.x, 0, pf.z);
      p.facing = pf.facing;
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = -pf.facing + Math.PI / 2;
    });
    return true;
  }

  clear() {
    this.frames.length = 0;
    this.playing = false;
  }
}
