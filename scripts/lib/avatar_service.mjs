// ── Cerebras avatar generation service (World Stars Cup) ────────
// Ported from the FABLE CUP handoff (fifagame/handoff/README.md).
// Shared by the Vite dev middleware and the Vercel function.
//
// photo data URI → stage 1 (vision → appearance spec JSON)
//                → stage 2 (spec + photo → Three.js avatar code)
//                → dry-run validation on a mock rig → cached result
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { HAIR_STYLES } from '../../src/config.js';
import { TEAMS } from '../../src/teams.js';

const API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const MODEL = 'gemma-4-31b';
export const MAX_BODY = 14 * 1024 * 1024;

const CACHE_DIR = process.env.VERCEL
  ? '/tmp/avatar-cache'
  : path.resolve('.avatar-cache');

const log = (...args) =>
  console.log(`[avatar ${new Date().toLocaleTimeString()}]`, ...args);

// ── stage 1: appearance spec ─────────────────────────────────────
// This game supports arbitrary hex for skin/hair (photo-sampled), so the
// spec uses free hex + regex sanitisation instead of palette enums.
const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    skin_tone: { type: 'string', description: 'hex colour like #d9a06b' },
    hair_color: { type: 'string', description: 'hex colour like #3a2a1c' },
    hair_style: { type: 'string', enum: HAIR_STYLES },
    team_id: { type: 'string', enum: TEAMS.map((t) => t.id) },
    appearance: {
      type: 'string',
      description:
        'detailed physical description: build/proportions, exact hair shape, ' +
        'facial hair, glasses, accessories, clothing details, shoes, anything distinctive',
    },
    description: { type: 'string', description: 'one friendly sentence' },
  },
  required: ['skin_tone', 'hair_color', 'hair_style', 'team_id', 'appearance', 'description'],
  additionalProperties: false,
};

const KIT_GUIDE = TEAMS.map((t) => `${t.id}=${t.kit.primary}`).join(', ');
const SPEC_PROMPT =
  'You extract avatar traits for a soccer game. From the photo estimate the ' +
  'skin tone and hair colour as hex values, and pick the closest allowed hair ' +
  'style. For team_id pick the team whose kit colour best matches the ' +
  `person's clothing: ${KIT_GUIDE}. Write a rich "appearance" description of ` +
  'everything visually distinctive. Do not identify the person.';

// ── stage 2: Three.js code generation ────────────────────────────
const CODE_PROMPT = `You are an expert Three.js character artist for a low-poly soccer game.
Output ONLY JavaScript (no markdown fences, no commentary) defining exactly one function:

function buildCustomAvatar(THREE, rig) { ... }

rig = {
  group: THREE.Group — whole player, y-up, feet at y=0, about 1.75 tall,
  parts: {
    torso: Mesh at y=1.12 (kit-textured jersey — do NOT recolour or replace it),
    head:  Group at y=1.58 — BALD skin-tone head sphere r=0.155 at its origin,
    armL/armR: pivot Groups at the shoulders (y=1.38, x=-/+0.31) — children swing when animated,
    legL/legR: pivot Groups at the hips (y=0.62, x=-/+0.13) — limb meshes hang toward -y,
  },
  mat: (hex) => MeshStandardMaterial,
  kitPrimary, kitTrim, shortsColor, skinTone: hex strings,
}

The result must be unmistakably THIS person. Requirements:
1. HAIR from scratch (the head is bald): 3+ overlapping meshes matching the photo's
   silhouette — top volume, sides, back; sweep/part/curl it with rotated spheres/boxes.
2. FACE: eyebrows, nose, ears; plus facial hair and glasses if the photo shows them.
3. BODY: match their build by scaling limb/torso MESHES (never scale the pivot Groups).
4. DETAILS: wristbands, headbands, watch, sock/boot colours, arm skin meshes if the
   photo shows short sleeves — whatever is distinctive. Keep the jersey texture as-is.
5. Add AT LEAST 12 new meshes. Every mesh is a child of the correct pivot, positioned
   relative to that pivot, so the run/kick animations keep working.
Use only THREE geometry/material/mesh APIs and rig.mat. No textures, loaders, async,
imports, window, document, or timers. Max ~180 lines. Return nothing.`;

const FORBIDDEN =
  /\b(import|require|fetch|XMLHttpRequest|window|document|localStorage|eval|Function|setTimeout|setInterval|WebSocket|Worker|globalThis|process)\b/;

function stripFences(text) {
  return text.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
}

// ── validation: dry-run on a mock rig mirroring rig.js ──────────
function makeMockRig() {
  const mockMat = (c) =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(String(c || '#888888')) });
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.62, 10), mockMat('#1e3fae'));
  torso.position.y = 1.12;
  group.add(torso);
  const head = new THREE.Group();
  head.position.y = 1.58;
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), mockMat('#d9a06b')));
  group.add(head);
  const pivot = (x, y) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.5, 8), mockMat('#d9a06b'));
    m.position.y = -0.32;
    g.add(m);
    group.add(g);
    return g;
  };
  return {
    group,
    parts: {
      torso, head,
      armL: pivot(-0.31, 1.38), armR: pivot(0.31, 1.38),
      legL: pivot(-0.13, 0.62), legR: pivot(0.13, 0.62),
    },
    mat: mockMat,
    kitPrimary: '#1e3fae', kitTrim: '#f0f2fa', shortsColor: '#f0f2fa', skinTone: '#d9a06b',
  };
}

