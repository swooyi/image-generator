// Integer sticker centroids on |x| + |y| + |z| = 9.
// CIF: +z faces the viewer; +x is upper right and +y upper left.
export const FACE_NORMALS = {
  U: [1, 1, 1], R: [1, -1, 1], F: [-1, -1, 1], L: [-1, 1, 1],
  B: [1, 1, -1], BR: [1, -1, -1], D: [-1, -1, -1], BL: [-1, 1, -1]
};

// Template IDs are drawing order, not a common clockwise numbering.
const WEIGHTS = {
  U: [[7,1,1],[4,4,1],[1,7,1],[2,5,2],[5,2,2],[4,1,4],[1,4,4],[2,2,5],[1,1,7]],
  R: [[7,1,1],[5,2,2],[4,1,4],[1,1,7],[4,4,1],[2,2,5],[2,5,2],[1,4,4],[1,7,1]],
  F: [[1,1,7],[2,2,5],[1,4,4],[4,1,4],[5,2,2],[2,5,2],[1,7,1],[4,4,1],[7,1,1]],
  L: [[1,7,1],[1,4,4],[2,5,2],[2,2,5],[4,4,1],[1,1,7],[4,1,4],[5,2,2],[7,1,1]]
};
WEIGHTS.B = [WEIGHTS.U[1], WEIGHTS.U[0], ...WEIGHTS.U.slice(2)];
WEIGHTS.BR = WEIGHTS.R;
WEIGHTS.D = [...WEIGHTS.F.slice(0,7), WEIGHTS.F[8], WEIGHTS.F[7]];
WEIGHTS.BL = WEIGHTS.L;

export const STICKERS = Object.entries(FACE_NORMALS).flatMap(([face, normal]) =>
  WEIGHTS[face].map((weights, index) => ({
    id: `${face}${index}`, face, normal,
    position: weights.map((value, axis) => value * normal[axis])
  }))
);
const key = (position, normal) => `${position.join(',')}/${normal.join(',')}`;
const byPosition = new Map(STICKERS.map(s => [key(s.position, s.normal), s.id]));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

// Rodrigues rotation by -120 degrees around an outward (±1, ±1, ±1) axis.
// Clockwise when looking directly at the turning face from outside.
function rotate(vector, axis) {
  const product = dot(vector, axis);
  const perpendicular = cross(axis, vector);
  return vector.map((value, i) => (-value + axis[i] * product - perpendicular[i]) / 2);
}

// Clockwise quarter turn around the front +z vertex when viewed from outside.
function rotateFrontVertexClockwise(vector) {
  return [vector[1], -vector[0], vector[2]];
}

export function createPermutation(move) {
  const face = move.replace(/[ws]$/, '');
  const axis = FACE_NORMALS[face];
  if (!axis) throw new Error(`지원하지 않는 회전: ${move}`);
  return Object.fromEntries(STICKERS.map(sticker => {
    const depth = dot(sticker.position, axis);
    const moves = move.endsWith('s') ? Math.abs(depth) < 3 : move.endsWith('w') ? depth > -3 : depth > 3;
    const destination = moves
      ? byPosition.get(key(rotate(sticker.position, axis), rotate(sticker.normal, axis)))
      : sticker.id;
    if (!destination) throw new Error(`회전 좌표 오류: ${move} / ${sticker.id}`);
    return [sticker.id, destination];
  }));
}

export function createOrientationPermutation(face) {
  if (face === 'V') {
    return Object.fromEntries(STICKERS.map(sticker => {
      const destination = byPosition.get(key(
        rotateFrontVertexClockwise(sticker.position),
        rotateFrontVertexClockwise(sticker.normal)
      ));
      if (!destination) throw new Error(`시점 회전 좌표 오류: Vo / ${sticker.id}`);
      return [sticker.id, destination];
    }));
  }
  const axis = FACE_NORMALS[face];
  if (!axis) throw new Error(`지원하지 않는 시점 회전: ${face}o`);
  return Object.fromEntries(STICKERS.map(sticker => {
    const destination = byPosition.get(key(rotate(sticker.position, axis), rotate(sticker.normal, axis)));
    if (!destination) throw new Error(`시점 회전 좌표 오류: ${face}o / ${sticker.id}`);
    return [sticker.id, destination];
  }));
}

const permutations = new Map();
export function applyTokens(values, tokens) {
  let result = { ...values };
  for (const { move, suffix } of tokens) {
    if (move === '.') continue;
    if (move === 'T' || move.endsWith('o')) {
      result = applyOrientationTokens(result, [{ move: move === 'T' ? 'V' : move.slice(0, -1), suffix }]);
      continue;
    }
    if (!permutations.has(move)) permutations.set(move, createPermutation(move));
    const permutation = permutations.get(move);
    for (let turn = 0; turn < (suffix === "'" || suffix === '2' ? 2 : 1); turn++) {
      const next = {};
      for (const [source, destination] of Object.entries(permutation)) next[destination] = result[source];
      result = next;
    }
  }
  return result;
}

const orientationPermutations = new Map();
export function applyOrientationTokens(values, tokens) {
  let result = { ...values };
  for (const { move, suffix } of tokens) {
    if (!orientationPermutations.has(move)) {
      orientationPermutations.set(move, createOrientationPermutation(move));
    }
    const permutation = orientationPermutations.get(move);
    const turnCount = suffix === '2' ? 2 : suffix === "'" ? (move === 'V' ? 3 : 2) : 1;
    for (let turn = 0; turn < turnCount; turn++) {
      const next = {};
      for (const [source, destination] of Object.entries(permutation)) next[destination] = result[source];
      result = next;
    }
  }
  return result;
}

export const identityState = () => Object.fromEntries(STICKERS.map(s => [s.id, s.id]));
export const formatToken = token => token.move.endsWith('o') ? `{${token.move}${token.suffix}}` : token.move + token.suffix;
export const invertTokens = tokens => [...tokens].reverse().map(({ move, suffix }) => ({
  move, suffix: move === '.' ? '' : move === 'T' && suffix === '2' ? '2' : suffix === "'" || suffix === '2' ? '' : "'"
}));

export function parseNotation(input) {
  let rest = input.replace(/\/\/[^\n]*/g, '').replace(/[(),/]/g, ' ').replace(/[’′]/g, "'").trim();
  const tokens = [];
  const aliases = { S: "R' L R L'", H: "R B' R' B" };
  while (rest) {
    const special = rest.match(/^(?:\{([URF])o('|2|)\}|(T)(2|'|)|(\.))/);
    if (special) {
      tokens.push({ move: special[1] ? special[1] + 'o' : special[3] || '.', suffix: special[1] ? (special[2] === '2' ? "'" : special[2]) : special[4] || '' });
      rest = rest.slice(special[0].length).trimStart();
      continue;
    }
    const match = rest.match(/^(BLw|BRw|[UFLRBD]w|[UFRL]s|BL|BR|[UFLRBD]|S|H)(2|'|)/);
    if (!match) throw new Error(`지원하지 않는 표기: ${rest.split(/\s/)[0]}`);
    const [, move, rawSuffix] = match;
    if (aliases[move]) {
      if (rawSuffix === '2') throw new Error(`${move}2 대신 기본 회전으로 입력해 주세요.`);
      const expanded = parseNotation(aliases[move]);
      tokens.push(...(rawSuffix ? invertTokens(expanded) : expanded));
    } else tokens.push({ move, suffix: rawSuffix === '2' ? "'" : rawSuffix });
    rest = rest.slice(match[0].length).trimStart();
  }
  return tokens;
}
