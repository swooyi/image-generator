import { FRAMES, cubeGeometry } from './cube-engine.js';

export function cubeTurnAxis(move) {
  return FRAMES[({ x: 'R', y: 'U', z: 'F', M: 'L', E: 'D', S: 'F' })[move] || move.replace(/^\d+/, '')[0]][0];
}

export function cubeLayerMoves(position, move, size = 3) {
  if (move === '.') return false;
  if (/^[xyz]$/.test(move)) return true;
  const depth = position.reduce((sum, value, i) => sum + value * cubeTurnAxis(move)[i], 0);
  const half = (size - 1) / 2;
  return /^[MES]$/.test(move) ? depth === 0 : move.endsWith('w') ? depth > half - (parseInt(move, 10) || 2) : depth === half;
}

const cubePieceCache = new Map();
export function createCubePieces(size = 3) {
  if (cubePieceCache.has(size)) return cubePieceCache.get(size);
  const stickers = new Map(cubeGeometry(size).map(s => [s.id[0] + '/' + s.position.join(','), s.id]));
  const half = (size - 1) / 2, pieces = [];
  for (let x = -half; x <= half; x++) for (let y = -half; y <= half; y++) for (let z = -half; z <= half; z++) {
    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== half) continue;
    const center = [x,y,z];
    pieces.push({ center, faces: Object.entries(FRAMES).map(([face, [normal, right, down]]) => ({
      normal, sticker: stickers.get(face + '/' + center.join(',')),
      points: [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => center.map((v,i) => v + normal[i]*0.48 + (right[i]*a + down[i]*b)*0.48))
    })) });
  }
  cubePieceCache.set(size, pieces);
  return pieces;
}

export function rotateCubePoint(p, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const d = p.reduce((sum, value, i) => sum + value * axis[i], 0);
  const cross = [axis[1]*p[2]-axis[2]*p[1], axis[2]*p[0]-axis[0]*p[2], axis[0]*p[1]-axis[1]*p[0]];
  return p.map((value, i) => value*c + cross[i]*s + axis[i]*d*(1-c));
}

export function cubeTurnAngle(token) {
  return token.move === '.' ? 0 : (token.turns === 3 ? 1 : -token.turns) * Math.PI / 2;
}
