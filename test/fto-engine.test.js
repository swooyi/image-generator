import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STICKERS, FACE_NORMALS, createPermutation, createOrientationPermutation, identityState, parseNotation, applyTokens, applyOrientationTokens, invertTokens, formatToken } from '../src/fto-engine.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const identity = identityState();
const run = text => applyTokens(identity, parseNotation(text));
const faces = Object.keys(FACE_NORMALS);
const moves = [...faces, ...faces.map(face => face + 'w'), 'Us', 'Fs', 'Rs', 'Ls'];

test('CIF notation supports vertex turns, face orientations and explicit pauses', () => {
  assert.deepEqual(run('T T T T'), identity);
  assert.deepEqual(run("T T'"), identity);
  assert.deepEqual(run('T2'), run('T T'));
  assert.deepEqual(run('T2 T2'), identity);
  assert.deepEqual(run('T'), applyOrientationTokens(identity, [{ move: 'V', suffix: '' }]));
  assert.deepEqual(run('U...T2 . R'), run('U T2 R'));
  for (const move of ['U', 'R', 'F']) {
    assert.deepEqual(run(`{${move}o}`), applyOrientationTokens(identity, [{ move, suffix: '' }]));
  }
  const tokens = parseNotation("T U...{Ro'} T2 F . T'");
  assert.deepEqual(applyTokens(applyTokens(identity, tokens), invertTokens(tokens)), identity);
  assert.deepEqual(parseNotation(tokens.map(formatToken).join(' ')), tokens);
  assert.deepEqual(invertTokens(invertTokens(tokens)), tokens);
  assert.notDeepEqual(run('T U'), run('U T'));
  for (const invalid of ['T3', "{Uo", '.2', "{Bo}"]) assert.throws(() => parseNotation(invalid));
});

for (const move of moves) {
  test(`${move}: bijection, three turns, inverse`, () => {
    const permutation = createPermutation(move);
    assert.equal(new Set(Object.values(permutation)).size, 72);
    assert.deepEqual(run(`${move} ${move} ${move}`), identity);
    assert.deepEqual(run(`${move} ${move}'`), identity);
    assert.deepEqual(run(`${move}2`), run(`${move}'`));
  });
}

for (const move of ['U', 'R', 'F', 'B']) {
  test(`{${move}o}: whole-puzzle bijection, three turns, inverse`, () => {
    const permutation = createOrientationPermutation(move);
    assert.equal(new Set(Object.values(permutation)).size, 72);
    assert.equal(Object.entries(permutation).filter(([source, destination]) => source !== destination).length, 72);
    assert.deepEqual(applyOrientationTokens(identity, [
      { move, suffix: '' }, { move, suffix: '' }, { move, suffix: '' }
    ]), identity);
    assert.deepEqual(applyOrientationTokens(
      applyOrientationTokens(identity, [{ move, suffix: '' }]),
      [{ move, suffix: "'" }]
    ), identity);
  });
}

test('{Vo}: front vertex rotation is a clockwise quarter-turn', () => {
  const permutation = createOrientationPermutation('V');
  assert.equal(new Set(Object.values(permutation)).size, 72);
  assert.deepEqual(
    ['U', 'R', 'F', 'L'].map(face => FACE_NORMALS[permutation[`${face}8`].slice(0, -1)]),
    [FACE_NORMALS.R, FACE_NORMALS.F, FACE_NORMALS.L, FACE_NORMALS.U]
  );
  assert.deepEqual(applyOrientationTokens(identity, Array.from({ length: 4 }, () => ({ move: 'V', suffix: '' }))), identity);
  assert.deepEqual(applyOrientationTokens(
    applyOrientationTokens(identity, [{ move: 'V', suffix: '' }]),
    [{ move: 'V', suffix: "'" }]
  ), identity);
});

const reference = read('./reference-moves.json');
for (const [move, expected] of Object.entries(reference.moves)) {
  test(`${move}: matches independent csTimer observation`, () => assert.deepEqual(run(move), expected));
}

test('long mixed algorithm cancels its inverse; Alg case is solved by its input', () => {
  const tokens = parseNotation("R U' F BL BR' D Lw Us Fs' B Uw R2 S H'");
  assert.deepEqual(applyTokens(applyTokens(identity, tokens), invertTokens(tokens)), identity);
  assert.deepEqual(applyTokens(applyTokens(identity, invertTokens(tokens)), tokens), identity);
});

test('blank colors follow their source sticker and survive changing setup', () => {
  const base = Object.fromEntries(STICKERS.map(s => [s.id, s.face]));
  const tokens = parseNotation('R U F');
  const sources = applyTokens(identity, tokens);
  base[sources.U8] = 'blank';
  assert.equal(applyTokens(base, tokens).U8, 'blank');
  assert.equal(base[sources.U8], 'blank');
  assert.deepEqual(applyTokens(applyTokens(base, tokens), invertTokens(tokens)), base);
});

test('parser normalizes suffixes, slices, aliases, separators and comments', () => {
  assert.deepEqual(parseNotation('Us Fs Rs Ls').map(t => t.move), ['Us','Fs','Rs','Ls']);
  assert.equal(invertTokens(parseNotation('U2')).map(formatToken).join(' '), 'U');
  assert.deepEqual(run('S H'), run("R' L R L' R B' R' B"));
  assert.deepEqual(run("(R, U) / F // comment\n B′"), run("R U F B'"));
  for (const invalid of ['M', 'R3', '[R,U]', 'S2', 'hello']) assert.throws(() => parseNotation(invalid));
});

test('CIF and EIF reference the same physical sticker IDs', () => {
  const cif = read('../src/assets/fto-template.json');
  const eif = read('../src/assets/fto-eif-template.json');
  assert.deepEqual(new Set(cif.stickers.map(s => s.id)), new Set(Object.keys(identity)));
  assert.equal(new Set(eif.stickers.map(s => s.id)).size, 60);
  for (const s of eif.stickers) assert.ok(s.id in identity);
  // EIF corner positions: white bottom vertex and the two neighboring sides
  // meet at the same physical +z corner.
  for (const id of ['U8','R3','L5']) {
    const s = eif.stickers.find(s => s.id === id);
    assert.ok(s.center.y > 275);
  }
});

test('all stickers belonging to one corner or edge move together', () => {
  const groups = new Map();
  for (const s of STICKERS) {
    const abs = s.position.map(Math.abs);
    let piece;
    if (abs.includes(7)) piece = s.position.map((v,i) => abs[i] === 7 ? Math.sign(v) : 0).join();
    else if (abs.includes(4)) piece = s.position.map((v,i) => abs[i] === 4 ? Math.sign(v) : 0).join();
    else continue;
    if (!groups.has(piece)) groups.set(piece, []);
    groups.get(piece).push(s.id);
  }
  const owner = Object.fromEntries([...groups].flatMap(([piece, ids]) => ids.map(id => [id, piece])));
  for (const move of moves) {
    const result = run(move);
    for (const ids of groups.values()) assert.equal(new Set(ids.map(id => owner[result[id]])).size, 1, move);
  }
});
