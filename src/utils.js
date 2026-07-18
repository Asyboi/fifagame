// Small math + color helpers shared across the game. Pure / dependency-free.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent exponential damping. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx; const dz = az - bz;
  return dx * dx + dz * dz;
};

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function rgbToHex(r, g, b) {
  const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { r: 128, g: 128, b: 128 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function shade(hex, amt) {
  // amt in [-1,1]; negative darkens
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => (amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return rgbToHex(f(r), f(g), f(b));
}

export function formatClock(secondsLeft) {
  const s = Math.max(0, Math.ceil(secondsLeft));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
