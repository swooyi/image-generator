const cubeCanvas = $('cube-sim-canvas'), cubeContext = cubeCanvas.getContext('2d');
let cubeSteps = [], cubeIndex = 0, cubeSignature = '', cubeAnimation = null, cubePlaying = false;
let cubeSources = identityState(), cubeYaw = -Math.PI / 4, cubePitch = Math.PI / 6, cubeZoom = 1, cubePointer = null;
let cubeBasis = [[1,0,0], [0,1,0], [0,0,1]];
function cubeStateAt(index) {
  return applyTokens(state.mode === 'alg' ? applyTokens(identityState(state.size), invertTokens(cubeSteps), state.size) : identityState(state.size), cubeSteps.slice(0,index), state.size);
}
function cubeSimulatorRefresh() {
  const signature = JSON.stringify([state.size, state.notation, state.mode, valid]);
  if (signature !== cubeSignature) {
    cubeSignature = signature; cubePlaying = false; cubeAnimation = null;
    cubeSteps = valid ? parseNotation(state.notation, state.size) : [];
    cubeIndex = state.mode === 'alg' ? 0 : cubeSteps.length;
  }
  cubeSources = cubeStateAt(cubeIndex);
  $('cube-sim-title').textContent = `${state.size}×${state.size}×${state.size} 시뮬레이터`;
  cubeDraw();
}
function cubeCamera(p) {
  const oriented = p.map((_,i) => p.reduce((sum,v,j) => sum + v*cubeBasis[j][i],0));
  return rotateCubePoint(rotateCubePoint(oriented,[0,1,0],cubeYaw),[1,0,0],cubePitch);
}
function cubeDraw() {
  const width = cubeCanvas.clientWidth, height = cubeCanvas.clientHeight, ratio = window.devicePixelRatio || 1;
  if (cubeCanvas.width !== Math.round(width*ratio) || cubeCanvas.height !== Math.round(height*ratio)) {
    cubeCanvas.width = Math.round(width*ratio); cubeCanvas.height = Math.round(height*ratio);
  }
  cubeContext.setTransform(ratio,0,0,ratio,0,0); cubeContext.clearRect(0,0,width,height);
  const scale = Math.min(width,height)/(state.size*1.94)*cubeZoom, polygons = [];
  for (const piece of createCubePieces(state.size)) {
    const moving = cubeAnimation && cubeLayerMoves(piece.center,cubeAnimation.token.move,state.size);
    const transform = p => cubeCamera(moving ? rotateCubePoint(p,cubeAnimation.axis,cubeAnimation.angle) : p);
    for (const face of piece.faces) {
      if (transform(face.normal)[2] <= 1e-7) continue;
      const points = face.points.map(transform);
      polygons.push({ face, depth: points.reduce((sum,p) => sum+p[2],0)/4, points: points.map(p => [width/2+p[0]*scale,height/2-p[1]*scale]) });
    }
  }
  polygons.sort((a,b) => a.depth-b.depth);
  for (const {face,points} of polygons) {
    const path = new Path2D(roundedPath(points,Math.min(3,scale*.08)));
    cubeContext.fillStyle = face.sticker ? state.base[cubeSources[face.sticker]] : '#20242b';
    cubeContext.fill(path); cubeContext.strokeStyle = '#20242b'; cubeContext.lineWidth = Math.min(2,scale*.06); cubeContext.stroke(path);
    if (state.labels && face.sticker) {
      const center = points.reduce((sum,p) => [sum[0]+p[0]/4,sum[1]+p[1]/4],[0,0]);
      cubeContext.font = 'bold 12px sans-serif'; cubeContext.textAlign = 'center'; cubeContext.textBaseline = 'middle';
      cubeContext.lineWidth = 3; cubeContext.strokeStyle = '#fff'; cubeContext.strokeText(face.sticker,...center);
      cubeContext.fillStyle = '#111'; cubeContext.fillText(face.sticker,...center);
    }
  }
  $('cube-sim-progress').textContent = `${cubeIndex} / ${cubeSteps.length} 단계${cubeAnimation ? cubeAnimation.token.move === '.' ? ' · 대기 중' : ' · 회전 중' : ''}`;
  $('cube-sim-play').textContent = cubePlaying ? '일시정지' : '자동 재생';
  for (const name of ['start','prev','next','end']) $('cube-sim-'+name).disabled = !valid || !!cubeAnimation;
  $('cube-sim-prev').disabled ||= cubeIndex === 0;
  $('cube-sim-next').disabled ||= cubeIndex === cubeSteps.length;
  $('cube-sim-play').disabled = !valid || !cubeSteps.length;
}
function cubeDuration() {
  const value = Number($('cube-sim-speed').value);
  return Number.isFinite(value) ? Math.max(50,Math.min(1000,value || 600)) : 600;
}
function cubeTurn(token, finish) {
  if (cubeAnimation || !valid) return;
  const animation = { token, axis: token.move === '.' ? [0,0,1] : cubeTurnAxis(token.move), angle: 0 };
  cubeAnimation = animation;
  const start = performance.now(), duration = cubeDuration();
  const tick = now => {
    if (cubeAnimation !== animation) return;
    const t = Math.min(1,(now-start)/duration);
    animation.angle = cubeTurnAngle(token)*t*t*(3-2*t); cubeDraw();
    if (t < 1) requestAnimationFrame(tick);
    else {
      cubeSources = applyTokens(cubeSources,[token],state.size); cubeAnimation = null; finish(); cubeDraw();
      if (cubePlaying) cubeNext();
    }
  };
  requestAnimationFrame(tick);
}
function cubeNext() {
  if (cubeIndex >= cubeSteps.length) { cubePlaying = false; cubeDraw(); return; }
  cubeTurn(cubeSteps[cubeIndex], () => cubeIndex++);
}
function cubeSeek(index) {
  cubeAnimation = null; cubePlaying = false; cubeIndex = index; cubeSources = cubeStateAt(index); cubeDraw();
}
$('cube-sim-start').onclick = () => cubeSeek(0);
$('cube-sim-end').onclick = () => cubeSeek(cubeSteps.length);
$('cube-sim-next').onclick = () => { cubePlaying = false; cubeNext(); };
$('cube-sim-prev').onclick = () => {
  cubePlaying = false;
  if (cubeIndex) cubeTurn(invertTokens([cubeSteps[cubeIndex-1]])[0], () => cubeIndex--);
};
$('cube-sim-play').onclick = () => {
  if (cubePlaying) { cubePlaying = false; cubeDraw(); return; }
  if (cubeIndex === cubeSteps.length && !cubeAnimation) cubeSeek(0);
  cubePlaying = true; if (!cubeAnimation) cubeNext(); cubeDraw();
};
$('cube-sim-speed-range').oninput = () => { $('cube-sim-speed').value = $('cube-sim-speed-range').value; };
$('cube-sim-speed').onchange = () => { $('cube-sim-speed').value = String(cubeDuration()); $('cube-sim-speed-range').value = $('cube-sim-speed').value; };
$('cube-sim-camera').onclick = () => {
  cubeYaw = -Math.PI/4; cubePitch = Math.PI/6; cubeZoom = 1; cubeBasis = [[1,0,0],[0,1,0],[0,0,1]]; cubeDraw();
};
for (const token of parseNotation("x x' x2 y y' y2 z z' z2")) {
  const control = document.createElement('button'); control.type = 'button';
  control.textContent = token.move + (token.turns === 3 ? "'" : token.turns === 2 ? '2' : '');
  control.onclick = () => { cubeBasis = cubeBasis.map(p => rotateCubePoint(p,cubeTurnAxis(token.move),cubeTurnAngle(token))); cubeDraw(); };
  $('cube-sim-viewpoints').append(control);
}
cubeCanvas.onpointerdown = event => { cubePointer = [event.clientX,event.clientY]; cubeCanvas.setPointerCapture(event.pointerId); };
cubeCanvas.onpointermove = event => {
  if (!cubePointer) return;
  cubeYaw += (event.clientX-cubePointer[0])*0.008; cubePitch += (event.clientY-cubePointer[1])*0.008;
  cubePointer = [event.clientX,event.clientY]; cubeDraw();
};
cubeCanvas.onpointerup = cubeCanvas.onpointercancel = () => { cubePointer = null; };
cubeCanvas.addEventListener('wheel', event => { event.preventDefault(); cubeZoom = Math.max(.5,Math.min(2,cubeZoom*Math.exp(-event.deltaY*.001))); cubeDraw(); },{passive:false});
new ResizeObserver(cubeDraw).observe(cubeCanvas);
const cubeTabs = ['single','batch','simulator'];
function selectCubeTab(name, focus = false) {
  if (!cubeTabs.includes(name)) name = 'single';
  if (name !== 'simulator') cubePlaying = false;
  for (const tab of cubeTabs) {
    const selected = tab === name, control = $('cube-tab-'+tab);
    control.setAttribute('aria-selected',String(selected)); control.tabIndex = selected ? 0 : -1;
    $('cube-'+tab+'-workspace').hidden = !selected;
    if (selected && focus) control.focus();
  }
  $('save-settings').hidden = name === 'simulator';
  $('batch-save-controls').hidden = name !== 'batch';
  document.querySelector('.header-save-filename').hidden = name === 'batch';
  cubeDraw();
}
for (const name of cubeTabs) {
  $('cube-tab-'+name).onclick = () => selectCubeTab(name);
  $('cube-tab-'+name).addEventListener('keydown', event => {
    const i = cubeTabs.indexOf(name);
    const next = { ArrowRight: (i+1)%3, ArrowLeft: (i+2)%3, Home: 0, End: 2 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); selectCubeTab(cubeTabs[next],true);
  });
}
selectCubeTab(window.location?.hash.slice(1));