function validateCode(code) {
  if (!/function\s+buildCustomAvatar\s*\(/.test(code)) {
    throw new Error('missing buildCustomAvatar function');
  }
  const banned = code.match(FORBIDDEN);
  if (banned) throw new Error(`forbidden token: ${banned[0]}`);
  const rig = makeMockRig();
  const countNodes = () => {
    let n = 0;
    rig.group.traverse(() => n++);
    return n;
  };
  const before = countNodes();
  new Function('THREE', 'rig', `'use strict';\n${code}\nbuildCustomAvatar(THREE, rig);`)(THREE, rig);
  const added = countNodes() - before;
  if (added < 12) {
    throw new Error(`only ${added} meshes added - far too plain, add much more detail`);
  }
  const box = new THREE.Box3().setFromObject(rig.group);
  const height = box.max.y - box.min.y;
  if (!(height >= 1 && height <= 3)) {
    throw new Error(`avatar height ${height.toFixed(2)} out of range 1..3`);
  }
  return added;
}

const HEX = /^#[0-9a-f]{6}$/i;

function sanitizeSpec(spec) {
  const clean = {
    ...spec,
    skin_tone: HEX.test(spec.skin_tone) ? spec.skin_tone : '#d9a06b',
    hair_color: HEX.test(spec.hair_color) ? spec.hair_color : '#3a2a1c',
    hair_style: HAIR_STYLES.includes(spec.hair_style) ? spec.hair_style : 'short',
    team_id: TEAMS.some((t) => t.id === spec.team_id) ? spec.team_id : TEAMS[0].id,
  };
  for (const k of ['skin_tone', 'hair_color', 'hair_style', 'team_id']) {
    if (clean[k] !== spec[k]) log(`sanitized ${k}: '${spec[k]}' -> '${clean[k]}'`);
  }
  return clean;
}

// ── Cerebras plumbing ────────────────────────────────────────────
async function cerebras(messages, { schema = null, maxTokens = 1024 } = {}) {
  const payload = {
    model: MODEL,
    max_completion_tokens: maxTokens,
    temperature: 0.3,
    messages,
  };
  if (schema) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: { name: 'avatar_spec', strict: true, schema },
    };
  }
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body?.message || `Cerebras error ${resp.status}`);
  const u = body.usage ?? {};
  log(`tokens: prompt=${u.prompt_tokens} image=${u.image_tokens} completion=${u.completion_tokens}`);
  return body.choices[0].message.content;
}

const userContent = (text, imageUri) => [
  { type: 'text', text },
  { type: 'image_url', image_url: { url: imageUri } },
];

async function generateAvatar(imageUri) {
  log('stage 1/2: extracting appearance spec...');
  const spec = sanitizeSpec(JSON.parse(await cerebras(
    [
      { role: 'system', content: SPEC_PROMPT },
      { role: 'user', content: userContent('Describe this person for an avatar.', imageUri) },
    ],
    { schema: SPEC_SCHEMA }
  )));
  log('spec:', JSON.stringify(spec));

  log('stage 2/2: generating Three.js avatar code...');
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const nudge = lastError
      ? ` Previous attempt failed validation: ${lastError}. Output only valid JavaScript.`
      : '';
    const raw = await cerebras(
      [
        { role: 'system', content: CODE_PROMPT },
        {
          role: 'user',
          content: userContent(
            `Appearance spec: ${JSON.stringify(spec)}. Write buildCustomAvatar now.${nudge}`,
            imageUri
          ),
        },
      ],
      { maxTokens: 6144 }
    );
    const code = stripFences(raw);
    try {
      const added = validateCode(code);
      log(`code validated on attempt ${attempt} (${code.split('\n').length} lines, ${added} meshes added)`);
      return { spec, code };
    } catch (err) {
      lastError = String(err.message || err);
      log(`attempt ${attempt} rejected: ${lastError}`);
    }
  }
  log('code generation failed 3x - shipping spec only (standard build)');
  return { spec, code: null };
}

/** Generate with a content-addressed cache. Returns { spec, code }. */
export async function generateAvatarCached(imageUri) {
  if (!imageUri?.startsWith('data:image/')) {
    throw new Error('expected a data:image/... URI');
  }
  const hash = crypto.createHash('sha256').update(imageUri).digest('hex').slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, `${hash}.json`);
  try {
    if (fs.existsSync(cacheFile)) {
      log(`cache hit ${hash}`);
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }
  } catch { /* cache is best-effort */ }

  const started = Date.now();
  log(`generating avatar for photo ${hash}...`);
  const result = await generateAvatar(imageUri);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(result));
  } catch { /* cache is best-effort */ }
  log(`done in ${Date.now() - started}ms (${hash})`);
  return result;
}
