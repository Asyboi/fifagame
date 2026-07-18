// ── Broadcast camera: elevated sideline follow with lookahead ───
import * as THREE from 'three';
import { PITCH } from '../config.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'broadcast'; // broadcast | intro | goal
    this.target = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 26, 32);
    this.introTime = 0;
    camera.position.copy(this.camPos);
    camera.lookAt(0, 0, 0);
  }

  setMode(mode) {
    this.mode = mode;
    this.introTime = 0;
  }

  update(dt, ball, focusPlayer) {
    this.introTime += dt;
    switch (this.mode) {
      case 'intro': {
        // slow orbit around the stadium centre
        const a = this.introTime * 0.18 + Math.PI * 0.5;
        const desired = new THREE.Vector3(Math.cos(a) * 62, 22 + Math.sin(this.introTime * 0.4) * 4, Math.sin(a) * 62);
        this.camPos.lerp(desired, Math.min(1, dt * 1.6));
        this.target.lerp(new THREE.Vector3(0, 2, 0), Math.min(1, dt * 2));
        break;
      }
      case 'goal': {
        // close-up on the celebrating player
        const p = focusPlayer ? focusPlayer.pos : ball.pos;
        const desired = new THREE.Vector3(p.x + 6, 3.5, p.z + 8);
        this.camPos.lerp(desired, Math.min(1, dt * 2.4));
        this.target.lerp(new THREE.Vector3(p.x, 1.4, p.z), Math.min(1, dt * 4));
        break;
      }
      case 'replay': {
        // low dramatic angle near the goal the ball is heading to
        const gx = Math.sign(ball.pos.x || 1) * (PITCH.length / 2 - 4);
        const desired = new THREE.Vector3(gx - Math.sign(gx) * 14, 2.2, ball.pos.z + 10);
        this.camPos.lerp(desired, Math.min(1, dt * 3));
        this.target.lerp(ball.pos, Math.min(1, dt * 6));
        break;
      }
      default: {
        // broadcast: side view, follows ball with velocity lookahead
        const lookahead = new THREE.Vector3(ball.vel.x, 0, ball.vel.z).multiplyScalar(0.35);
        const focus = ball.pos.clone().add(lookahead);
        focus.x = THREE.MathUtils.clamp(focus.x, -PITCH.length / 2 + 6, PITCH.length / 2 - 6);
        focus.z = THREE.MathUtils.clamp(focus.z, -PITCH.width / 2 + 4, PITCH.width / 2 + 4);
        const desired = new THREE.Vector3(focus.x * 0.86, 23, 27 + focus.z * 0.45);
        this.camPos.lerp(desired, Math.min(1, dt * 3.2));
        this.target.lerp(new THREE.Vector3(focus.x, 0.6, focus.z * 0.8), Math.min(1, dt * 5));
      }
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.target);
  }
}
