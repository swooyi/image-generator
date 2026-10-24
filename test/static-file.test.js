import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('FTO generator uses a classic script that works from file URLs', () => {
  const html = read('../image-gen-fto.html');
  assert.match(html, /<script defer src="\.\/src\/app\.bundle\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
});

test('static browser bundle contains its assets and has no network loading', () => {
  const bundle = read('../src/app.bundle.js');
  assert.match(bundle, /const EMBEDDED_ASSETS = /);
  assert.match(bundle, /"id":"U0"/);
  assert.match(bundle, /"palette":\[/);
  assert.doesNotMatch(bundle, /\bfetch\s*\(/);
  assert.doesNotMatch(bundle, /^import\s/m);
  assert.doesNotMatch(bundle, /^export\s/m);
  assert.match(bundle, /function convexHull\(points\)/);
  assert.doesNotMatch(bundle, /template\.stroke\.width \* 3/);
});

test('focus layout places presets left of custom controls and previews', () => {
  const html = read('../image-gen-fto.html');
  const bundle = read('../src/app.bundle.js');
  const css = read('../src/styles.css');
  assert.ok(html.indexOf('class="control-column"') < html.indexOf('class="workspace"'));
  assert.ok(html.indexOf('class="custom-area"') < html.indexOf('class="workspace"'));
  assert.match(html, /<summary>커스텀 설정<\/summary>/);
  assert.match(html, /id="preset-panel" class="preset-drawer" popover="auto"/);
  for (const id of ['preset-name', 'new-preset', 'save-preset', 'preset-list']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="(?:load|delete)-preset"/);
  assert.doesNotMatch(html, /id="rotation-buttons"/);
  assert.doesNotMatch(bundle, /function appendRotation\(token\)/);
  assert.match(bundle, /fto-image-generator\.presets\.v1/);
  assert.match(bundle, /localStorage\.setItem/);
  for (const view of ['cif', 'eif']) assert.match(html, new RegExp(`id="${view}-viewpoint-controls"`));
  for (const token of ['U', 'R', 'F']) assert.match(bundle, new RegExp(`move: "${token}"`));
  assert.match(bundle, /move: "V"/);
  assert.match(bundle, /정면 하단 꼭짓점 기준 시계방향 90° 시점 회전/);
  assert.match(bundle, /EIF_VIEWPOINT_MOVE_MAP = \{ U: "B", R: "R", F: "U", V: "V" \}/);
  assert.match(bundle, /function physicalViewpointTokens\(view, tokens\)/);
  assert.match(bundle, /applyOrientationTokens/);
  assert.match(css, /grid-template-columns: minmax\(300px, 360px\) minmax\(0, 1fr\)/);
  assert.match(css, /\.workspace[\s\S]*position: sticky;/);
  assert.match(css, /\.palette \{ grid-template-columns: repeat\(9, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.face-buttons \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.button-primary/);
  assert.match(css, /\.preset-load-button/);
  assert.match(css, /\.preset-delete-button/);
  assert.match(css, /\.preset-item-action/);
  assert.match(css, /\.viewpoint-button-grid \.viewpoint-vertex-button/);
  assert.match(css, /\.viewpoint-controls-header/);
  assert.match(bundle, /loadButton\.addEventListener\("click", \(\) => loadPreset\(preset\.name\)\)/);
  assert.match(bundle, /state\.viewpointTokens\[view\] = \[\]/);
  assert.match(html, /id="color-layout-controls"/);
  assert.match(bundle, /function applyColorLayoutTransform\(token\)/);
  assert.match(bundle, /function resetColorLayoutTransform\(\)/);
  assert.match(bundle, /colorLayoutOrigin/);
  assert.match(bundle, /els\.savePreset\.textContent = editing \? "변경 저장" : "저장"/);
  assert.match(bundle, /function startNewPreset\(\)/);
  assert.match(bundle, /window\.confirm\(`프리셋 “\$\{name\}”을 삭제하시겠습니까\?`\)/);
});

test('history and save settings are exposed and bundled', () => {
  const html = read('../image-gen-fto.html');
  const bundle = read('../src/app.bundle.js');
  const css = read('../src/styles.css');
  for (const id of ['undo', 'redo', 'save-filename', 'select-save-directory', 'save-directory-name', 'save-toast']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const headerEnd = html.indexOf('</header>');
  assert.ok(html.indexOf('class="header-save-settings"') > headerEnd);
  const saveStart = html.indexOf('id="save-settings"');
  const saveEnd = html.indexOf('</aside>', saveStart);
  for (const id of ['save-filename', 'select-save-directory', 'save-directory-name']) {
    assert.ok(html.indexOf(`id="${id}"`) > saveStart);
    assert.ok(html.indexOf(`id="${id}"`) < saveEnd);
  }
  assert.doesNotMatch(html, /class="custom-column save-settings"/);
  assert.match(bundle, /function captureImageState\(\)/);
  assert.match(bundle, /function undo\(\)/);
  assert.match(bundle, /function redo\(\)/);
  assert.match(bundle, /event\.shiftKey\) redo\(\)/);
  assert.match(bundle, /showDirectoryPicker/);
  assert.match(bundle, /function buildSaveFilename\(view, extension\)/);
  assert.match(bundle, /function createUniqueFileHandle\(directory, filename\)/);
  assert.match(bundle, /function showSaveFeedback\(title, filename\)/);
  assert.match(bundle, /fto-image-generator\.save-filename\.v1/);
  assert.match(css, /\.save-toast\.visible/);
  assert.match(css, /\.header-save-settings/);
  assert.match(css, /\.batch-action-row > button \{[\s\S]*?height: auto;[\s\S]*?white-space: normal;/);
});

test('both views include a solid plate between rear and front stickers', () => {
  const cif = JSON.parse(read('../src/assets/fto-template.json'));
  const eif = JSON.parse(read('../src/assets/fto-eif-template.json'));
  assert.deepEqual(cif.backPlate.rearFaces, ['B', 'BR', 'D', 'BL']);
  assert.equal(cif.backPlate.type, 'rect');
  assert.deepEqual(cif.backPlate.bodyFaces, ['U', 'R', 'F', 'L', 'B', 'BR', 'D', 'BL']);
  assert.equal(eif.backPlate.type, 'polygon');
  assert.equal(eif.backPlate.points.length, 6);
  assert.equal(Math.max(...eif.backPlate.points.map(([, y]) => y)), 294.5);
  assert.deepEqual(eif.backPlate.rearFaces, ['BR', 'BL', 'F']);
  assert.deepEqual(eif.backPlate.bodyFaces, ['BR', 'BL', 'F']);
});

test('rear-face visibility is part of rendering, history, and presets', () => {
  const html = read('../image-gen-fto.html');
  const bundle = read('../src/app.bundle.js');
  assert.match(html, /id="show-back-faces"[^>]*checked/);
  assert.match(bundle, /showBackFaces: els\.showBackFaces\.checked/);
  assert.match(bundle, /els\.showBackFaces\.checked = preset\.showBackFaces !== false/);
  assert.match(bundle, /const showBackFaces = options\.showBackFaces \?\? els\.showBackFaces\.checked/);
  assert.match(bundle, /\.filter\(\(face\) => showBackFaces \|\| !rearFaces\.has\(face\)\)/);
  assert.match(bundle, /if \(showBackFaces\) \{/);
});

test('JSON batch previews and exports share save settings without an example download', () => {
  const html = read('../image-gen-fto.html');
  const bundle = read('../src/app.bundle.js');
  const css = read('../src/styles.css');
  const server = read('../scripts/serve.js');
  for (const id of ['batch-json-file', 'batch-json', 'batch-format', 'preview-batch', 'save-batch', 'stop-batch', 'batch-preview-list', 'select-save-directory', 'save-directory-name']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /examples\/batch-algs\.example\.json/);
  assert.doesNotMatch(server, /'examples'/);
  assert.equal(existsSync(new URL('../examples/batch-algs.example.json', import.meta.url)), false);
  assert.match(html, /id="batch-save-controls"/);
  for (const functionName of ['parseBatchJson', 'renderBatchPreviewCards', 'saveBatchItemImage', 'saveAllBatchImages']) {
    assert.match(bundle, new RegExp(`function ${functionName}\\(`));
  }
  assert.match(bundle, /renderPreview\(container, view, colors, options = \{\}\)/);
  assert.match(bundle, /interactive: false/);
  assert.match(bundle, /`\$\{item\.filename\}-\$\{view\}\.\$\{extension\}`/);
  assert.match(css, /\.batch-preview-list/);
  assert.match(css, /\.batch-card-views/);
  assert.match(css, /\.batch-save-directory/);
  assert.match(bundle, /function cancelBatchItem\(item\)/);
  assert.match(bundle, /function requestBatchStop\(\)/);
  assert.match(bundle, /queueStatus: "대기"/);
  assert.match(css, /\.batch-queue-controls/);
});

test('single and batch previews can show CIF, EIF, or both views independently', () => {
  const html = read('../image-gen-fto.html');
  const bundle = read('../src/app.bundle.js');
  const css = read('../src/styles.css');
  for (const id of ['single-view-mode', 'batch-view-mode']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.equal((html.match(/data-view-mode="cif"/g) || []).length, 2);
  assert.equal((html.match(/data-view-mode="eif"/g) || []).length, 2);
  assert.equal((html.match(/data-view-mode="both"/g) || []).length, 4);
  assert.match(bundle, /viewModes: \{ single: "both", batch: "both" \}/);
  assert.match(bundle, /function setViewMode\(scope, mode\)/);
  assert.match(bundle, /function isViewVisible\(mode, view\)/);
  assert.match(bundle, /function selectedViews\(mode\)/);
  assert.match(bundle, /section\.hidden = !isViewVisible\(state\.viewModes\.batch, view\)/);
  assert.match(bundle, /const views = selectedViews\(state\.viewModes\.batch\)/);
  assert.match(bundle, /const total = items\.length \* views\.length/);
  assert.match(bundle, /for \(const view of views\)/);
  assert.match(css, /\.workspace\[data-view-mode="cif"\]/);
  assert.match(css, /\.batch-preview-list\[data-view-mode="cif"\] \.batch-card-views/);
  assert.match(css, /\.view-mode-controls button\[aria-pressed="true"\]/);
});

test('image view settings stay in the toolbar and sticker labels are shared', () => {
  const html = read('../image-gen-fto.html');
  const css = read('../src/styles.css');
  const toolbarStart = html.indexOf('id="single-view-mode"');
  const toolbarEnd = html.indexOf('</div>', toolbarStart);
  const toolbar = html.slice(toolbarStart, toolbarEnd);
  assert.ok(toolbarStart >= 0);
  assert.doesNotMatch(toolbar, /id="show-back-faces"/);
  const customStart = html.indexOf('class="control-panel custom-panel"');
  const customEnd = html.indexOf('</details>', customStart);
  assert.ok(html.indexOf('id="show-back-faces"') > customStart);
  assert.ok(html.indexOf('id="show-back-faces"') < customEnd);
  assert.ok(html.indexOf('id="show-labels"') > html.indexOf('id="color-layout-controls"'));
  assert.ok(html.indexOf('id="show-labels"') < customEnd);
  assert.match(toolbar, /data-view-mode="cif"/);
  assert.match(toolbar, /data-view-mode="eif"/);
  assert.match(toolbar, /data-view-mode="both"/);
  assert.equal((html.match(/id="show-back-faces"/g) || []).length, 1);
  assert.equal((html.match(/id="show-labels"/g) || []).length, 1);
  assert.match(css, /\.view-option-toggle/);
  assert.match(css, /\.view-mode-divider/);
});

test('verbose status stays available to assistive technology without taking layout space', () => {
  const html = read('../image-gen-fto.html');
  const css = read('../src/styles.css');
  assert.match(html, /<p id="status" class="sr-only" role="status" aria-live="polite">/);
  assert.match(css, /\.sr-only \{/);
  assert.doesNotMatch(css, /\.status \{/);
  assert.doesNotMatch(html, /aria-describedby="notation-help status"/);
});

test('landing page links to both generator pages', () => {
  const html = read('../index.html');
  const css = read('../src/home.css');
  assert.match(html, /href="\.\/image-gen-fto\.html"/);
  assert.match(html, /href="\.\/image-gen-3x3\.html"/);
  assert.match(html, /이미지 생성기 선택/);
  assert.match(css, /\.generator-grid/);
  assert.match(css, /@media \(max-width: 680px\)/);
});

test('3x3 generator provides shared editing and an offline classic bundle', () => {
  const html = read('../image-gen-3x3.html');
  const script = read('../src/cube-3x3.js');
  const css = read('../src/cube-3x3.css');
  for (const id of ['cube-palette', 'cube-reset', 'cube-blank', 'cube-3d-preview', 'cube-ll-preview']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const id of ['palette-color', 'palette-hex', 'palette-r', 'palette-g', 'palette-b', 'palette-apply', 'palette-reset']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /data-download="3d"/);
  assert.match(html, /data-download="ll"/);
  assert.match(html, /<script defer src="\.\/src\/cube-3x3\.bundle\.js"><\/script>/);
  const bundle = read('../src/cube-3x3.bundle.js');
  assert.doesNotMatch(bundle, /^\s*(import|export)\s/m);
  assert.doesNotMatch(bundle, /\bfetch\s*\(/);
  assert.match(script, /state\.base\[displayedSources\[view\]\[id\]\]/);
  assert.match(script, /function setPaletteColor\(name, color\)/);
  assert.match(script, /function rgbToHex\(red, green, blue\)/);
  assert.match(script, /const DEFAULT_PALETTE = \{ \.\.\.FACE_COLORS, Blank: BLANK_COLOR \}/);
  assert.match(html, /id="palette-reset">기본 팔레트 복원/);
  assert.match(css, /\.cube-previews/);
  assert.match(css, /\.palette-editor/);
  assert.match(html, /id="stop-batch"/);
  assert.match(script, /function cancelBatchItem\(item\)/);
  assert.match(script, /function requestBatchStop\(\)/);
  assert.match(script, /queueStatus: item\.error \? "오류" : "대기"/);
  assert.match(css, /\.batch-queue-controls/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test('FTO and 3x3 expose the same palette editor controls', () => {
  const fto = read('../image-gen-fto.html');
  const cube = read('../image-gen-3x3.html');
  const script = read('../src/app.js');
  for (const id of ['palette-color', 'palette-hex', 'palette-r', 'palette-g', 'palette-b', 'palette-apply', 'palette-reset']) {
    assert.match(fto, new RegExp(`id="${id}"`));
    assert.match(cube, new RegExp(`id="${id}"`));
  }
  assert.match(fto, /id="palette-reset" type="button">기본 팔레트 복원/);
  assert.match(script, /const FACE_ORDER = \["U", "R", "F", "L", "B", "BR", "D", "BL"\]/);
  assert.match(script, /function setPaletteColor\(name, color\)/);
  assert.match(script, /function rgbToHex\(red, green, blue\)/);
});

test('local server permits every top-level generator page', () => {
  const server = read('../scripts/serve.js');
  for (const page of ['index.html', 'image-gen-fto.html', 'image-gen-3x3.html']) {
    assert.ok(server.includes(`'${page}'`));
  }
});
