// Stadium: pitch, goals + nets, stands, instanced crowd, ad boards, floodlights.
// Original fictional branding only ("World Stars Cup" wordmark text).

import * as THREE from 'three';
import { PITCH, BALL } from '../config.js';

function pitchTexture() {
  const w = 2048; const h = 1280;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const { LENGTH: L, WIDTH: W } = PITCH;
  const apron = 10; // meters of surrounding turf
  const sx = w / (L + apron * 2); const sz = h / (W + apron * 2);
  const X = (m) => (m + L / 2 + apron) * sx;
  const Z = (m) => (m + W / 2 + apron) * sz;

  g.fillStyle = '#2c7a3f';
  g.fillRect(0, 0, w, h);
  // mowed bands
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#2f8444' : '#2a7439';
    g.fillRect((i * w) / 12, 0, w / 12, h);
  }
  // subtle noise
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }

  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 5;
  const line = (x0, z0, x1, z1) => { g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); };
  // boundary + halfway
  g.strokeRect(X(-L / 2), Z(-W / 2), L * sx, W * sz);
  line(0, -W / 2, 0, W / 2);
  g.beginPath(); g.arc(X(0), Z(0), 8 * sx, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 0.35 * sx, 0, Math.PI * 2); g.fill();
  // boxes both ends
  for (const s of [1, -1]) {
    const gl = (s * L) / 2;
    const bx0 = s === 1 ? gl - PITCH.BOX_DEPTH : gl;
    g.strokeRect(X(bx0), Z(-PITCH.BOX_WIDTH / 2), PITCH.BOX_DEPTH * sx, PITCH.BOX_WIDTH * sz);
    const gx0 = s === 1 ? gl - 5 : gl;
    g.strokeRect(X(gx0), Z(-9), 5 * sx, 18 * sz);
    g.beginPath(); g.arc(X(gl - s * 10), Z(0), 0.3 * sx, 0, Math.PI * 2); g.fill();
    // corner arcs
    for (const cz of [-1, 1]) {
      g.beginPath();
      g.arc(X(gl), Z((cz * W) / 2), 1 * sx, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(240,245,255,0.75)';
  g.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildGoal() {
  const { GOAL_WIDTH: GW, GOAL_HEIGHT: GH, GOAL_DEPTH: GD, POST_R } = PITCH;
  const goal = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: '#f4f7fb', roughness: 0.4 });
  const postGeo = new THREE.CylinderGeometry(POST_R, POST_R, GH + POST_R, 10);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(0, (GH + POST_R) / 2, (s * GW) / 2);
    p.castShadow = true;
    goal.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(POST_R, POST_R, GW + POST_R * 2, 10), postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, GH, 0);
  bar.castShadow = true;
  goal.add(bar);

  const netMat = new THREE.MeshBasicMaterial({
    map: netTexture(), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), netMat);
  back.rotation.y = Math.PI / 2;
  back.position.set(-GD, GH / 2, 0);
  goal.add(back);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(GD, GW), netMat);
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(-GD / 2, GH, 0);
  goal.add(roof);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(GD, GH), netMat);
    side.position.set(-GD / 2, GH / 2, (s * GW) / 2);
    goal.add(side);
  }
  return goal;
}

function crowdTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1428';
  g.fillRect(0, 0, 16, 16);
  return c;
}

