import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samplePortrait, FALLBACK_SKIN, FALLBACK_HAIR } from '../src/avatar/sampler.js';
import { hexToRgb } from '../src/utils.js';

/** Build a synthetic portrait: hair band on top, face in the middle. */
function makePortrait({ w = 64, h = 64, skin = [217, 160, 107], hair = [40, 28, 16], background = [220, 225, 230] } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c = background;
      const nx = x / w; const ny = y / h;
      if (nx > 0.25 && nx < 0.75 && ny > 0.15 && ny < 0.75) c = skin; // face block
      if (nx > 0.25 && nx < 0.75 && ny < 0.18) c = hair;              // hair band
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

test('detects skin tone from the central face region', () => {
  const r = samplePortrait(makePortrait({ skin: [200, 140, 90] }));
  assert.ok(r.skinOk);
  const { r: rr, g, b } = hexToRgb(r.skin);
  assert.ok(Math.abs(rr - 200) < 25 && Math.abs(g - 140) < 25 && Math.abs(b - 90) < 25);
});

test('detects dark hair from the top band', () => {
  const r = samplePortrait(makePortrait({ hair: [30, 22, 14] }));
  assert.ok(r.hairOk);
  const { r: rr, g, b } = hexToRgb(r.hair);
  assert.ok(rr < 90 && g < 80 && b < 80, 'dark hair stays dark');
});

test('bright top band (bald / bright background) is not trusted as hair', () => {
  const r = samplePortrait(makePortrait({ hair: [225, 228, 232] }));
  assert.equal(r.hairOk, false);
  assert.equal(r.hair, FALLBACK_HAIR);
});

test('no skin in the middle => fallback skin, still resolves', () => {
  const r = samplePortrait(makePortrait({ skin: [10, 10, 12] }));
  assert.equal(r.skinOk, false);
  assert.equal(r.skin, FALLBACK_SKIN);
});

test('garbage input returns safe fallbacks instead of throwing', () => {
  assert.deepEqual(samplePortrait({}), {
    skin: FALLBACK_SKIN, hair: FALLBACK_HAIR, skinOk: false, hairOk: false,
  });
  const r = samplePortrait({ data: new Uint8ClampedArray(4), width: 10, height: 10 });
  assert.equal(r.skinOk, false);
});
