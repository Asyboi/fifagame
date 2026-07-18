// ── Apply Cerebras-generated avatar code to a player rig ────────
// The server already syntax-checked and dry-ran the code; this is the
// last line of defense in the browser: run it, verify the rig still
// looks like a playable humanoid, otherwise fall back to the standard
// build. Ported from the FABLE CUP handoff.
import { buildPlayer } from '../game/rig.js';

const FORBIDDEN =
  /\b(import|require|fetch|XMLHttpRequest|window|document|localStorage|eval|setTimeout|setInterval|WebSocket|Worker|globalThis)\b/;

/**
 * @param {object} THREE  three.js namespace
 * @param {string} code   generated source defining buildCustomAvatar
 * @param {object} rig    { group, parts, mat, kitPrimary, kitTrim, shortsColor, skinTone }
 * @returns {boolean} true if applied
 */
export function applyGeneratedAvatar(THREE, code, rig) {
  if (!code) return false;
  try {
    const banned = code.match(FORBIDDEN);
    if (banned) throw new Error(`forbidden token: ${banned[0]}`);
    const factory = new Function(
      'THREE', 'rig',
      `'use strict';\n${code}\nbuildCustomAvatar(THREE, rig);`
    );
    factory(THREE, rig);
    const box = new THREE.Box3().setFromObject(rig.group);
    const height = box.max.y - box.min.y;
    if (height < 1 || height > 3) {
      throw new Error(`avatar height ${height.toFixed(2)} out of range`);
    }
    return true;
  } catch (err) {
    console.warn('generated avatar rejected, using standard build:', err);
    return false;
  }
}

/**
 * Single entry point: builds the player rig, letting AI-generated code
 * own the full look (base is built bald so custom hair doesn't clash).
 * Falls back to the standard build if the code fails or is absent.
 * cfg: buildPlayer cfg + { avatarCode }
 */
export function buildCustomOrStandard(THREE, cfg) {
  const { avatarCode, ...rest } = cfg;
  if (avatarCode) {
    const rig = buildPlayer({ ...rest, hairStyle: 'bald' });
    const ok = applyGeneratedAvatar(THREE, avatarCode, {
      group: rig.group,
      parts: rig.parts,
      mat: (hex) => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.85 }),
      kitPrimary: rest.kit?.primary,
      kitTrim: rest.kit?.trim,
      shortsColor: rest.kit?.shorts,
      skinTone: rest.skin,
    });
    if (ok) return rig;
    disposeQuietly(rig);
  }
  return buildPlayer(rest);
}

function disposeQuietly(rig) {
  try {
    rig.group.traverse((o) => o.geometry?.dispose?.());
  } catch { /* best effort */ }
}
