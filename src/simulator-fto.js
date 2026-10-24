const simCanvas = document.querySelector('#sim-canvas');
const simContext = simCanvas.getContext('2d');
const simPieces = createFtoSolids(FACE_NORMALS, STICKERS);
let simSources = identityState(), simIndex = 0, simSignature = '', simAnimation = null;
let simPlaying = false, simYaw = 0, simPitch = 0, simZoom = 1, simHits = [];
let simPointer = null;
let simViewBasis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const simEl = id => document.getElementById(id);

function simPlaybackTokens() {
  return els.mode.value === 'alg' ? invertTokens(state.lastTokens) : state.lastTokens;
}
function simStateTokens(index) {
  const prefix = simPlaybackTokens().slice(0, index);
  return els.mode.value === 'alg' ? [...state.lastTokens, ...prefix] : prefix;
}
function simulatorRefresh() {
  const signature = JSON.stringify([state.lastTokens, state.valid, els.mode.value]);
  if (signature !== simSignature) {
    simSignature = signature;
    simAnimation = null; simPlaying = false;
    simIndex = state.valid && els.mode.value !== 'alg' ? state.lastTokens.length : 0;
  }
  simSources = applyTokens(identityState(), state.valid ? simStateTokens(simIndex) : []);
  simDraw();
}
function simCamera(p) {
  const oriented = p.map((_, i) => p.reduce((sum, value, j) => sum + value * simViewBasis[j][i], 0));
  const cif = rotateFtoPoint(oriented, [0, 0, 1], Math.PI / 4);
  return rotateFtoPoint(rotateFtoPoint(cif, [0, 1, 0], simYaw), [1, 0, 0], simPitch);
}
function simRoundedPath(points, radius) {
  const path = new Path2D();
  points.forEach((point, i) => {
    const before = points[(i + points.length - 1) % points.length];
    const after = points[(i + 1) % points.length];
    const left = Math.hypot(before[0]-point[0], before[1]-point[1]);
    const right = Math.hypot(after[0]-point[0], after[1]-point[1]);
    const r = Math.min(radius, left*0.18, right*0.18);
    const entry = point.map((v, k) => v + (before[k]-v)*r/(left || 1));
    const exit = point.map((v, k) => v + (after[k]-v)*r/(right || 1));
    if (i === 0) path.moveTo(...entry); else path.lineTo(...entry);
    path.quadraticCurveTo(...point, ...exit);
  });
  path.closePath();
  return path;
}
function simDraw() {
  const width = simCanvas.clientWidth, height = simCanvas.clientHeight, ratio = window.devicePixelRatio || 1;
  if (simCanvas.width !== Math.round(width*ratio) || simCanvas.height !== Math.round(height*ratio)) {
    simCanvas.width = Math.round(width*ratio); simCanvas.height = Math.round(height*ratio);
  }
  simContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  simContext.clearRect(0, 0, width, height);
  const scale = Math.min(width, height) / 23 * simZoom;
  const polygons = [];
  for (const piece of simPieces) {
    const moving = simAnimation && simAnimation.token.move !== '.' && (simAnimation.whole || ftoPieceMoves(piece.center, simAnimation.token.move, FACE_NORMALS));
    const transform = p => simCamera(moving ? rotateFtoPoint(p, simAnimation.axis, simAnimation.angle) : p);
    for (const face of piece.faces) {
      const normal = transform(face.normal);
      if (normal[2] <= 1e-7) continue;
      const points = face.points.map(p => transform(p.map((v, i) => piece.center[i] + (v-piece.center[i])*0.985)));
      polygons.push({ face, normal, depth: solidMean(points)[2], points: points.map(p => [width/2 + p[0]*scale, height/2 - p[1]*scale]) });
    }
  }
  polygons.sort((a, b) => a.depth - b.depth);
  simHits = [];
  for (const {face, points} of polygons) {
    const path = simRoundedPath(points, scale*0.16);
    const source = simSources[face.sticker];
    simContext.fillStyle = face.sticker ? state.baseColors[source] : '#20242b';
    simContext.fill(path);
    simContext.strokeStyle = '#30353d'; simContext.lineWidth = 1.15;
    simContext.lineJoin = 'round'; simContext.lineCap = 'round'; simContext.stroke(path);
    // Include dark internal faces so hidden stickers cannot be clicked through them.
    simHits.push({path, source});
    const label = face.sticker && ((els.showStickerText.checked && state.stickerTexts[source]) || (els.showLabels.checked && face.sticker));
    if (label) {
      const center = solidMean(points).slice(0, 2);
      simContext.font = 'bold 13px sans-serif'; simContext.textAlign = 'center'; simContext.textBaseline = 'middle';
      simContext.lineWidth = 3; simContext.strokeStyle = '#ffffff'; simContext.strokeText(label, ...center);
      simContext.fillStyle = '#111827'; simContext.fillText(label, ...center);
    }
  }
  simEl('sim-progress').textContent = state.valid ? `${simIndex} / ${state.lastTokens.length} 단계${simAnimation ? (simAnimation.token.move === '.' ? ' · 대기 중' : ' · 회전 중') : ''}` : '공식 입력을 확인하세요';
  simEl('sim-play').textContent = simPlaying ? '일시정지' : '자동 재생';
  for (const id of ['sim-prev', 'sim-next', 'sim-start', 'sim-end']) simEl(id).disabled = !!simAnimation || !state.valid;
  simEl('sim-prev').disabled ||= simIndex === 0;
  simEl('sim-next').disabled ||= simIndex === state.lastTokens.length;
  simEl('sim-play').disabled = !state.valid || !state.lastTokens.length;
  for (const button of simEl('sim-moves').querySelectorAll('button')) button.disabled = !!simAnimation || simPlaying || !state.valid;
}
function simDuration(id, fallback, min, max) {
  const value = Number(simEl(id).value);
  return Number.isFinite(value) && value >= min ? Math.min(max, value) : fallback;
}
function simTurn(token, finish) {
  if (simAnimation || !state.valid) return;
  const whole = token.move === 'T' || token.move.endsWith('o');
  const axis = token.move === 'T' ? [0, 0, 1] : FACE_NORMALS[token.move.replace(/[wso]$/, '')];
  const animation = {token, axis, whole, angle: 0}; simAnimation = animation;
  const start = performance.now(), duration = simDuration('sim-speed', 600, 50, 1000);
  const angle = token.move === '.' ? 0 : (token.suffix === "'" ? 1 : -1) * (token.move === 'T' ? Math.PI / 2 * (token.suffix === '2' ? 2 : 1) : Math.PI * 2 / 3);
  const tick = now => {
    if (simAnimation !== animation) return;
    const t = Math.min(1, (now-start)/duration), eased = t*t*(3-2*t);
    animation.angle = angle*eased;
    simDraw();
    if (t < 1) requestAnimationFrame(tick);
    else {
      simSources = applyTokens(simSources, [token]); simAnimation = null; finish(); simDraw();
      if (simPlaying) simNext();
    }
  };
  requestAnimationFrame(tick);
}
function simNext() {
  if (simIndex >= state.lastTokens.length) { simPlaying = false; simDraw(); return; }
  simTurn(simPlaybackTokens()[simIndex], () => { simIndex++; });
}
simEl('sim-next').onclick = () => { simPlaying = false; simNext(); };
simEl('sim-prev').onclick = () => {
  simPlaying = false;
  if (simIndex) simTurn(invertTokens([simPlaybackTokens()[simIndex-1]])[0], () => { simIndex--; });
};
function simSeek(index) { simPlaying = false; simIndex = index; simSources = applyTokens(identityState(), simStateTokens(index)); simDraw(); }
simEl('sim-start').onclick = () => simSeek(0);
simEl('sim-end').onclick = () => simSeek(state.lastTokens.length);
simEl('sim-play').onclick = () => {
  if (simPlaying) { simPlaying = false; simDraw(); return; }
  if (simIndex === state.lastTokens.length && !simAnimation) simSeek(0);
  simPlaying = true; if (!simAnimation) simNext(); simDraw();
};
simEl('sim-camera').onclick = () => {
  simYaw = 0; simPitch = 0; simZoom = 1;
  simViewBasis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  simDraw();
};
{
  const id = 'sim-speed';
  const range = simEl(id + '-range'), input = simEl(id);
  range.oninput = () => { input.value = range.value; };
  input.onchange = () => {
    input.value = String(simDuration(id, 600, 50, 1000));
    range.value = input.value;
  };
}
for (const token of parseNotation("{Uo} {Uo'} {Ro} {Ro'} {Fo} {Fo'} T T' T2")) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = formatToken(token);
  button.onclick = () => {
    const axis = token.move === 'T' ? [0, 0, 1] : FACE_NORMALS[token.move.slice(0, -1)];
    const angle = (token.suffix === "'" ? 1 : -1) * (token.move === 'T' ? Math.PI / 2 * (token.suffix === '2' ? 2 : 1) : Math.PI * 2 / 3);
    simViewBasis = simViewBasis.map(vector => rotateFtoPoint(vector, axis, angle));
    simDraw();
  };
  simEl('sim-viewpoints').append(button);
}
for (const move of [...Object.keys(FACE_NORMALS), ...Object.keys(FACE_NORMALS).map(f => f+'w'), 'Us', 'Fs', 'Rs', 'Ls']) {
  for (const suffix of ['', "'"]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = move+suffix;
    button.onclick = () => simTurn({move, suffix}, () => {
      const tokens = [...simStateTokens(simIndex), {move, suffix}];
      els.notation.value = (els.mode.value === 'alg' ? invertTokens(tokens) : tokens).map(formatToken).join(' ');
      updateAndRecord();
    });
    simEl('sim-moves').append(button);
  }
}
simCanvas.onpointerdown = event => {
  simPointer = {x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false};
  simCanvas.setPointerCapture(event.pointerId);
};
simCanvas.onpointermove = event => {
  if (!simPointer) return;
  if (Math.hypot(event.clientX-simPointer.startX, event.clientY-simPointer.startY) > 4) simPointer.moved = true;
  if (simPointer.moved) {
    simYaw += (event.clientX-simPointer.x)*0.008; simPitch += (event.clientY-simPointer.y)*0.008;
    simDraw();
  }
  simPointer.x = event.clientX; simPointer.y = event.clientY;
};
simCanvas.onpointerup = event => {
  if (simPointer && !simPointer.moved && simEl('sim-paint').checked && !simAnimation && !simPlaying && state.valid) {
    const rect = simCanvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    const hit = [...simHits].reverse().find(h => simContext.isPointInPath(h.path, (event.clientX-rect.left)*ratio, (event.clientY-rect.top)*ratio));
    if (hit?.source) {state.baseColors[hit.source] = state.selectedColor; state.colorLayoutOrigin = null; updateAndRecord();}
  }
  simPointer = null;
};
simCanvas.onpointercancel = () => {simPointer = null;};
simCanvas.addEventListener('wheel', event => {event.preventDefault(); simZoom = Math.max(0.5, Math.min(2, simZoom*Math.exp(-event.deltaY*0.001))); simDraw();}, {passive:false});
new ResizeObserver(() => {if (state.colors) simDraw();}).observe(simCanvas);
