// Meteor storm visuals: falling rock + fire shell, ground target ring,
// impact flash, scorch mark. Driven by the pure storm state in meteors.js.

import * as THREE from 'three';
import { METEOR } from '../config.js';

export function createMeteorFx(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const rockGeo = new THREE.IcosahedronGeometry(METEOR.RADIUS, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: '#3a2f2a', emissive: '#ff5a1f', emissiveIntensity: 1.1, roughness: 0.9,
  });
  const shellGeo = new THREE.IcosahedronGeometry(METEOR.RADIUS * 1.75, 1);
  const shellMat = new THREE.MeshBasicMaterial({
    color: '#ff8c3a', transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ringGeo = new THREE.RingGeometry(METEOR.KILL_RADIUS - 0.3, METEOR.KILL_RADIUS, 32);
  const flashGeo = new THREE.SphereGeometry(1, 14, 10);
  const scorchGeo = new THREE.CircleGeometry(METEOR.DOWN_RADIUS * 0.8, 24);

  const rocks = new Map(); // meteor.id -> { rock, ring }
  const transient = [];    // { mesh, t, ttl, grow } — flashes + scorch marks

  /** A meteor spawned: rock in the sky + warning ring on the pitch. */
  function spawn(m) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.castShadow = true;
    rock.position.set(m.x, m.y, m.z);
    rock.add(new THREE.Mesh(shellGeo, shellMat));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: '#ff3b30', transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(m.x, 0.05, m.z);
    group.add(rock, ring);
    rocks.set(m.id, { rock, ring });
  }

  /** A meteor landed: remove its visuals, add a flash + a scorch mark. */
  function impact(m) {
    const e = rocks.get(m.id);
    if (e) {
      group.remove(e.rock, e.ring);
      e.ring.material.dispose();
      rocks.delete(m.id);
    }
    const flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({
      color: '#ffb14e', transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flash.position.set(m.x, 0.6, m.z);
    group.add(flash);
    transient.push({ mesh: flash, t: 0, ttl: 0.45, grow: METEOR.DOWN_RADIUS * 1.15, base: 0.9 });

    const scorch = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({
      color: '#0c0a08', transparent: true, opacity: 0.55, depthWrite: false,
    }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(m.x, 0.04, m.z);
    group.add(scorch);
    transient.push({ mesh: scorch, t: 0, ttl: 16, grow: 0, base: 0.55 });
  }

  /** Position falling rocks from storm state; animate flashes/scorches. */
  function update(storm, dt) {
    for (const m of storm.meteors) {
      const e = rocks.get(m.id);
      if (!e) continue;
      e.rock.position.set(m.x, Math.max(0.2, m.y), m.z);
      e.rock.rotation.y += dt * 6;
      e.rock.rotation.x += dt * 3.1;
      const h = 1 - m.y / METEOR.SPAWN_HEIGHT; // ring brightens as it closes in
      e.ring.material.opacity = 0.2 + h * 0.65;
    }
    for (let i = transient.length - 1; i >= 0; i--) {
      const tr = transient[i];
      tr.t += dt;
      const k = tr.t / tr.ttl;
      if (k >= 1) {
        group.remove(tr.mesh);
        tr.mesh.material.dispose();
        transient.splice(i, 1);
        continue;
      }
      if (tr.grow) tr.mesh.scale.setScalar(0.3 + tr.grow * k);
      tr.mesh.material.opacity = tr.base * (1 - k);
    }
  }

  /** Match over: quietly remove any rocks still in the sky. */
  function clear() {
    for (const e of rocks.values()) {
      group.remove(e.rock, e.ring);
      e.ring.material.dispose();
    }
    rocks.clear();
  }

  return { spawn, impact, update, clear };
}
