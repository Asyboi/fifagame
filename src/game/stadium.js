// ── Stadium: pitch, markings, goals, stands, crowd, lights ──────
import * as THREE from 'three';
import { PITCH } from '../config.js';

function pitchTexture() {
  const W = 1050, H = 680; // 10 px per metre
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // mow stripes
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 ? '#2e8b32' : '#33a038';
    ctx.fillRect((W / 14) * i, 0, W / 14 + 1, H);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 3;
  const px = (m) => (m + PITCH.length / 2) * 10;
  const pz = (m) => (m + PITCH.width / 2) * 10;

  // boundary + halfway
  ctx.strokeRect(px(-52.5) + 2, pz(-34) + 2, PITCH.length * 10 - 4, PITCH.width * 10 - 4);
  ctx.beginPath();
  ctx.moveTo(px(0), pz(-34));
  ctx.lineTo(px(0), pz(34));
  ctx.stroke();
  // centre circle + spot
  ctx.beginPath();
  ctx.arc(px(0), pz(0), PITCH.centerCircle * 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(0), pz(0), 5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  for (const side of [-1, 1]) {
    const gx = side * 52.5;
    // penalty box
    ctx.strokeRect(
      Math.min(px(gx), px(gx - side * PITCH.boxLength)),
      pz(-PITCH.boxWidth / 2),
      PITCH.boxLength * 10,
      PITCH.boxWidth * 10
    );
    // six-yard box
    ctx.strokeRect(
      Math.min(px(gx), px(gx - side * PITCH.sixLength)),
      pz(-PITCH.sixWidth / 2),
      PITCH.sixLength * 10,
      PITCH.sixWidth * 10
    );
    // penalty spot + arc
    ctx.beginPath();
    ctx.arc(px(gx - side * 11), pz(0), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px(gx - side * 11), pz(0), 91.5, side > 0 ? Math.PI * 0.65 : -Math.PI * 0.35, side > 0 ? Math.PI * 1.35 : Math.PI * 0.35);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildGoal(scene, side) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3 });
  const r = 0.06;
  const gw = PITCH.goalWidth, gh = PITCH.goalHeight, gd = PITCH.goalDepth;

  const post = new THREE.CylinderGeometry(r, r, gh, 8);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(post, postMat);
    p.position.set(0, gh / 2, (s * gw) / 2);
    p.castShadow = true;
    group.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, gw, 8), postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, gh, 0);
  group.add(bar);

  // net: simple translucent planes
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), netMat);
  back.position.set(side * gd, gh / 2, 0);
  back.rotation.y = Math.PI / 2;
  group.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(gd, gw), netMat);
  top.rotation.z = Math.PI / 2;
  top.rotation.y = Math.PI / 2;
  top.position.set(side * gd / 2, gh, 0);
  group.add(top);
  for (const s of [-1, 1]) {
    const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(gd, gh), netMat);
    sideNet.position.set(side * gd / 2, gh / 2, (s * gw) / 2);
    group.add(sideNet);
  }

  group.position.x = side * (PITCH.length / 2);
  scene.add(group);
  return group;
}

function buildStands(scene) {
  const standMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.9 });
  const crowdColors = [0xdd4444, 0x4466dd, 0xf0e040, 0x44bb66, 0xeeeeee, 0xff8833, 0x9955cc];
  const crowdGeo = new THREE.SphereGeometry(0.35, 5, 4);
  const crowdMesh = new THREE.InstancedMesh(
    crowdGeo,
    new THREE.MeshLambertMaterial(),
    4200
  );
  crowdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let idx = 0;
  const baseY = [];

  const addStand = (x, z, w, d, rotY) => {
    const tiers = 8;
    const g = new THREE.Group();
    for (let t = 0; t < tiers; t++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, 3), standMat);
      step.position.set(0, 1 + t * 1.35, t * 2.6);
      g.add(step);
      // crowd rows
      const seats = Math.floor(w / 1.4);
      for (let s = 0; s < seats && idx < 4200; s++) {
        dummy.position.set(-w / 2 + 0.8 + s * 1.4 + Math.random() * 0.4, 2.05 + t * 1.35, t * 2.6 + (Math.random() - 0.5) * 0.6);
        dummy.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        dummy.position.x += x;
        dummy.position.z += z;
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        crowdMesh.setMatrixAt(idx, dummy.matrix);
        crowdMesh.setColorAt(idx, color.setHex(crowdColors[(Math.random() * crowdColors.length) | 0]));
        baseY.push(dummy.position.y);
        idx++;
      }
    }
    g.rotation.y = rotY;
    g.position.set(x, 0, z);
    scene.add(g);
  };

  // near (camera) side sits far back so the broadcast rig never clips it
  addStand(0, PITCH.width / 2 + 32, PITCH.length + 14, 20, Math.PI);
  addStand(0, -(PITCH.width / 2 + 6), PITCH.length + 14, 20, 0);
  addStand(PITCH.length / 2 + 8, 0, PITCH.width + 10, 20, Math.PI / 2);
  addStand(-(PITCH.length / 2 + 8), 0, PITCH.width + 10, 20, -Math.PI / 2);

  crowdMesh.count = idx;
  scene.add(crowdMesh);
  return { crowdMesh, baseY, count: idx };
}

export function buildStadium(scene) {
  // grass plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length + 60, PITCH.width + 60),
    new THREE.MeshStandardMaterial({ color: 0x256b28, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length, PITCH.width),
    new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.95 })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  buildGoal(scene, 1);
  buildGoal(scene, -1);

  // ad boards
  const adMat = new THREE.MeshStandardMaterial({ color: 0x10365c, roughness: 0.7 });
  for (const s of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(PITCH.length, 1, 0.2), adMat);
    board.position.set(0, 0.5, s * (PITCH.width / 2 + 2.5));
    scene.add(board);
  }

  const crowd = buildStands(scene);

  // lighting
  scene.background = new THREE.Color(0x0d1b2a);
  scene.fog = new THREE.Fog(0x0d1b2a, 160, 340);
  scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x1b3a1b, 0.75));
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
  sun.position.set(-40, 70, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 75;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, far: 220 });
  scene.add(sun);

  // floodlight pylons (visual)
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x222831 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 34, 6), pylonMat);
      pylon.position.set(sx * (PITCH.length / 2 + 18), 17, sz * (PITCH.width / 2 + 18));
      scene.add(pylon);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 1), lampMat);
      lamp.position.set(pylon.position.x, 33, pylon.position.z);
      lamp.lookAt(0, 0, 0);
      scene.add(lamp);
    }
  }

  return {
    crowd,
    /** cheap crowd bounce for celebrations */
    exciteCrowd(time, intensity = 1) {
      const { crowdMesh, baseY, count } = crowd;
      const dummy = new THREE.Object3D();
      const m = new THREE.Matrix4();
      for (let i = 0; i < count; i += 1) {
        crowdMesh.getMatrixAt(i, m);
        dummy.position.setFromMatrixPosition(m);
        dummy.position.y = baseY[i] + Math.abs(Math.sin(time * 6 + i)) * 0.5 * intensity;
        dummy.updateMatrix();
        crowdMesh.setMatrixAt(i, dummy.matrix);
      }
      crowdMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
