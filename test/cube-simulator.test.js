import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, cubeGeometry, identityState, parseNotation, applyTokens, invertTokens } from '../src/cube-engine.js';
import { cubeTurnAxis, cubeLayerMoves, rotateCubePoint, cubeTurnAngle, createCubePieces } from '../src/cube-simulator-model.js';

for (const size of [2,3,4,5,6,7]) {
  test(`${size}x${size}: geometry, wide turns and animation agree`, () => {
    const stickers = cubeGeometry(size), identity = identityState(size);
    assert.equal(stickers.length,6*size*size);
    const rendered = createCubePieces(size).flatMap(p => p.faces.map(f => f.sticker).filter(Boolean));
    assert.equal(new Set(rendered).size,6*size*size);
    assert.equal(rendered.length,stickers.length);
    assert.equal(createCubePieces(size).length,size**3-(size-2)**3);
    const moves = ['U','D','R','L','F','B','x','y','z'];
    for (let layers=2;layers<size;layers++) for (const face of ['U','D','R','L','F','B']) moves.push(`${layers}${face}w`);
    if (size%2) moves.push('M','E','S');
    const locations = new Map(stickers.map(s => [[...s.position,...s.normal].join(','),s.id]));
    const run = text => applyTokens(identity,parseNotation(text,size),size);
    for (const move of moves) {
      assert.deepEqual(run(`${move} ${move} ${move} ${move}`),identity,move);
      assert.deepEqual(run(`${move} ${move}'`),identity,move);
      for (const suffix of ['',"'",'2']) {
        const token = parseNotation(move+suffix,size)[0], result = run(move+suffix);
        assert.equal(new Set(Object.values(result)).size,stickers.length);
        for (const sticker of stickers) {
          const rotate = p => cubeLayerMoves(sticker.position,token.move,size) ? rotateCubePoint(p,cubeTurnAxis(token.move),cubeTurnAngle(token)).map(v => Math.round(v*2)/2 || 0) : p;
          const destination = locations.get([...rotate(sticker.position),...rotate(sticker.normal)].join(','));
          assert.equal(result[destination],sticker.id,`${size}/${move}${suffix}`);
        }
      }
    }
    if (size > 2) {
      assert.deepEqual(applyTokens(identity,parseNotation(`${size-1}Rw L'`,size),size),run('x'));
      assert.deepEqual(parseNotation('Rw',size),parseNotation('2Rw',size));
    }
    if (size%2) {
      const result = run('M');
      for (const s of stickers.filter(s => s.position[0] !== 0)) assert.equal(result[s.id],s.id);
    }
    for (const invalid of ['1Rw',`${size}Rw`,'8Rw','0Rw']) assert.throws(() => parseNotation(invalid,size));
    if (size !== 3) for (const alias of ['r','u','l','d','f','b']) assert.throws(() => parseNotation(alias,size));
    if (!(size%2)) for (const slice of ['M','E','S']) assert.throws(() => parseNotation(slice,size));
  });
}

test('3x3 animation endpoints agree with every engine move and suffix', () => {
  for (const move of ['U','D','F','B','R','L','Uw','Dw','Fw','Bw','Rw','Lw','M','E','S','x','y','z']) {
    for (const suffix of ['', "'", '2']) {
      const token = parseNotation(move+suffix)[0];
      const result = applyTokens(identityState(),[token]);
      for (const sticker of geometry) {
        const rotate = p => cubeLayerMoves(sticker.position,move) ? rotateCubePoint(p,cubeTurnAxis(move),cubeTurnAngle(token)).map(v => Math.round(v) || 0) : p;
        const position = rotate(sticker.position), normal = rotate(sticker.normal);
        const destination = geometry.find(s => s.position.every((v,i) => v === position[i]) && s.normal.every((v,i) => v === normal[i]));
        assert.ok(destination,move+suffix);
        assert.equal(result[destination.id],sticker.id,move+suffix);
      }
    }
  }
});

test('3x3 dots preserve state and inverse algorithms', () => {
  const tokens = parseNotation("R...x2 . M' Uw");
  assert.deepEqual(applyTokens(identityState(),tokens),applyTokens(identityState(),parseNotation("R x2 M' Uw")));
  assert.deepEqual(applyTokens(applyTokens(identityState(),invertTokens(tokens)),tokens),identityState());
});
