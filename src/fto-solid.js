// Convex pieces obtained by cutting the octahedron at the FTO layer planes.
const solidDot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const solidMean = points => [0, 1, 2].map(i => points.reduce((s, p) => s + p[i], 0) / points.length);
const solidCross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function solidClip(faces, axis, limit) {
  const output = [], cuts = [];
  for (const face of faces) {
    const polygon = [];
    face.points.forEach((a, i) => {
      const b = face.points[(i + 1) % face.points.length];
      const da = solidDot(a, axis) - limit, db = solidDot(b, axis) - limit;
      if (da <= 1e-8) polygon.push(a);
      if ((da < -1e-8 && db > 1e-8) || (da > 1e-8 && db < -1e-8)) {
        const p = a.map((v, k) => v + (b[k] - v) * da / (da - db));
        polygon.push(p); cuts.push(p);
      }
    });
    if (polygon.length >= 3) output.push({ ...face, points: polygon });
  }
  const unique = [...new Map(cuts.map(p => [p.map(v => v.toFixed(6)).join(','), p])).values()];
  if (unique.length >= 3) {
    const center = solidMean(unique), u = solidCross(axis, [1, 0, 0]), v = solidCross(axis, u);
    unique.sort((a, b) => {
      const angle = p => { const d = p.map((x, i) => x - center[i]); return Math.atan2(solidDot(d, v), solidDot(d, u)); };
      return angle(a) - angle(b);
    });
    output.push({ points: unique, normal: axis, sticker: null });
  }
  return output;
}
export function createFtoSolids(normals, stickers) {
  let cells = [Object.entries(normals).map(([face, normal]) => ({
    face, normal, points: normal.map((s, i) => [0, 1, 2].map(k => k === i ? 9 * s : 0))
  }))];
  for (const axis of Object.values(normals).slice(0, 4)) {
    for (const limit of [-3, 3]) {
      cells = cells.flatMap(cell => {
        const depths = cell.flatMap(f => f.points.map(p => solidDot(p, axis) - limit));
        if (Math.min(...depths) >= -1e-8 || Math.max(...depths) <= 1e-8) return [cell];
        return [solidClip(cell, axis, limit), solidClip(cell, axis.map(v => -v), -limit)];
      });
    }
  }
  return cells.map(faces => {
    for (const face of faces) {
      if (!face.face) continue;
      const center = solidMean(face.points);
      face.sticker = stickers.find(s => s.face === face.face && s.position.every((v, i) => Math.abs(v - center[i]) < 1e-6))?.id;
    }
    return { faces, center: solidMean(faces.flatMap(f => f.points)) };
  }).filter(cell => cell.faces.some(f => f.sticker));
}
export function rotateFtoPoint(point, axis, angle) {
  const n = axis.map(v => v / Math.hypot(...axis));
  const cross = solidCross(n, point), d = solidDot(n, point), c = Math.cos(angle), s = Math.sin(angle);
  return point.map((v, i) => v*c + cross[i]*s + n[i]*d*(1-c));
}
export function ftoPieceMoves(center, move, normals) {
  const axis = normals[move.replace(/[ws]$/, '')], depth = solidDot(center, axis);
  return move.endsWith('s') ? Math.abs(depth) < 3 - 1e-6 : move.endsWith('w') ? depth > -3 + 1e-6 : depth > 3 + 1e-6;
}