function buildCrowd(count) {
  const g = new THREE.BoxGeometry(0.42, 0.62, 0.3);
  const m = new THREE.MeshStandardMaterial({ roughness: 1 });
  const inst = new THREE.InstancedMesh(g, m, count);
  const palette = ['#d8dee9', '#7ec3ee', '#c8102e', '#ffd93b', '#22d3ee', '#f471b5', '#f2f2f2', '#233154'];
  const color = new THREE.Color();
  const M = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    M.setPosition(0, 0, 0);
    inst.setMatrixAt(i, M);
    color.set(palette[(Math.random() * palette.length) | 0]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
    inst.setColorAt(i, color);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.instanceColor.needsUpdate = true;
  return inst;
}

function layOutCrowd(inst) {
  // Ring the pitch with raked rows on four sides.
  const { LENGTH: L, WIDTH: W } = PITCH;
  const M = new THREE.Matrix4();
  let i = 0;
  const n = inst.count;
  const rows = 7;
  while (i < n) {
    const side = i % 4;
    const row = (i / 4) % rows | 0;
    const t = Math.random() * 2 - 1;
    const standOff = 8 + row * 1.7;
    const y = 3.2 + row * 1.25 + Math.random() * 0.15;
    let x; let z;
    if (side === 0) { x = t * (L / 2 + 6); z = W / 2 + standOff; }
    else if (side === 1) { x = t * (L / 2 + 6); z = -W / 2 - standOff; }
    else if (side === 2) { x = L / 2 + standOff; z = t * (W / 2 + 6); }
    else { x = -L / 2 - standOff; z = t * (W / 2 + 6); }
    M.setPosition(x, y, z);
    inst.setMatrixAt(i, M);
    i++;
  }
  inst.instanceMatrix.needsUpdate = true;
}

function boardTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0a1030';
  g.fillRect(0, 0, 1024, 64);
  g.font = 'italic 900 38px Arial, sans-serif';
  g.textBaseline = 'middle';
  const words = ['WORLD STARS CUP', '★ BE THE STAR ★', 'STAR BALL', 'NOVA SPORTS'];
  const colors = ['#22d3ee', '#ffd166', '#f471b5', '#7ec3ee'];
  let x = 20;
  let k = 0;
  while (x < 1000) {
    g.fillStyle = colors[k % colors.length];
    const wtxt = words[k % words.length];
    g.fillText(wtxt, x, 34);
    x += g.measureText(wtxt).width + 70;
    k++;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = 2;
  return tex;
}

export function buildStadium() {
  const { LENGTH: L, WIDTH: W } = PITCH;
  const group = new THREE.Group();

  // pitch + apron
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(L + 20, W + 20),
    new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.95 }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  // goals (built with the mouth facing local +x and net behind at local -x)
  const goalR = buildGoal();
  goalR.position.set(L / 2, 0, 0);
  goalR.rotation.y = Math.PI; // mouth faces the pitch (-x)
  group.add(goalR);
  const goalL = buildGoal();
  goalL.position.set(-L / 2, 0, 0); // mouth faces the pitch (+x) as built
  group.add(goalL);

  // stands (simple raked blocks under the crowd)
  const standMat = new THREE.MeshStandardMaterial({ color: '#131c38', roughness: 1 });
  const mkStand = (w, d, x, z) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 12, d), standMat);
    s.position.set(x, 3.5, z);
    group.add(s);
  };
  mkStand(L + 26, 16, 0, W / 2 + 12.5);
  mkStand(L + 26, 16, 0, -W / 2 - 12.5);
  mkStand(16, W + 26, L / 2 + 12.5, 0);
  mkStand(16, W + 26, -L / 2 - 12.5, 0);

  // crowd
  const crowd = buildCrowd(4200);
  layOutCrowd(crowd);
  group.add(crowd);

  // ad boards
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTexture() });
  const boardGeo = new THREE.BoxGeometry(L + 4, 1, 0.3);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(boardGeo, boardMat);
    b.position.set(0, 0.5, s * (W / 2 + 5.5));
    group.add(b);
  }
  const endGeo = new THREE.BoxGeometry(W + 4, 1, 0.3);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(endGeo, boardMat);
    b.position.set(s * (L / 2 + 5.5), 0.5, 0);
    b.rotation.y = Math.PI / 2;
    group.add(b);
  }

  // floodlight towers
  const towerMat = new THREE.MeshStandardMaterial({ color: '#2a3352', roughness: 0.8 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#dfe9ff', emissive: '#cfe4ff', emissiveIntensity: 1.6,
  });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 26, 8), towerMat);
    tower.position.set(sx * (L / 2 + 16), 13, sz * (W / 2 + 16));
    group.add(tower);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 1.2), lampMat);
    lamp.position.set(sx * (L / 2 + 14.5), 26.5, sz * (W / 2 + 14.5));
    lamp.lookAt(0, 0, 0);
    group.add(lamp);
  }

  let excite = 0;
  let t = 0;
  return {
    group,
    update(dt, excitement) {
      excite += (excitement - excite) * Math.min(1, dt * 3);
      t += dt * (1.2 + excite * 3);
      crowd.position.y = Math.abs(Math.sin(t)) * 0.08 * (0.4 + excite);
    },
  };
}

export function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f5f8fc';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#182238';
  const spots = [[16, 16], [48, 44], [80, 14], [112, 44], [32, 52], [96, 52], [64, 30]];
  for (const [x, y] of spots) {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * 7, y + Math.sin(a) * 7);
    }
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildBallMesh() {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.R, 18, 14),
    new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.55 }),
  );
  m.castShadow = true;
  return m;
}

/** Roll/spin the ball mesh from its velocity. */
export function spinBall(mesh, vel, dt) {
  const sp = Math.hypot(vel.x, vel.z);
  if (sp < 0.01 && Math.abs(vel.y) < 0.01) return;
  const axis = new THREE.Vector3(vel.z, 0, -vel.x).normalize();
  mesh.rotateOnWorldAxis(axis, (sp / BALL.R) * dt * 0.9);
}
