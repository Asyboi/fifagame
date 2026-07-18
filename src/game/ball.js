// ── Ball physics: gravity, drag, bounce, spin-lite ──────────────
import * as THREE from 'three';

const GRAVITY = -22;
const GROUND_FRICTION = 0.985;
const AIR_DRAG = 0.998;
const BOUNCE = 0.55;
const RADIUS = 0.11;

export class Ball {
  constructor(scene) {
    this.radius = RADIUS;
    this.pos = new THREE.Vector3(0, RADIUS, 0);
    this.vel = new THREE.Vector3();
    this.owner = null;          // player currently dribbling
    this.lastTouch = null;      // player who last touched
    this.lastTouchTeam = null;

    const geo = new THREE.IcosahedronGeometry(RADIUS, 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    // panel-ish darker patches for visible rolling
    const patchGeo = new THREE.CircleGeometry(RADIUS * 0.38, 5);
    const patchMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    for (let i = 0; i < 6; i++) {
      const patch = new THREE.Mesh(patchGeo, patchMat);
      const dir = new THREE.Vector3().randomDirection();
      patch.position.copy(dir.clone().multiplyScalar(RADIUS * 0.995));
      patch.lookAt(dir.multiplyScalar(2));
      this.mesh.add(patch);
    }
    scene.add(this.mesh);
    this._spinAxis = new THREE.Vector3(1, 0, 0);
  }

  /** Kick the ball: dir (normalized-ish Vector3), speed m/s, loft 0..1 */
  kick(dir, speed, loft = 0, byPlayer = null) {
    this.vel.set(dir.x, 0, dir.z).normalize().multiplyScalar(speed);
    this.vel.y = speed * loft;
    this.owner = null;
    if (byPlayer) this.touch(byPlayer);
  }

  touch(player) {
    this.lastTouch = player;
    this.lastTouchTeam = player.teamSide;
  }

  /** Place ball and stop it (kickoffs / restarts). */
  place(x, y, z) {
    this.pos.set(x, Math.max(y, RADIUS), z);
    this.vel.set(0, 0, 0);
    this.owner = null;
    this.sync();
  }

  update(dt) {
    if (this.owner) {
      // Dribbling: the owning player positions the ball; just sync visuals.
      this.sync(dt);
      return;
    }
    this.vel.y += GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);

    if (this.pos.y <= RADIUS) {
      this.pos.y = RADIUS;
      if (this.vel.y < 0) this.vel.y = -this.vel.y * BOUNCE;
      if (Math.abs(this.vel.y) < 0.8) this.vel.y = 0;
      this.vel.x *= GROUND_FRICTION;
      this.vel.z *= GROUND_FRICTION;
      // rolling resistance
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed < 0.15) this.vel.set(0, this.vel.y, 0);
      else {
        const decel = 3.2 * dt;
        const k = Math.max(0, speed - decel) / speed;
        this.vel.x *= k;
        this.vel.z *= k;
      }
    } else {
      this.vel.multiplyScalar(AIR_DRAG);
    }
    this.sync(dt);
  }

  sync(dt = 0) {
    this.mesh.position.copy(this.pos);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.05 && dt > 0) {
      this._spinAxis.set(this.vel.z, 0, -this.vel.x).normalize();
      this.mesh.rotateOnWorldAxis(this._spinAxis, (speed / RADIUS) * dt);
    }
  }

  get speed() {
    return this.vel.length();
  }
}
