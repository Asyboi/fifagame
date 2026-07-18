// ── Low-poly player rig factory ─────────────────────────────────
// Shared geometries + per-team shared materials keep 22 players cheap.
import * as THREE from 'three';

const G = {
  torso: new THREE.CapsuleGeometry(0.24, 0.42, 4, 8),
  head: new THREE.SphereGeometry(0.16, 12, 10),
  arm: new THREE.CapsuleGeometry(0.07, 0.34, 3, 6),
  leg: new THREE.CapsuleGeometry(0.09, 0.42, 3, 6),
  boot: new THREE.BoxGeometry(0.13, 0.09, 0.24),
  facePlate: new THREE.SphereGeometry(0.165, 16, 12, -Math.PI / 2 - 0.9, 1.8, 0.6, 1.7),
};
Object.values(G).forEach((g) => g.computeVertexNormals?.());

const materialCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${opts.roughness ?? 0.8}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.8 }));
  }
  return materialCache.get(key);
}

const bootMat = mat('#111111');
const shortsMatCache = new Map();

/** Canvas texture for a shirt back number. */
function numberTexture(number, kitColor, textColor) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = kitColor;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = textColor;
  ctx.font = 'bold 84px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildHair(style, color) {
  const m = mat(color, { roughness: 0.95 });
  const group = new THREE.Group();
  const add = (geo, y = 0, s = 1, x = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(s);
    group.add(mesh);
  };
  switch (style) {
    case 'short':
      add(new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, 1.15), 0.02);
      break;
    case 'buzz':
      add(new THREE.SphereGeometry(0.162, 10, 8, 0, Math.PI * 2, 0, 0.9), 0.015);
      break;
    case 'afro':
      add(new THREE.SphereGeometry(0.21, 10, 8), 0.09);
      break;
    case 'mohawk':
      add(new THREE.BoxGeometry(0.3, 0.09, 0.05), 0.16);
      break;
    case 'long': {
      add(new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, 1.5), 0.02);
      add(new THREE.CylinderGeometry(0.14, 0.1, 0.22, 8), -0.1, 1, 0, -0.09);
      break;
    }
    case 'bald':
    default:
      break;
  }
  return group;
}

/**
 * Build a full player rig.
 * opts: { kitColor, kit2Color, skinTone, hairStyle, hairColor, number, faceTexture, isGK }
 * Returns { root, parts } where parts hold animatable bones.
 */
export function buildPlayerMesh(opts) {
  const {
    kitColor, kit2Color = '#ffffff', skinTone = '#eab98c',
    hairStyle = 'short', hairColor = '#161311', number = 0,
    faceTexture = null,
  } = opts;

  const root = new THREE.Group();
  const kitMat = mat(kitColor);
  const skinMat = mat(skinTone);
  if (!shortsMatCache.has(kit2Color)) shortsMatCache.set(kit2Color, mat(kit2Color));
  const shortsMat = shortsMatCache.get(kit2Color);

  // torso
  const torso = new THREE.Mesh(G.torso, kitMat);
  torso.position.y = 1.06;
  torso.castShadow = true;
  root.add(torso);

  // back number plate
  const numTex = numberTexture(number, kitColor, kit2Color);
  const numPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.85 })
  );
  numPlate.position.set(0, 0.08, -0.245);
  numPlate.rotation.y = Math.PI;
  torso.add(numPlate);

  // shorts
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.22, 0.22, 8), shortsMat);
  shorts.position.y = 0.72;
  root.add(shorts);

  // head
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.52;
  const head = new THREE.Mesh(G.head, skinMat);
  head.castShadow = true;
  headPivot.add(head);
  if (faceTexture) {
    const faceMat = new THREE.MeshStandardMaterial({
      map: faceTexture, roughness: 0.75, transparent: true,
    });
    const face = new THREE.Mesh(G.facePlate, faceMat);
    face.scale.setScalar(1.03);
    headPivot.add(face);
  } else {
    // simple painted eyes so faceless AI players don't look cursed
    const eyeGeo = new THREE.SphereGeometry(0.018, 6, 6);
    const eyeMat = mat('#1c1c1c');
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * 0.055, 0.02, 0.148);
      headPivot.add(eye);
    }
  }
  headPivot.add(buildHair(hairStyle, hairColor));
  root.add(headPivot);

  // limbs — each in a pivot group at the joint so we can swing them
  const makeLimb = (geo, material, jointY, jointX, meshOffsetY) => {
    const pivot = new THREE.Group();
    pivot.position.set(jointX, jointY, 0);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = meshOffsetY;
    mesh.castShadow = true;
    pivot.add(mesh);
    root.add(pivot);
    return pivot;
  };

  const armL = makeLimb(G.arm, skinMat, 1.3, -0.32, -0.2);
  const armR = makeLimb(G.arm, skinMat, 1.3, 0.32, -0.2);
  // sleeves
  for (const a of [armL, armR]) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.16, 8), kitMat);
    sleeve.position.y = -0.06;
    a.add(sleeve);
  }
  const legL = makeLimb(G.leg, shortsMat, 0.66, -0.13, -0.28);
  const legR = makeLimb(G.leg, shortsMat, 0.66, 0.13, -0.28);
  for (const l of [legL, legR]) {
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.09, 0.24, 8), kitMat);
    sock.position.y = -0.42;
    l.add(sock);
    const boot = new THREE.Mesh(G.boot, bootMat);
    boot.position.set(0, -0.6, 0.05);
    l.add(boot);
  }

  return { root, parts: { torso, headPivot, armL, armR, legL, legR } };
}
