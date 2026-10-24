// Face rows and columns are defined while looking directly at each face.
export const FACE_COLORS = { U: "#ffffff", R: "#ff0d00", F: "#67e000", D: "#fff100", L: "#ff981c", B: "#1265ff" };
export const BLANK_COLOR = "#2c2d2d";
export const FRAMES = {
  U: [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
  R: [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
  F: [[0, 0, 1], [1, 0, 0], [0, -1, 0]],
  D: [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
  L: [[-1, 0, 0], [0, 0, 1], [0, -1, 0]],
  B: [[0, 0, -1], [-1, 0, 0], [0, -1, 0]]
};
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const key = (p, n) => [...p, ...n].join(",");
const cubeGeometryCache = new Map();
export function validateCubeSize(size) {
  if (!Number.isInteger(size) || size < 2 || size > 7) throw new Error('큐브 크기는 2~7이어야 합니다.');
  return size;
}
export function cubeGeometry(size = 3) {
  validateCubeSize(size);
  if (!cubeGeometryCache.has(size)) {
    const half = (size - 1) / 2;
    cubeGeometryCache.set(size, Object.entries(FRAMES).flatMap(([face, [normal, right, down]]) =>
      Array.from({ length: size * size }, (_, index) => ({
        id: `${face}${index}`, normal,
        position: normal.map((v, i) => v * half + right[i] * (index % size - half) + down[i] * (Math.floor(index / size) - half))
      }))
    ));
  }
  return cubeGeometryCache.get(size);
}
export const geometry = cubeGeometry();

export function solvedState(size = 3) {
  return Object.fromEntries(cubeGeometry(size).map(s => [s.id, FACE_COLORS[s.id[0]]]));
}

export function identityState(size = 3) {
  return Object.fromEntries(cubeGeometry(size).map(s => [s.id, s.id]));
}

export function parseNotation(text, size = 3) {
  validateCubeSize(size);
  const tokens = [];
  let offset = 0;
  while (offset < text.length) {
    const rest = text.slice(offset);
    const space = rest.match(/^\s+/);
    if (space) { offset += space[0].length; continue; }
    if (rest[0] === '.') { tokens.push({ move: '.', turns: 0 }); offset++; continue; }
    const match = rest.match(/^([1-9]\d*[UDFBRL]w|[UDFBRL]w|[UDFBRLudfbrlMESxyz])('2|2|'|3)?/);
    if (!match || /'/.test(rest[match[0].length] || " ") || (/\d/.test(rest[match[0].length] || " ") && !/^[1-9]\d*[UDFBRL]w/.test(rest.slice(match[0].length)))) {
      throw new Error(`${offset + 1}번째 문자 부근의 회전기호를 확인하세요: ${rest.slice(0, 12)}`);
    }
    let move = match[1];
    if (/^[udfbrl]$/.test(move)) {
      if (size !== 3) throw new Error('소문자 회전은 3×3×3에서만 사용할 수 있습니다.');
      move = `${move.toUpperCase()}w`;
    }
    if (/^[MES]$/.test(move) && size % 2 === 0) throw new Error('M/E/S는 홀수 큐브에서만 사용할 수 있습니다.');
    if (move.endsWith('w')) {
      const layers = parseInt(move, 10) || 2;
      if (layers < 2 || layers >= size) throw new Error(`${size}×${size}×${size}에서 ${move}는 사용할 수 없습니다. (2 ≤ 층 수 < ${size})`);
      if (layers === 2) move = move.replace(/^2/, '');
    }
    tokens.push({ move, turns: match[2] === "2" || match[2] === "'2" ? 2 : match[2] === "'" || match[2] === "3" ? 3 : 1 });
    offset += match[0].length;
  }
  return tokens;
}

export function invertTokens(tokens) {
  return tokens.slice().reverse().map(t => ({ move: t.move, turns: t.move === '.' ? 0 : 4 - t.turns }));
}

const cubePermutationCache = new Map();
export function applyTokens(input, tokens, size = 3) {
  const stickers = cubeGeometry(size), half = (size - 1) / 2;
  let result = { ...input };
  for (const { move, turns } of tokens) {
    if (move === '.') continue;
    const cacheKey = `${size}/${move}/${turns}`;
    if (cubePermutationCache.has(cacheKey)) {
      const next = { ...result };
      for (const [from, to] of cubePermutationCache.get(cacheKey)) next[to] = result[from];
      result = next;
      continue;
    }
    const locations = new Map(stickers.map(s => [key(s.position, s.normal), s.id]));
    const reference = ({ x: "R", y: "U", z: "F", M: "L", E: "D", S: "F" })[move] || move.replace(/^\d+/, '')[0];
    const axis = FRAMES[reference][0];
    const whole = /^[xyz]$/.test(move);
    const slice = /^[MES]$/.test(move);
    const rotate = vector => {
      let v = vector;
      for (let turn = 0; turn < turns; turn += 1) {
        const perpendicular = cross(axis, v);
        v = axis.map((a, i) => a * dot(axis, v) - perpendicular[i]);
      }
      return v;
    };
    const next = { ...result }, permutation = [];
    for (const sticker of stickers) {
      const layer = dot(sticker.position, axis);
      const moving = whole || (slice ? layer === 0 : move.endsWith("w") ? layer > half - (parseInt(move, 10) || 2) : layer === half);
      const destination = moving ? locations.get(key(rotate(sticker.position), rotate(sticker.normal))) : sticker.id;
      permutation.push([sticker.id, destination]);
      next[destination] = result[sticker.id];
    }
    cubePermutationCache.set(cacheKey, permutation);
    result = next;
  }
  return result;
}

export function caseState(base, notation, mode, size = 3) {
  const tokens = parseNotation(notation, size);
  return applyTokens(base, mode === "alg" ? invertTokens(tokens) : tokens, size);
}

export function validateFilename(name) {
  if (typeof name !== "string" || !name.trim() || name.length > 80 || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error("파일명은 80자 이내이며, 예약 이름이나 특수문자·끝의 점/공백을 포함할 수 없습니다.");
  }
  return name;
}

export function parseBatch(text, size = 3) {
  let items;
  try { items = JSON.parse(text); } catch { throw new Error("JSON 문법을 확인하세요."); }
  if (!Array.isArray(items) || !items.length) throw new Error("하나 이상의 항목이 있는 JSON 배열을 입력하세요.");
  return items.map((item, index) => {
    try {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("객체 형식이어야 합니다.");
      validateFilename(item.filename);
      if (typeof item.scramble !== "string") throw new Error("scramble은 문자열이어야 합니다.");
      parseNotation(item.scramble, size);
      return { filename: item.filename, scramble: item.scramble };
    } catch (error) { return { filename: `항목 ${index + 1}`, error: error.message }; }
  });
}
