import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function harness(kind, expose, clock) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'sim-speed' ? '600' : '', textContent: '', disabled: false, hidden: false,
      clientWidth: 800, clientHeight: 500, children: [], style: {}, listeners: {},
      append(child) { this.children.push(child); }, addEventListener(name, action) { this.listeners[name] = action; },
      getContext: () => new Proxy({}, { get: () => () => {} }),
      setAttribute() {}, removeAttribute() {}, replaceChildren() {}, querySelectorAll: () => [],
      classList: { add() {}, remove() {}, toggle() {} }
    });
    return elements.get(id);
  };
  let source = readFileSync(new URL(kind === 'cube' ? '../src/cube-3x3.bundle.js' : '../src/app.bundle.js', import.meta.url), 'utf8');
  source = source.replace(/\ninit\(\);/, '\n').replace(/init\(\)\.catch\(error => \{[\s\S]*?\n\}\);/, '');
  source = source.replace(/\}\)\(\);\s*$/, `${expose}\n})();`);
  let timerId = 0;
  const createElementNS = (namespace, tag) => ({
    tag, attributes: {}, children: [], listeners: {}, dataset: {},
    setAttribute(key, value) { this.attributes[key] = String(value); },
    append(child) { this.children.push(child); },
    addEventListener(event, action) { this.listeners[event] = action; }
  });
  const context = vm.createContext({
    document: { addEventListener() {}, createElement: () => element(`generated-${elements.size}`), createElementNS, getElementById: element, querySelector: selector => element(selector.replace(/^#/, '')), querySelectorAll: () => [] },
    Path2D: class {moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {}},
    ResizeObserver: class {observe() {}}, performance: {now: () => clock ? clock.now : 0},
    window: {}, setTimeout: () => ++timerId, clearTimeout() {}, requestAnimationFrame: action => clock ? clock.frames.push(action) : action(10000)
  });
  vm.runInContext(source, context);
  return { api: context.api, element };
}

for (const kind of ['sim', 'cube']) {
  test(`${kind}: notation buttons insert at the cursor and replace selections with separated tokens`, () => {
    const { api, element } = harness(kind, `
      ${kind === 'cube' ? 'render = () => {};' : 'updateAndRecord = () => {};'}
      globalThis.api = { insert: insertNotationToken };
    `);
    const input = element('notation');
    input.focus = () => {};
    input.setSelectionRange = (start, end) => { input.selectionStart = start; input.selectionEnd = end; };
    const token = kind === 'cube' ? 'x2' : 'T2';
    input.value = 'U R'; input.setSelectionRange(2, 2);
    api.insert(token); assert.equal(input.value, `U ${token} R`);
    api.insert(token); assert.equal(input.value, `U ${token} ${token} R`);
    input.value = 'U R'; input.setSelectionRange(0, 1);
    api.insert(token); assert.equal(input.value, `${token} R`);
    input.value = 'U'; input.setSelectionRange(1, 1);
    api.insert(token); assert.equal(input.value, `U ${token} `);
  });
}

test('NxNxN size changes preserve drafts and undo; SVG and batch use the selected size', async () => {
  const { api, element } = harness('cube', `
    let presetStorage = '[]';
    globalThis.localStorage = {getItem: () => presetStorage, setItem: (key, value) => {presetStorage = value;}};
    $('preset-list').replaceChildren = function (...items) {this.children = items;};
    init();
    globalThis.api = {
      state, switchSize: switchCubeSize, snapshot: currentCubeState, validate: validatePreset,
      svg: view => renderSvg(view, state.base), batch: () => batchSvg({scramble:'R'},'3d'),
      edit(text) {change(() => {state.notation = text; state.base.U0 = '#123456';});},
      undo: () => travel(-1), redo: () => travel(1),
      play: () => {$('cube-sim-start').onclick(); $('cube-sim-play').onclick();},
      solved: () => JSON.stringify(cubeSources) === JSON.stringify(identityState(state.size)),
      save: savePreset,
      loadFirst: () => $('preset-list').children[0].children[0].listeners.click(),
      storeLegacy(value) {localStorage.setItem(STORAGE_KEY, JSON.stringify([{name:'legacy',state:value}])); renderPresets();}
    };
  `);
  const stickers = svg => svg.children.filter(child => child.attributes['data-sticker']);
  api.edit("r U");
  api.switchSize(7); assert.equal(api.state.size,7); assert.equal(api.state.notation,'');
  api.edit("3Rw M . x2");
  assert.equal(stickers(api.svg('3d')).length,294);
  assert.equal(stickers(api.svg('ll')).length,77);
  assert.equal(stickers(api.batch()).length,294);
  const saved = api.snapshot(); api.validate(saved); assert.equal(saved.size,7);
  assert.equal(saved.sizeStates,undefined);
  element('preset-name').value = 'seven'; api.save();
  api.switchSize(4); assert.equal(api.state.size,4); assert.equal(Object.keys(api.state.base).length,96);
  api.undo(); assert.equal(api.state.size,7); assert.equal(element('cube-size').value,'7');
  api.redo(); assert.equal(api.state.size,4);
  api.switchSize(3); assert.equal(api.state.notation,'r U'); assert.equal(api.state.base.U0,'#123456');
  const legacy = api.snapshot(); delete legacy.size; api.validate(legacy);
  await api.loadFirst(); assert.equal(api.state.size,7); assert.equal(api.state.notation,'3Rw M . x2');
  api.storeLegacy(legacy); await api.loadFirst(); assert.equal(api.state.size,3); assert.equal(api.state.notation,'r U');
  api.switchSize(7); assert.equal(api.state.notation,'3Rw M . x2'); assert.equal(api.state.base.U0,'#123456');
  for (const size of [2,3,4,5,6,7]) {
    api.switchSize(size);
    api.state.mode = 'alg';
    api.edit(size === 2 ? 'R U . x2' : size%2 ? `${size-1}Rw M . y2` : `${size-1}Rw U . y2`);
    api.play(); assert.equal(api.solved(),true,`${size} Alg`);
  }
});

test('3x3 simulator steps, pauses, Alg playback, tabs and observation preserve state', () => {
  const clock = { now: 0, frames: [] };
  const { api, element } = harness('cube', `
    globalThis.api = {
      load(text, mode) {state.notation = text; state.mode = mode; valid = true; cubeSimulatorRefresh();},
      index: () => cubeIndex, sources: () => JSON.stringify(cubeSources),
      expected: text => JSON.stringify(applyTokens(identityState(),parseNotation(text))),
      playing: () => cubePlaying, notation: () => state.notation, refresh: cubeSimulatorRefresh,
      camera: () => JSON.stringify([[1,0,0],[0,1,0],[0,0,1]].map(cubeCamera)), select: selectCubeTab
    };
  `, clock);
  const tick = duration => {clock.now += duration; const callback = clock.frames.shift(); assert.ok(callback); callback(clock.now);};
  element('cube-sim-speed').value = '200';
  api.load('R . x2','setup'); assert.equal(api.index(),3);
  assert.equal(api.sources(),api.expected('R x2'));
  element('cube-sim-start').onclick(); element('cube-sim-play').onclick();
  tick(199); assert.equal(api.index(),0); tick(1); assert.equal(api.index(),1);
  tick(200); assert.equal(api.index(),2); assert.equal(api.sources(),api.expected('R'));
  const camera = api.camera(), sources = api.sources();
  element('cube-sim-viewpoints').children[0].onclick();
  assert.notEqual(api.camera(),camera); assert.equal(api.sources(),sources); assert.equal(api.notation(),'R . x2');
  api.select('single'); assert.equal(api.playing(),false);
  tick(200); assert.equal(api.index(),3);
  api.select('simulator'); api.refresh(); assert.equal(api.index(),3);
  element('cube-sim-prev').onclick(); tick(200); assert.equal(api.sources(),api.expected('R'));
  element('cube-sim-camera').onclick(); assert.equal(api.camera(),camera);
  api.load("Rw M' x2 . U",'alg'); assert.equal(api.index(),0);
  element('cube-sim-play').onclick(); for (let i=0;i<5;i++) tick(200);
  assert.equal(api.sources(),api.expected('')); assert.equal(api.index(),5);
  element('cube-sim-speed').value = '1500'; element('cube-sim-speed').onchange();
  assert.equal(element('cube-sim-speed').value,'1000');
});

test('FTO timed playback respects each dot and rotates the whole puzzle before subsequent moves', () => {
  const clock = { now: 0, frames: [] };
  const { api, element } = harness('sim', `
    state.colors = EMBEDDED_ASSETS.colors;
    state.baseColors = Object.fromEntries(STICKERS.map(s => [s.id, '#ffffff'])); state.valid = true;
    globalThis.api = {
      load(text, mode = 'setup') { els.mode.value = mode; const tokens = parseNotation(text); state.lastTokens = mode === 'alg' ? invertTokens(tokens) : tokens; simulatorRefresh(); },
      index: () => simIndex, animation: () => simAnimation,
      sources: () => JSON.stringify(Object.entries(simSources).sort()),
      expected: text => JSON.stringify(Object.entries(applyTokens(identityState(), parseNotation(text))).sort())
    };
  `, clock);
  const tick = time => { clock.now = time; const frame = clock.frames.shift(); assert.ok(frame); frame(time); };
  element('sim-speed').value = '350';
  api.load('T2..U'); element('sim-start').onclick(); element('sim-play').onclick();
  assert.equal(api.animation().whole, true);
  tick(175); assert.ok(Math.abs(api.animation().angle + Math.PI / 2) < 1e-9);
  tick(350); assert.equal(api.index(), 1); assert.equal(api.sources(), api.expected('T2'));
  tick(699); assert.equal(api.index(), 1);
  tick(700); assert.equal(api.index(), 2);
  tick(1050); assert.equal(api.index(), 3); assert.equal(api.sources(), api.expected('T2'));
  tick(1400); assert.equal(api.index(), 4); assert.equal(api.sources(), api.expected('T2 U'));
  element('sim-prev').onclick(); tick(1750); assert.equal(api.sources(), api.expected('T2'));
  element('sim-speed-range').value = '770'; element('sim-speed-range').oninput(); assert.equal(element('sim-speed').value, '770');
  api.load("T {Ro'} . U", 'alg'); element('sim-play').onclick();
  for (const duration of [770, 770, 770, 770]) tick(clock.now + duration);
  assert.equal(api.sources(), api.expected('')); assert.equal(api.index(), 4);
  element('sim-speed').value = '1500'; element('sim-speed').onchange();
  assert.equal(element('sim-speed').value, '1000'); assert.equal(element('sim-speed-range').value, '1000');
});

test('CIF observation buttons preserve the formula, puzzle and active playback and reset the camera', () => {
  const clock = { now: 0, frames: [] };
  const { api, element } = harness('sim', `
    state.colors = EMBEDDED_ASSETS.colors;
    state.baseColors = Object.fromEntries(STICKERS.map(s => [s.id, '#ffffff'])); state.valid = true;
    els.notation.value = "R U T ."; state.lastTokens = parseNotation(els.notation.value); simulatorRefresh();
    globalThis.api = {
      camera: () => JSON.stringify([[1,0,0],[0,1,0],[0,0,1]].map(simCamera)),
      snapshot: () => JSON.stringify([els.notation.value, state.lastTokens, simSources, simIndex, simPlaying, simAnimation]),
      drag() {simYaw = 0.2; simPitch = 0.4;}, refresh: simulatorRefresh
    };
  `, clock);
  const camera = api.camera();
  element('sim-start').onclick(); element('sim-play').onclick();
  const before = api.snapshot();
  for (const button of element('sim-viewpoints').children) {
    element('sim-camera').onclick();
    button.onclick();
    assert.notEqual(api.camera(), camera, button.textContent);
    assert.equal(api.snapshot(), before, button.textContent);
  }
  api.drag(); element('sim-camera').onclick(); assert.equal(api.camera(), camera);
  assert.equal(api.snapshot(), before);
});

test('FTO simulator playback, inverse step, edits and manual moves preserve source state', () => {
  const { api, element } = harness('sim', `
    state.colors = EMBEDDED_ASSETS.colors;
    state.baseColors = Object.fromEntries(STICKERS.map(s => [s.id, '#ffffff']));
    state.valid = true;
    updateAndRecord = () => { state.lastTokens = parseNotation(els.notation.value); simulatorRefresh(); };
    globalThis.api = {
      state, load(text) {state.lastTokens = parseNotation(text); simulatorRefresh();},
      index: () => simIndex, sources: () => JSON.stringify(Object.entries(simSources).sort()),
      expected: text => JSON.stringify(Object.entries(applyTokens(identityState(), parseNotation(text))).sort()),
      simulatorRefresh
    };
  `);
  api.load('R U Fs'); assert.equal(api.index(), 3);
  assert.equal(api.sources(), api.expected('R U Fs'));
  element('sim-start').onclick(); assert.equal(api.index(), 0);
  element('sim-next').onclick(); assert.equal(api.index(), 1);
  assert.equal(api.sources(), api.expected('R'));
  element('sim-prev').onclick(); assert.equal(api.sources(), api.expected(''));
  element('sim-play').onclick(); assert.equal(api.sources(), api.expected('R U Fs'));
  element('sim-start').onclick(); element('sim-next').onclick();
  api.state.baseColors.U0 = '#123456'; api.simulatorRefresh(); assert.equal(api.index(), 1);
  element('sim-moves').children.find(b => b.textContent === 'U').onclick();
  assert.equal(element('notation').value, 'R U'); assert.equal(api.sources(), api.expected('R U'));
  api.state.valid = false; api.simulatorRefresh(); assert.equal(element('sim-play').disabled, true);
});

test('FTO Alg starts scrambled and plays the entered algorithm toward the base state', () => {
  const { api, element } = harness('sim', `
    state.colors = EMBEDDED_ASSETS.colors;
    state.baseColors = Object.fromEntries(STICKERS.map(s => [s.id, '#123456']));
    state.stickerTexts = { U0: '문자' }; state.valid = true; els.mode.value = 'alg';
    updateAndRecord = () => {
      const tokens = parseNotation(els.notation.value);
      state.lastTokens = els.mode.value === 'alg' ? invertTokens(tokens) : tokens;
      simulatorRefresh();
    };
    globalThis.api = {
      load(text) {els.notation.value = text; updateAndRecord();},
      mode(value) {els.mode.value = value; updateAndRecord();},
      index: () => simIndex,
      sources: () => JSON.stringify(Object.entries(simSources).sort()),
      expected: text => JSON.stringify(Object.entries(applyTokens(identityState(), parseNotation(text))).sort()),
      custom: () => JSON.stringify([state.baseColors, state.stickerTexts]),
      refresh: simulatorRefresh, selectFtoTab
    };
  `);
  api.load('R U');
  const custom = api.custom(), scrambled = api.expected("U' R'");
  assert.equal(api.index(), 0); assert.equal(api.sources(), scrambled);
  element('sim-next').onclick();
  assert.equal(api.index(), 1); assert.equal(api.sources(), api.expected("U'"));
  api.refresh(); api.selectFtoTab('single'); api.selectFtoTab('simulator');
  assert.equal(api.index(), 1); assert.equal(api.sources(), api.expected("U'"));
  element('sim-prev').onclick(); assert.equal(api.sources(), scrambled);
  element('sim-play').onclick(); assert.equal(api.sources(), api.expected('')); assert.equal(api.index(), 2);
  element('sim-start').onclick(); assert.equal(api.sources(), scrambled);
  element('sim-end').onclick(); assert.equal(api.sources(), api.expected(''));
  element('sim-start').onclick(); element('sim-next').onclick();
  element('sim-moves').children.find(b => b.textContent === 'F').onclick();
  assert.equal(api.index(), 0); assert.equal(api.sources(), api.expected("U' F"));
  element('sim-play').onclick(); assert.equal(api.sources(), api.expected(''));
  assert.equal(api.custom(), custom);
  api.load(''); assert.equal(api.sources(), api.expected('')); assert.equal(element('sim-play').disabled, true);
  api.load('R U'); api.mode('setup'); assert.equal(api.index(), 2); assert.equal(api.sources(), api.expected('R U'));
  api.mode('alg'); assert.equal(api.index(), 0); assert.equal(api.sources(), scrambled);
});

test('FTO default and reset camera match the square CIF vertex view', () => {
  const { api, element } = harness('sim', `
    state.colors = EMBEDDED_ASSETS.colors;
    state.baseColors = Object.fromEntries(STICKERS.map(s => [s.id, state.colors.faces[s.face]]));
    globalThis.api = { camera: simCamera, normals: FACE_NORMALS, colors: state.colors.faces,
      drag() {simYaw = 0.7; simPitch = 0.4;} };
  `);
  function check() {
    const vertices = [[9,0,0],[0,9,0],[-9,0,0],[0,-9,0]].map(api.camera);
    for (const p of vertices) {
      assert.ok(Math.abs(Math.abs(p[0])-Math.abs(p[1])) < 1e-8);
      assert.ok(Math.abs(p[2]) < 1e-8);
    }
    for (const [face, axis, sign] of [['U',1,1],['R',0,1],['F',1,-1],['L',0,-1]]) {
      const normal = api.camera(api.normals[face]);
      assert.ok(normal[axis]*sign > 1); assert.ok(Math.abs(normal[1-axis]) < 1e-8); assert.equal(normal[2], 1);
    }
  }
  check(); api.drag(); element('sim-camera').onclick(); check();
  assert.deepEqual(['U','R','F','L'].map(f => api.colors[f]), ['#ffffff','#ff0d00','#67e000','#643d94']);
});

test('FTO tabs preserve customization, batch input, camera and playback position', () => {
  const { api, element } = harness('sim', `
    state.colors = EMBEDDED_ASSETS.colors;
    state.baseColors = Object.fromEntries(STICKERS.map(s => [s.id, '#123456']));
    state.stickerTexts = { U0: '공유 문자' };
    state.valid = true; state.lastTokens = parseNotation('R U');
    simulatorRefresh(); simSeek(1); simYaw = 1.2; simZoom = 1.4; simPlaying = true;
    globalThis.api = { selectFtoTab, state,
      snapshot: () => JSON.stringify([state.baseColors, state.stickerTexts, simIndex, simYaw, simZoom, simSources]),
      playing: () => simPlaying };
  `);
  element('notation').value = 'R U'; element('batch-json').value = '[{"filename":"case","scramble":"F"}]';
  const before = api.snapshot();
  for (const name of ['single', 'batch', 'simulator']) {
    api.selectFtoTab(name);
    for (const other of ['single', 'batch', 'simulator']) assert.equal(element(`${other}-workspace`).hidden, other !== name);
    assert.equal(api.snapshot(), before);
    assert.equal(element('notation').value, 'R U');
    assert.match(element('batch-json').value, /case/);
  }
  assert.equal(api.playing(), false);
  assert.equal(element('save-settings').hidden, true);
});

test('3x3 continuous typing is undone together, then resumes as a new group', () => {
  const { api } = harness('cube', `
    render = () => {}; syncControls = () => {};
    globalThis.api = {
      input(value) { change(() => { state.notation = value; }, 'notation'); },
      finishHistoryGroup, travel, value: () => state.notation
    };`);
  api.input('R'); api.input('R U'); api.input("R U R'");
  api.travel(-1); assert.equal(api.value(), '');
  api.travel(1); assert.equal(api.value(), "R U R'");
  api.finishHistoryGroup(); api.input("R U R' U'");
  api.travel(-1); assert.equal(api.value(), "R U R'");
});

test('3x3 rear view covers all stickers and toggles without changing LL or colors', () => {
  const { api } = harness('cube', `
    globalThis.api = { state, renderSvg, batchSvg, validatePreset };
  `);
  const stickers = svg => svg.children.filter(el => el.attributes['data-sticker']);
  const full = api.renderSvg('3d', api.state.base);
  assert.equal(stickers(full).length, 54);
  assert.equal(new Set(stickers(full).map(el => el.attributes['data-sticker'])).size, 54);
  for (const el of stickers(full)) assert.equal(el.attributes.fill, api.state.base[el.attributes['data-sticker']]);
  const ll = JSON.stringify(api.renderSvg('ll', api.state.base));
  api.state.showBackFaces = false;
  const front = api.renderSvg('3d', api.state.base);
  assert.equal(stickers(front).length, 27);
  assert.equal(front.attributes.viewBox, '0 0 320 335');
  // One front body occludes four inner stickers on each offset rear face.
  const frontStickers = stickers(full).filter(el => /^[UFR]/.test(el.attributes['data-sticker']));
  assert.equal(JSON.stringify(frontStickers), JSON.stringify(stickers(front)));
  const bodyIndex = full.children.findIndex(el => el.attributes.d === front.children[0].attributes.d);
  assert.equal(full.children.filter(el => el.attributes['data-body']).length, 4);
  assert.equal(front.children.filter(el => el.attributes['data-body']).length, 1);
  const hidden = { L: 0, B: 0, D: 0 };
  for (const el of stickers(full).filter(el => /^[LBD]/.test(el.attributes['data-sticker']))) {
    assert.ok(full.children.indexOf(el) < bodyIndex);
    const coordinates = el.attributes.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const xs = coordinates.filter((_, i) => i % 2 === 0);
    const ys = coordinates.filter((_, i) => i % 2 === 1);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    const insideBody = x > 34 && x < 286 && y > 24 + Math.abs(x - 160) * 72 / 126 && y < 312 - Math.abs(x - 160) * 72 / 126;
    if (insideBody) hidden[el.attributes['data-sticker'][0]] += 1;
    assert.ok(Math.min(...xs) > -26 && Math.max(...xs) < 346);
    assert.ok(Math.min(...ys) > -16 && Math.max(...ys) < 380);
  }
  assert.deepEqual(hidden, { L: 4, B: 4, D: 4 });
  assert.equal(JSON.stringify(api.renderSvg('ll', api.state.base)), ll);
  assert.equal(stickers(api.batchSvg({ scramble: 'R U' }, '3d')).length, 27);
  api.state.showBackFaces = true;
  assert.equal(stickers(api.batchSvg({ scramble: 'R U' }, '3d')).length, 54);
  const legacy = JSON.parse(JSON.stringify(api.state));
  delete legacy.showBackFaces;
  assert.doesNotThrow(() => api.validatePreset(legacy));
  assert.throws(() => api.validatePreset({ ...legacy, showBackFaces: 'false' }), /뒷면/);
});

test('3x3 rear stickers paint the source after moves and viewpoint rotations, with undo', () => {
  const { api, element } = harness('cube', `
    render = () => {}; renderPalette = () => {}; syncPaletteEditor = () => {};
    globalThis.api = {
      state, travel,
      toggle() { change(() => { state.showBackFaces = false; }); },
      rear() {
        const tokens = parseNotation("R U x y");
        displayedSources['3d'] = applyTokens(identityState(), tokens);
        selectedColor = '#123456';
        return renderSvg('3d', applyTokens(state.base, tokens), true);
      },
      source: id => displayedSources['3d'][id]
    };
  `);
  const rear = api.rear().children.find(el => el.attributes['data-sticker'] === 'B0');
  const source = api.source('B0');
  rear.listeners.click();
  assert.equal(api.state.base[source], '#123456');
  api.toggle();
  assert.equal(api.state.showBackFaces, false);
  api.travel(-1);
  assert.equal(api.state.showBackFaces, true);
  assert.equal(element('show-back-faces').checked, true);
  api.travel(1);
  assert.equal(element('show-back-faces').checked, false);
});

test('3x3 custom palette converts RGB and recolors matching stickers', () => {
  const { api } = harness('cube', `
    globalThis.api = { state, rgbToHex, hexToRgb, setPaletteColor };
  `);
  assert.equal(api.rgbToHex(18, 52, 86), '#123456');
  assert.equal(Array.from(api.hexToRgb('#abcdef')).join(','), '171,205,239');
  const previous = api.state.palette.R;
  assert.equal(api.state.base.R0, previous);
  api.setPaletteColor('R', '#123456');
  assert.equal(api.state.palette.R, '#123456');
  assert.equal(api.state.base.R0, '#123456');
  assert.notEqual(api.state.base.U0, '#123456');
  assert.throws(() => api.rgbToHex(256, 0, 0), /0부터 255/);
  assert.throws(() => api.hexToRgb('123456'), /6자리/);
});

test('3x3 palette contains six faces plus a separate editable Blank swatch', () => {
  const { api } = harness('cube', `globalThis.api = { state, setPaletteColor };`);
  assert.deepEqual(Array.from(Object.keys(api.state.palette)), ['U', 'R', 'F', 'D', 'L', 'B', 'Blank']);
  const previous = api.state.palette.Blank;
  api.state.base.U0 = previous;
  api.setPaletteColor('Blank', '#123456');
  assert.equal(api.state.palette.Blank, '#123456');
  assert.equal(api.state.base.U0, '#123456');
});

test('FTO palette keeps eight faces plus Blank and recolors matching stickers', () => {
  const { api } = harness('fto', `globalThis.api = { state, FACE_ORDER, setPaletteColor, rgbToHex, hexToRgb };`);
  api.state.colors = {
    faces: Object.fromEntries(Array.from(api.FACE_ORDER, face => [face, '#111111'])),
    blank: '#2c2d2d',
    palette: [
      ...Array.from(api.FACE_ORDER, face => ({ name: face, face, color: '#111111' })),
      { name: 'Blank', face: null, color: '#2c2d2d' }
    ]
  };
  api.state.baseColors = { U0: '#111111', U1: '#2c2d2d' };
  api.state.colorLayoutOrigin = { U0: '#111111', U1: '#2c2d2d' };
  assert.equal(api.FACE_ORDER.length, 8);
  assert.equal(api.state.colors.palette.length, 9);
  assert.equal(api.rgbToHex(18, 52, 86), '#123456');
  assert.equal(Array.from(api.hexToRgb('#abcdef')).join(','), '171,205,239');
  api.setPaletteColor('U', '#123456');
  assert.equal(api.state.colors.faces.U, '#123456');
  assert.equal(api.state.baseColors.U0, '#123456');
  assert.equal(api.state.colorLayoutOrigin.U0, '#123456');
  api.setPaletteColor('Blank', '#654321');
  assert.equal(api.state.colors.blank, '#654321');
  assert.equal(api.state.baseColors.U1, '#654321');
});

test('FTO custom sticker text follows its source sticker and can be hidden', () => {
  const { api, element } = harness('fto', `globalThis.api = { state, appendSticker };`);
  const sticker = { id: 'U0', face: 'U', path: 'M 0 0 L 10 0 L 10 10 Z', center: { x: 5, y: 5 }, bbox: { w: 10, h: 10 } };
  const template = { stroke: { color: '#000000', width: 1, lineJoin: 'round', lineCap: 'round' } };
  api.state.colors = { faces: { U: '#ffffff' }, blank: '#222222' };
  api.state.stickerTexts = { R0: '한글' };
  element('show-sticker-text').checked = true;
  const svg = { children: [], append(child) { this.children.push(child); } };
  api.appendSticker(svg, sticker, template, { U0: '#ffffff' }, 'cif', {
    interactive: false, showLabels: false, sources: { U0: 'R0' }
  });
  assert.equal(svg.children.find(child => child.tag === 'text').textContent, '한글');
  element('show-sticker-text').checked = false;
  const hidden = { children: [], append(child) { this.children.push(child); } };
  api.appendSticker(hidden, sticker, template, { U0: '#ffffff' }, 'cif', {
    interactive: false, showLabels: false, sources: { U0: 'R0' }
  });
  assert.equal(hidden.children.some(child => child.tag === 'text'), false);
});

test('editing FTO batch JSON discards prepared images and disables saving', () => {
  const { api, element } = harness('fto', `globalThis.api = { state, invalidateBatch };`);
  api.state.batchItems = [{ filename: 'old' }];
  api.state.batchPreparedItems = [{ filename: 'old' }];
  api.invalidateBatch();
  assert.equal(api.state.batchItems.length, 0);
  assert.equal(api.state.batchPreparedItems.length, 0);
  assert.equal(element('save-batch').disabled, true);
  assert.match(element('batch-status').textContent, /입력이 변경/);
});

test('FTO save lock prevents duplicate operations and releases after failure', async () => {
  const { api, element } = harness('fto', `globalThis.api = { state, saveAction };`);
  api.state.valid = true;
  api.state.batchPreparedItems = [{ filename: 'case', selected: true, cancelled: false }];
  let release;
  const pending = api.saveAction(() => new Promise(resolve => { release = resolve; }));
  assert.equal(element('download-cif-png').disabled, true);
  assert.equal(element('save-batch').disabled, true);
  let duplicateRan = false;
  await api.saveAction(() => { duplicateRan = true; });
  assert.equal(duplicateRan, false);
  release(); await pending;
  assert.equal(element('download-cif-png').disabled, false);
  await assert.rejects(api.saveAction(async () => { throw new Error('test failure'); }), /test failure/);
  assert.equal(api.state.saving, false);
  assert.equal(element('save-batch').disabled, false);
});
