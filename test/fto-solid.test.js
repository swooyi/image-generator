import test from 'node:test';
import assert from 'node:assert/strict';
import { createFtoSolids, rotateFtoPoint, ftoPieceMoves } from '../src/fto-solid.js';
import { FACE_NORMALS, STICKERS, createPermutation } from '../src/fto-engine.js';
const pieces = createFtoSolids(FACE_NORMALS, STICKERS);
test('42 solid pieces cover all 72 stickers exactly once', () => {
  assert.equal(pieces.length, 42);
  const ids = pieces.flatMap(p => p.faces.map(f => f.sticker).filter(Boolean));
  assert.equal(ids.length, 72);
  assert.deepEqual(new Set(ids), new Set(STICKERS.map(s => s.id)));
  assert.deepEqual(pieces.reduce((counts, p) => {
    const n = p.faces.filter(f => f.sticker).length; counts[n] = (counts[n] || 0) + 1; return counts;
  }, {}), {1:24, 2:12, 4:6});
});
for (const move of [...Object.keys(FACE_NORMALS), ...Object.keys(FACE_NORMALS).map(f => f+'w'), 'Us','Fs','Rs','Ls']) {
  test(`${move}: solid animation endpoints agree with engine for every sticker`, () => {
    const permutation = createPermutation(move), axis = FACE_NORMALS[move.replace(/[ws]$/, '')];
    for (const piece of pieces) for (const face of piece.faces.filter(f => f.sticker)) {
      const source = STICKERS.find(s => s.id === face.sticker), destination = STICKERS.find(s => s.id === permutation[source.id]);
      const moving = ftoPieceMoves(piece.center, move, FACE_NORMALS);
      const end = moving ? rotateFtoPoint(source.position, axis, -2*Math.PI/3) : source.position;
      assert.ok(end.every((v,i) => Math.abs(v-destination.position[i]) < 1e-6));
    }
  });
}
