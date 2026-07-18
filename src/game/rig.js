// Low-poly footballer rig + procedural animation.
// Rig origin is at the feet; forward is +z (rotation.y = atan2(vx, vz)).
// ~10 meshes per player, shared geometries, cached kit textures.

import * as THREE from 'three';
import { shade } from '../utils.js';

const GEO = {};
function geo() {
  if (GEO.done) return GEO;
  GEO.torso = new THREE.CylinderGeometry(0.24, 0.29, 0.62, 10);
  GEO.hips = new THREE.CylinderGeometry(0.26, 0.24, 0.3, 10);
  GEO.limb = new THREE.CylinderGeometry(0.075, 0.065, 0.5, 8);
  GEO.sleeve = new THREE.CylinderGeometry(0.095, 0.085, 0.22, 8);
  GEO.sock = new THREE.CylinderGeometry(0.07, 0.062, 0.4, 8);
  GEO.boot = new THREE.BoxGeometry(0.13, 0.09, 0.26);
  GEO.head = new THREE.SphereGeometry(0.155, 14, 12);
  GEO.hairShort = new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  GEO.hairFade = new THREE.SphereGeometry(0.158, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.32);
  GEO.hairLong = new THREE.BoxGeometry(0.26, 0.34, 0.1);
  GEO.hairMohawk = new THREE.BoxGeometry(0.06, 0.1, 0.3);
  GEO.hairCurl = new THREE.SphereGeometry(0.085, 8, 6);
  GEO.number = new THREE.PlaneGeometry(0.34, 0.4);
  GEO.done = true;
  return GEO;
}

const kitTexCache = new Map();
export function kitTexture(kit) {
  const key = `${kit.pattern}|${kit.primary}|${kit.secondary}|${kit.trim}`;
  if (kitTexCache.has(key)) return kitTexCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = kit.primary;
  g.fillRect(0, 0, 128, 64);
  if (kit.pattern === 'stripes') {
    g.fillStyle = kit.secondary;
    for (let i = 0; i < 4; i++) g.fillRect(16 + i * 32, 0, 14, 64);
  } else if (kit.pattern === 'sash') {
    g.fillStyle = kit.secondary;
    g.beginPath(); g.moveTo(0, 64); g.lineTo(38, 64); g.lineTo(128, 0); g.lineTo(90, 0); g.fill();
  } else if (kit.pattern === 'halves') {
    g.fillStyle = kit.secondary;
    g.fillRect(64, 0, 64, 64);
  }
  g.fillStyle = kit.trim;
  g.fillRect(0, 0, 128, 6); // collar
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  kitTexCache.set(key, tex);
  return tex;
}

const numTexCache = new Map();
export function numberTexture(kit, number, name) {
  const key = `${kit.primary}|${kit.number}|${number}|${name || ''}`;
  if (numTexCache.has(key)) return numTexCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.textAlign = 'center';
  g.fillStyle = kit.number;
  if (name) {
    g.font = '700 24px Arial, sans-serif';
    g.fillText(String(name).toUpperCase().slice(0, 12), 64, 34);
  }
  g.font = '900 74px Arial, sans-serif';
  g.fillText(String(number), 64, 106);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  numTexCache.set(key, tex);
  return tex;
}

function mesh(g, color, opts = {}) {
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color, roughness: 0.85, metalness: 0.02, ...opts,
  }));
  m.castShadow = true;
  return m;
}

function addHair(head, style, color) {
  const G = geo();
  const mat = { roughness: 0.95 };
  if (style === 'bald') return;
  if (style === 'curly') {
    const offs = [[0, 0.12, 0], [0.09, 0.1, 0.03], [-0.09, 0.1, 0.03], [0.05, 0.11, -0.08], [-0.05, 0.11, -0.08], [0, 0.08, 0.1]];
    for (const [x, y, z] of offs) {
      const s = mesh(GEO.hairCurl, color, mat);
      s.position.set(x, y, z);
      head.add(s);
    }
    return;
  }
  let h;
  if (style === 'fade') h = mesh(GEO.hairFade, color, mat);
  else if (style === 'mohawk') { h = mesh(GEO.hairMohawk, color, mat); h.position.y = 0.16; }
  else h = mesh(GEO.hairShort, color, mat);
  head.add(h);
  if (style === 'long') {
    const back = mesh(GEO.hairLong, color, mat);
    back.position.set(0, -0.08, -0.13);
    head.add(back);
  }
}

/**
 * Build a footballer. cfg: { kit, skin, hair, hairStyle, number, name, gk }
 */
