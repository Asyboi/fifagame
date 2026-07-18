// ── FABLE CUP global configuration ─────────────────────────────
// Pure data. No three.js imports so it can be used in tests.

export const PITCH = {
  length: 105, // x axis  (-52.5 .. 52.5)
  width: 68,   // z axis  (-34 .. 34)
  goalWidth: 7.32,
  goalHeight: 2.44,
  goalDepth: 2.2,
  boxLength: 16.5,
  boxWidth: 40.3,
  sixLength: 5.5,
  sixWidth: 18.32,
  centerCircle: 9.15,
};

export const MATCH = {
  halfLengthSeconds: 150,      // one half of real time (≈ 45 simulated min)
  simMinutesPerHalf: 45,
  controlRadius: 1.7,          // distance at which a player can take the ball
  dribbleLead: 1.4,
  passSpeed: 21,
  throughPassSpeed: 25,
  shotSpeedMin: 18,
  shotSpeedMax: 34,
  sprintSpeed: 8.4,
  runSpeed: 6.2,
  aiSpeedFactor: { easy: 0.82, normal: 0.94, hard: 1.02 },
};

// Fictional, legally-safe national squads for the FABLE CUP.
export const TEAMS = [
  { id: 'albion',   name: 'Albion',    short: 'ALB', kit: '#e63946', kit2: '#ffffff', gk: '#f4a814' },
  { id: 'iberis',   name: 'Iberis',    short: 'IBE', kit: '#f4d21c', kit2: '#c1121f', gk: '#2ec4b6' },
  { id: 'verdania', name: 'Verdania',  short: 'VER', kit: '#2a9d34', kit2: '#ffffff', gk: '#8338ec' },
  { id: 'aurelia',  name: 'Aurelia',   short: 'AUR', kit: '#0466c8', kit2: '#ffd60a', gk: '#ff6d00' },
  { id: 'nordheim', name: 'Nordheim',  short: 'NOR', kit: '#f8f9fa', kit2: '#1d3557', gk: '#d62828' },
  { id: 'zephyra',  name: 'Zephyra',   short: 'ZEP', kit: '#7209b7', kit2: '#f1faee', gk: '#06d6a0' },
];

export const POSITIONS = ['ST', 'LW', 'RW', 'CM', 'CDM', 'LB', 'RB', 'CB'];

export const SKIN_TONES = ['#f6d3b3', '#eab98c', '#c98a5b', '#9c6644', '#6f4e37', '#4a3728'];
export const HAIR_STYLES = ['short', 'buzz', 'afro', 'mohawk', 'long', 'bald'];
export const HAIR_COLORS = ['#161311', '#3b2a20', '#7b5334', '#b8860b', '#d9d3c9', '#c0392b'];

// 4-3-3 formation, expressed as fractions of half-pitch (x: 0 own goal .. 1 opp goal, z: -1..1)
export const FORMATION = [
  { role: 'GK',  x: 0.03, z: 0.0 },
  { role: 'LB',  x: 0.22, z: -0.68 },
  { role: 'CB',  x: 0.16, z: -0.24 },
  { role: 'CB',  x: 0.16, z: 0.24 },
  { role: 'RB',  x: 0.22, z: 0.68 },
  { role: 'CDM', x: 0.34, z: 0.0 },
  { role: 'CM',  x: 0.46, z: -0.32 },
  { role: 'CM',  x: 0.46, z: 0.32 },
  { role: 'LW',  x: 0.66, z: -0.62 },
  { role: 'ST',  x: 0.72, z: 0.0 },
  { role: 'RW',  x: 0.66, z: 0.62 },
];

const FIRST = ['Kai', 'Rio', 'Mateo', 'Luka', 'Ezra', 'Nico', 'Theo', 'Idris', 'Sami', 'Bruno',
  'Dario', 'Felix', 'Hugo', 'Ivo', 'Jonas', 'Koa', 'Lem', 'Milo', 'Otis', 'Pau', 'Ravi', 'Silas'];
const LAST = ['Varga', 'Okafor', 'Lindqvist', 'Moreau', 'Santini', 'Beck', 'Duarte', 'Ferro',
  'Grahn', 'Hale', 'Iversen', 'Juric', 'Kade', 'Larsen', 'Mbeki', 'Novak', 'Oduya', 'Pryce',
  'Quill', 'Rask', 'Soler', 'Toure'];

export function generateName(rng) {
  const f = FIRST[Math.floor(rng() * FIRST.length)];
  const l = LAST[Math.floor(rng() * LAST.length)];
  return `${f} ${l}`;
}

// Deterministic small PRNG so squads are stable per team id.
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
