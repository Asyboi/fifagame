// Photo color sampler — pure functions, no DOM/three dependency (unit-testable).
// Heuristically derives skin tone (central face region) and hair color (top band)
// from an uploaded portrait. Always returns sane fallbacks so a failed read never
// blocks the user — they can customize everything manually anyway.

import { rgbToHex, clamp } from '../utils.js';

export const FALLBACK_SKIN = '#d9a06b';
export const FALLBACK_HAIR = '#3a2a1c';

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isSkinish(r, g, b) {
  // Broad warm-tone skin heuristic covering light..deep tones.
  if (r < 55 || r > 252) return false;
  if (r < b + 8) return false;            // skin is redder than blue
  if (g > r + 6) return false;            // not green-shifted
  const rg = r - g;
  if (rg < 2 || rg > 110) return false;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  if (mx - mn < 12) return false;         // greys/whites out
  return true;
}

/**
 * @param {{data:Uint8ClampedArray|number[], width:number, height:number}} img
 * @returns {{skin:string, hair:string, skinOk:boolean, hairOk:boolean}}
 */
export function samplePortrait(img) {
  const { data, width, height } = img;
  if (!data || !width || !height || data.length < width * height * 4) {
    return { skin: FALLBACK_SKIN, hair: FALLBACK_HAIR, skinOk: false, hairOk: false };
  }

  // --- Skin: central face band ---
  const x0 = Math.floor(width * 0.32); const x1 = Math.ceil(width * 0.68);
  const y0 = Math.floor(height * 0.22); const y1 = Math.ceil(height * 0.62);
  let sr = 0; let sg = 0; let sb = 0; let sn = 0; let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      total++;
      if (isSkinish(r, g, b)) { sr += r; sg += g; sb += b; sn++; }
    }
  }
  const skinOk = sn / Math.max(1, total) > 0.05;
  const skin = skinOk ? rgbToHex(sr / sn, sg / sn, sb / sn) : FALLBACK_SKIN;

  // --- Hair: top band, darkest quartile ---
  const hx0 = Math.floor(width * 0.3); const hx1 = Math.ceil(width * 0.7);
  const hy0 = Math.floor(height * 0.02); const hy1 = Math.ceil(height * 0.2);
  const px = [];
  for (let y = hy0; y < hy1; y++) {
    for (let x = hx0; x < hx1; x++) {
      const i = (y * width + x) * 4;
      px.push([data[i], data[i + 1], data[i + 2], luma(data[i], data[i + 1], data[i + 2])]);
    }
  }
  let hair = FALLBACK_HAIR; let hairOk = false;
  if (px.length > 8) {
    px.sort((a, b) => a[3] - b[3]);
    const dark = px.slice(0, Math.max(4, Math.floor(px.length * 0.25)));
    const meanLuma = px.reduce((s, p) => s + p[3], 0) / px.length;
    const dr = dark.reduce((s, p) => s + p[0], 0) / dark.length;
    const dg = dark.reduce((s, p) => s + p[1], 0) / dark.length;
    const db = dark.reduce((s, p) => s + p[2], 0) / dark.length;
    const darkLuma = luma(dr, dg, db);
    // If the whole band is bright (bald head / bright background), don't trust it.
    hairOk = darkLuma < clamp(meanLuma * 0.75, 20, 130);
    if (hairOk) hair = rgbToHex(dr, dg, db);
  }

  return { skin, hair, skinOk, hairOk };
}

/**
 * Browser helper: load a File/Blob into ImageData (downscaled), or null on failure.
 */
export function fileToImageData(file, maxSize = 256) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const w = Math.max(8, Math.round(img.width * scale));
          const h = Math.max(8, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(ctx.getImageData(0, 0, w, h));
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}
