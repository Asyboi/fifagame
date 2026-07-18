// ── Player entity: movement, procedural animation, ball actions ──
import * as THREE from 'three';
import { buildPlayerMesh } from './playerMesh.js';
import { MATCH } from '../config.js';
import { clampToPitch } from './rules.js';

const TURN_RATE = 11;      // rad/s facing interpolation
const ACCEL = 26;

let nextId = 1;

export class Player {
  /**
   * def: { name, number, role, teamSide('home'|'away'), team, isUser, isGK,
   *        skinTone, hairStyle, hairColor, faceTexture, homeSpot:{x,z} }
   */
  constructor(scene, def) {
    this.id = nextId++;
    Object.assign(this, {
      name: def.name, number: def.number, role: def.role,
      teamSide: def.teamSide, team: def.team,
      isUser: !!def.isUser, isGK: def.role === 'GK',
    });
    this.homeSpot = { ...def.homeSpot };

    this.pos = new THREE.Vector3(def.homeSpot.x, 0, def.homeSpot.z);
    this.vel = new THREE.Vector3();
    this.facing = def.teamSide === 'home' ? 0 : Math.PI; // yaw, 0 => +x
    this.moveTarget = new THREE.Vector3().copy(this.pos);
    this.desiredSpeed = 0;

    this.state = 'idle';       // idle|run|pass|shoot|tackle|celebrate|dive
    this.stateTime = 0;
    this.animPhase = Math.random() * Math.PI * 2;
    this.controlCooldown = 0;  // can't re-take ball right after kicking
    this.tackleCooldown = 0;
    this.stunned = 0;

    const kitColor = this.isGK ? def.team.gk : def.team.kit;
    const built = buildPlayerMesh({
      kitColor,
      kit2Color: def.team.kit2,
      skinTone: def.skinTone,
      hairStyle: def.hairStyle,
      hairColor: def.hairColor,
      number: def.number,
      faceTexture: def.faceTexture ?? null,
    });
    this.mesh = built.root;
    this.parts = built.parts;
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get maxSpeed() {
    const base = this.isUser ? 1 : MATCH.aiSpeedFactor[this.difficulty ?? 'normal'];
    return MATCH.runSpeed * base;
  }

  get sprintMax() {
    const base = this.isUser ? 1 : MATCH.aiSpeedFactor[this.difficulty ?? 'normal'];
    return MATCH.sprintSpeed * base;
  }

  forward() {
    return new THREE.Vector3(Math.cos(this.facing), 0, Math.sin(this.facing));
  }

  /** Steer toward a direction (unit-ish Vector3) at speed. Called each frame. */
  steer(dir, speed) {
    this.desiredSpeed = speed;
    if (dir.lengthSq() > 0.0001) {
      this._desiredDir = dir.clone().normalize();
    } else {
      this._desiredDir = null;
      this.desiredSpeed = 0;
    }
  }

  seek(target, speed) {
    const d = new THREE.Vector3().subVectors(target, this.pos);
    d.y = 0;
    if (d.length() < 0.25) {
      this.steer(new THREE.Vector3(), 0);
    } else {
      this.steer(d, speed);
    }
  }

  setState(s, lock = 0) {
    this.state = s;
    this.stateTime = 0;
    this._stateLock = lock;
  }

  get busy() {
    return this._stateLock > 0;
  }

  update(dt, ball) {
    this.stateTime += dt;
    this._stateLock = Math.max(0, (this._stateLock ?? 0) - dt);
    this.controlCooldown = Math.max(0, this.controlCooldown - dt);
    this.tackleCooldown = Math.max(0, this.tackleCooldown - dt);
    this.stunned = Math.max(0, this.stunned - dt);

    // movement integration
    const canMove = this.stunned <= 0 && this.state !== 'tackle' && this.state !== 'dive';
    const desired = new THREE.Vector3();
    if (canMove && this._desiredDir && this.desiredSpeed > 0) {
      desired.copy(this._desiredDir).multiplyScalar(this.desiredSpeed);
    }
    if (this.state === 'tackle') {
      // slide keeps momentum, decaying
      this.vel.multiplyScalar(1 - 2.4 * dt);
    } else {
      const dv = desired.sub(this.vel);
      const maxDv = ACCEL * dt;
      if (dv.length() > maxDv) dv.setLength(maxDv);
      this.vel.add(dv);
    }
    this.pos.addScaledVector(this.vel, dt);
    const c = clampToPitch(this.pos, -1.5); // small overrun allowed
    this.pos.x = c.x;
    this.pos.z = c.z;

    // facing
    let targetYaw = this.facing;
    if (this.speed > 0.4) targetYaw = Math.atan2(this.vel.z, this.vel.x);
    else if (ball && !this.busy) {
      const toBall = new THREE.Vector3().subVectors(ball.pos, this.pos);
      if (toBall.lengthSq() > 0.5) targetYaw = Math.atan2(toBall.z, toBall.x);
    }
    let dy = targetYaw - this.facing;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.facing += THREE.MathUtils.clamp(dy, -TURN_RATE * dt, TURN_RATE * dt);

    // dribble: carry ball ahead of feet
    if (ball && ball.owner === this) {
      const lead = MATCH.dribbleLead * (0.7 + 0.3 * (this.speed / this.sprintMax));
      const f = this.forward();
      ball.pos.set(this.pos.x + f.x * lead * 0.45, ball.radius, this.pos.z + f.z * lead * 0.45);
      ball.vel.copy(this.vel);
      ball.touch(this);
    }

    this.animate(dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = -this.facing + Math.PI / 2;
  }

  // ── procedural animation ──────────────────────────────────────
  animate(dt) {
    const p = this.parts;
    const speedRatio = Math.min(1, this.speed / this.sprintMax);
    this.animPhase += dt * (4 + 14 * speedRatio);
    const swing = Math.sin(this.animPhase) * (0.15 + 0.85 * speedRatio);

    const lerp = (obj, x, k = 12) => {
      obj.rotation.x += (x - obj.rotation.x) * Math.min(1, k * dt);
    };

    switch (this.state) {
      case 'pass':
      case 'shoot': {
        const t = Math.min(1, this.stateTime / 0.3);
        const kick = Math.sin(t * Math.PI) * (this.state === 'shoot' ? 1.9 : 1.2);
        lerp(p.legR, -kick, 22);
        lerp(p.legL, kick * 0.3, 22);
        lerp(p.armL, kick * 0.5, 18);
        lerp(p.armR, -kick * 0.5, 18);
        if (t >= 1) this.setState(this.speed > 0.5 ? 'run' : 'idle');
        break;
      }
      case 'tackle': {
        const t = Math.min(1, this.stateTime / 0.55);
        this.mesh.rotation.x = -1.15 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5);
        lerp(p.legR, -1.3, 20);
        lerp(p.legL, 0.4, 20);
        if (t >= 1) {
          this.mesh.rotation.x = 0;
          this.setState('idle');
        }
        break;
      }
      case 'dive': {
        const t = Math.min(1, this.stateTime / 0.6);
        this.mesh.rotation.z = (this._diveDir ?? 1) * 1.3 * Math.sin(t * Math.PI * 0.5);
        lerp(p.armL, -2.6, 16);
        lerp(p.armR, -2.6, 16);
        if (this.stateTime > 1.1) {
          this.mesh.rotation.z = 0;
          this.setState('idle');
        }
        break;
      }
      case 'celebrate': {
        const j = Math.abs(Math.sin(this.stateTime * 7));
        this.mesh.position.y = j * 0.28;
        lerp(p.armL, -2.9, 14);
        lerp(p.armR, -2.9, 14);
        lerp(p.legL, 0, 14);
        lerp(p.legR, 0, 14);
        return; // keep custom y offset
      }
      default: {
        // idle / run cycle
        lerp(p.legL, swing);
        lerp(p.legR, -swing);
        lerp(p.armL, -swing * 0.8);
        lerp(p.armR, swing * 0.8);
        this.mesh.rotation.x = speedRatio * 0.12; // slight forward lean
        const bob = Math.abs(Math.sin(this.animPhase)) * 0.04 * speedRatio;
        this.mesh.position.y = bob;
      }
    }
    if (this.state !== 'celebrate') this.mesh.position.y = this.mesh.position.y || 0;
  }

  // ── ball actions ──────────────────────────────────────────────
  canControl(ball) {
    return (
      this.controlCooldown <= 0 &&
      this.stunned <= 0 &&
      ball.pos.distanceTo(this.pos) < MATCH.controlRadius &&
      ball.pos.y < 1.4
    );
  }

  kickBall(ball, dir, speed, loft = 0, anim = 'pass') {
    ball.owner = null;
    ball.kick(dir, speed, loft, this);
    this.controlCooldown = 0.45;
    this.setState(anim, 0.3);
  }

  startTackle() {
    if (this.tackleCooldown > 0 || this.busy) return false;
    this.setState('tackle', 0.55);
    this.tackleCooldown = 1.4;
    const f = this.forward();
    this.vel.copy(f).multiplyScalar(Math.max(this.speed, 6.5) * 1.25);
    return true;
  }

  dive(dirZ) {
    this._diveDir = Math.sign(dirZ) || 1;
    this.setState('dive', 1.1);
    this.vel.set(0, 0, dirZ * 7);
  }

  celebrate() {
    this.setState('celebrate', 3);
  }

  resetToHome() {
    this.pos.set(this.homeSpot.x, 0, this.homeSpot.z);
    this.vel.set(0, 0, 0);
    this._desiredDir = null;
    this.desiredSpeed = 0;
    this.mesh.rotation.set(0, 0, 0);
    this.facing = this.team.attackDir > 0 ? 0 : Math.PI;
    this.setState('idle');
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = -this.facing + Math.PI / 2;
  }
}
