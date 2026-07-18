// ── Photo → stylized face texture ───────────────────────────────
// The uploaded photo is cropped into a soft oval, colour-graded to
// blend with the chosen skin tone, and mapped onto the head's
// face-plate. The photo lives only in memory for the session.
import * as THREE from 'three';

const SIZE = 256;

/**
 * Render the face canvas.
 * params: { image, zoom (0.5..3), offsetX/-1..1, offsetY, skinTone }
 */
export function renderFaceCanvas(canvas, params) {
  const { image, zoom = 1, offsetX = 0, offsetY = 0, skinTone = '#eab98c' } = params;
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, SIZE, SIZE);

  if (!image) return canvas;

  // fit the shorter photo edge into the canvas, then apply user zoom/offset
  const base = Math.max(SIZE / image.width, SIZE / image.height) * zoom;
  const w = image.width * base;
  const h = image.height * base;
  const x = SIZE / 2 - w / 2 + offsetX * SIZE * 0.5;
  const y = SIZE / 2 - h / 2 + offsetY * SIZE * 0.5;

  ctx.save();
  // soft oval mask
  ctx.beginPath();
  ctx.ellipse(SIZE / 2, SIZE / 2, SIZE * 0.44, SIZE * 0.48, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, x, y, w, h);

  // gentle stylization: slight posterize-ish contrast + skin-tone blend at edges
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = 'rgba(255, 220, 180, 0.12)';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.restore();

  // vignette to skin tone so it blends with the 3D head
  const grad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.28, SIZE / 2, SIZE / 2, SIZE * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.82, hexToRgba(skinTone, 0));
  grad.addColorStop(1, hexToRgba(skinTone, 1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  return canvas;
}

/** Create (or refresh) a THREE texture from the face canvas. */
export function faceTextureFromCanvas(canvas, existing = null) {
  if (existing) {
    existing.needsUpdate = true;
    return existing;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Load a File/Blob into an HTMLImageElement (session only, never uploaded). */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
