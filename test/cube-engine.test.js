import test from 'node:test';
import assert from 'node:assert/strict';
import { identityState, solvedState, applyTokens, parseNotation, invertTokens, caseState, parseBatch, validateFilename } from '../src/cube-engine.js';

const apply = (alg, base = identityState()) => applyTokens(base, parseNotation(alg));
const moves = ['U','D','F','B','R','L','x','y','z','M','E','S','Uw','Dw','Fw','Bw','Rw','Lw'];
test('all cube moves are bijections and have order four', () => {
  for (const move of moves) {
    const result = apply(move);
    assert.equal(new Set(Object.values(result)).size, 54, move);
    assert.deepEqual(Object.keys(result).sort(), Object.keys(identityState()).sort());
    assert.deepEqual(apply(`${move} ${move} ${move} ${move}`), identityState(), move);
    assert.deepEqual(apply(`${move} ${move}'`), identityState(), move);
    assert.deepEqual(apply(`${move}2`), apply(`${move} ${move}`), move);
  }
});
test('known clockwise face directions and adjacent strips', () => {
  const r = apply('R');
  assert.equal(r.U2, 'F2'); assert.equal(r.U5, 'F5'); assert.equal(r.U8, 'F8');
  assert.equal(r.B6, 'U2'); assert.equal(r.D8, 'B0'); assert.equal(r.F8, 'D8');
  assert.equal(r.R2, 'R0'); assert.equal(r.R8, 'R2');
  const u = apply('U');
  assert.equal(u.F0, 'R0'); assert.equal(u.L0, 'F0'); assert.equal(u.B0, 'L0'); assert.equal(u.R0, 'B0');
  const f = apply('F');
  assert.equal(f.R0, 'U6'); assert.equal(f.D2, 'R0'); assert.equal(f.L8, 'D2');
});
test('wide, slice and whole rotations agree with standard identities', () => {
  for (const [left, right] of [['Rw', "R M'"], ['Lw', 'L M'], ['Uw', "U E'"], ['Dw', 'D E'], ['Fw', 'F S'], ['Bw', "B S'"], ['x', "R M' L'"], ['y', "U E' D'"], ['z', "F S B'"]]) assert.deepEqual(apply(left), apply(right), left);
});
test('parser accepts compact notation and aliases but rejects malformed tokens', () => {
  assert.deepEqual(parseNotation("RUR'U'"), parseNotation("R U R' U'"));
  assert.deepEqual(parseNotation("r u2 f' R3 L'2"), parseNotation("Rw Uw2 Fw' R' L2"));
  for (const bad of ["R''", 'R22', 'R23', 'R32', 'R, U', 'Q', 'X', '3Rw', '(R U)', 'R2\'']) assert.throws(() => parseNotation(bad), bad);
});
test('algorithm inverse restores labeled stickers and painted colors', () => {
  const alg = "R U2 F' M E2 S x y' z2 r u' B";
  const tokens = parseNotation(alg);
  const base = { ...solvedState(), F2: '#123456' };
  assert.deepEqual(applyTokens(applyTokens(base, tokens), invertTokens(tokens)), base);
  assert.deepEqual(applyTokens(caseState(base, alg, 'alg'), tokens), base);
  assert.equal(apply('R', base).U2, '#123456');
});
test('source map allows editing the same physical sticker after algorithm and view changes', () => {
  const sources = apply("R y");
  const base = solvedState();
  const target = 'F0';
  base[sources[target]] = '#123456';
  assert.equal(apply('R y', base)[target], '#123456');
  assert.deepEqual(apply("R U R' U' ".repeat(6)), identityState());
});
test('batch entries are independent, with item-level validation', () => {
  const items = parseBatch(JSON.stringify([{ filename: 'one', scramble: 'R' }, { filename: 'two', scramble: '' }, { filename: '../bad', scramble: 'U' }, { filename: 'bad-alg', scramble: 'Q' }, null]));
  assert.equal(items.filter(i => i.error).length, 3);
  assert.deepEqual(caseState(solvedState(), items[1].scramble, 'setup'), solvedState());
  assert.throws(() => parseBatch('[]')); assert.throws(() => parseBatch('{}')); assert.throws(() => parseBatch('{'));
  for (const bad of ['', '..', 'CON', 'aux.txt', 'a/', 'a.', 'a ']) assert.throws(() => validateFilename(bad));
});