export function buildPlayer(cfg) {
  const G = geo();
  const { kit } = cfg;
  const skin = cfg.skin || '#d9a06b';
  const group = new THREE.Group();

  const kitMat = new THREE.MeshStandardMaterial({ map: kitTexture(kit), roughness: 0.85 });
  if (cfg.gk) kitMat.color = new THREE.Color('#f1f5f9'); // keepers wear a light top over the pattern

  const torso = new THREE.Mesh(G.torso, kitMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);

  const hips = mesh(G.hips, kit.shorts);
  hips.position.y = 0.72;
  group.add(hips);

  // back number + name
  const numMat = new THREE.MeshBasicMaterial({
    map: numberTexture(kit, cfg.number ?? 9, cfg.name), transparent: true, side: THREE.DoubleSide,
  });
  const num = new THREE.Mesh(G.number, numMat);
  num.position.set(0, 1.14, -0.27);
  num.rotation.y = Math.PI;
  group.add(num);

  const head = new THREE.Group();
  head.position.y = 1.58;
  const skull = mesh(G.head, skin);
  head.add(skull);
  addHair(head, cfg.hairStyle || 'short', cfg.hair || '#3a2a1c');
  group.add(head);

  // arms pivot at the shoulder
  const mkArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.31 * side, 1.38, 0);
    const sleeve = new THREE.Mesh(G.sleeve, kitMat);
    sleeve.position.y = -0.06;
    sleeve.castShadow = true;
    const arm = mesh(G.limb, skin);
    arm.position.y = -0.32;
    pivot.add(sleeve, arm);
    group.add(pivot);
    return pivot;
  };

  // legs pivot at the hip
  const mkLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.13 * side, 0.62, 0);
    const shin = mesh(G.sock, kit.trim);
    shin.position.y = -0.3;
    const boot = mesh(G.boot, '#14100c');
    boot.position.set(0, -0.56, 0.05);
    pivot.add(shin, boot);
    group.add(pivot);
    return pivot;
  };

  const rig = {
    group,
    parts: { torso, head, armL: mkArm(-1), armR: mkArm(1), legL: mkLeg(-1), legR: mkLeg(1) },
    phase: Math.random() * 10,
  };
  return rig;
}

/**
 * Procedural animation. s = {
 *   speed01 0..1, kick 0..1, celebrate 0..1, dive -1|0|1, down 0..1, idle t
 * }
 */
export function animateRig(rig, dt, s) {
  const p = rig.parts;
  const run = s.speed01;
  rig.phase += dt * (4 + run * 10);
  const sw = Math.sin(rig.phase) * run * 0.85;

  // base locomotion
  p.legL.rotation.x = sw;
  p.legR.rotation.x = -sw;
  p.armL.rotation.x = -sw * 0.8;
  p.armR.rotation.x = sw * 0.8;
  p.armL.rotation.z = 0.12;
  p.armR.rotation.z = -0.12;
  p.torso.rotation.x = run * 0.14;
  p.head.rotation.x = -run * 0.06;
  rig.group.position.y = Math.abs(Math.sin(rig.phase)) * run * 0.05;

  if (s.kick > 0) {
    const k = Math.sin(Math.min(1, s.kick) * Math.PI); // 0..1..0
    p.legR.rotation.x = -k * 1.5;
    p.armL.rotation.x = k * 0.7;
  }
  if (s.celebrate > 0) {
    p.armL.rotation.z = 2.6 * s.celebrate;
    p.armR.rotation.z = -2.6 * s.celebrate;
    rig.group.position.y = Math.abs(Math.sin(rig.phase * 1.6)) * 0.16 * s.celebrate;
    p.torso.rotation.x = -0.1 * s.celebrate;
  }
  if (s.dive) {
    const side = s.dive;
    rig.group.rotation.z = side * -1.25;
    rig.group.position.y = 0.35;
    p.armL.rotation.z = 2.9;
    p.armR.rotation.z = -2.9;
  } else {
    rig.group.rotation.z = 0;
  }
  if (s.down > 0) {
    rig.group.rotation.x = -1.15 * s.down;
    rig.group.position.y = 0.15 * s.down;
  } else {
    rig.group.rotation.x = 0;
  }
  if (s.idleBreath && run < 0.05) {
    p.torso.scale.y = 1 + Math.sin(s.idleBreath * 2 + rig.phase) * 0.012;
  }
}

export function disposeRig(rig) {
  rig.group.traverse((o) => {
    if (o.material) {
      if (o.material.map && !kitTexCache.has(o.material.map)) o.material.map.dispose?.();
      o.material.dispose?.();
    }
  });
}
