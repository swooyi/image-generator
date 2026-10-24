import { FACE_COLORS, BLANK_COLOR, solvedState, identityState, parseNotation, applyTokens, caseState, parseBatch, validateFilename, validateCubeSize } from "./cube-engine.js";

const $ = id => document.getElementById(id);
const VIEWS = ["3d", "ll"];
const STORAGE_KEY = "3x3-image-generator.presets.v1";
const DEFAULT_PALETTE = { ...FACE_COLORS, Blank: BLANK_COLOR };
const state = {
  size: 3, sizeStates: {},
  base: solvedState(), notation: "", mode: "setup", orientations: { "3d": [], ll: [] },
  labels: false, showBackFaces: true, singleView: "both", batchView: "both", colorOrigin: null, palette: { ...DEFAULT_PALETTE }
};
let selectedPaletteName = "U";
let selectedColor = state.palette[selectedPaletteName];
let history = [JSON.stringify(state)];
let historyIndex = 0;
let historyGroupTimer = null;
let activePresetName = "";
let feedbackTimer = null;
let directory = null;
let batchItems = null;
let saving = false;
let batchSaving = false;
let batchStopRequested = false;
let valid = true;
let displayedSources = {};

function status(message) {
  $("cube-status").textContent = message;
  clearTimeout(feedbackTimer);
  $("save-toast").textContent = message;
  $("save-toast").hidden = false;
  feedbackTimer = setTimeout(() => { $("save-toast").hidden = true; }, 3500);
}
function button(label, action) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.addEventListener("click", () => run(action));
  return el;
}
async function run(action) {
  try { await action(); } catch (error) { if (error.name !== "AbortError") status(error.message); }
}
function change(action, group = null) {
  action();
  const snapshot = JSON.stringify(state);
  if (snapshot !== history[historyIndex]) {
    const grouped = group === "notation" && historyGroupTimer !== null;
    finishHistoryGroup();
    history = history.slice(0, historyIndex + 1);
    if (grouped) history[historyIndex] = snapshot;
    else history.push(snapshot);
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
    if (group === "notation") historyGroupTimer = setTimeout(finishHistoryGroup, 600);
  }
  render();
}
function finishHistoryGroup() {
  clearTimeout(historyGroupTimer);
  historyGroupTimer = null;
}
function travel(delta) {
  finishHistoryGroup();
  const index = historyIndex + delta;
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  if (state.size !== JSON.parse(history[index]).size) invalidateBatch();
  Object.assign(state, JSON.parse(history[index]));
  syncControls();
  render();
}
function syncControls() {
  selectedColor = state.palette[selectedPaletteName];
  $("cube-size").value = String(state.size);
  $("notation").value = state.notation;
  $("input-mode").value = state.mode;
  $("show-labels").checked = state.labels;
  $("show-back-faces").checked = state.showBackFaces;
  syncViewButtons();
  renderPalette();
  syncPaletteEditor();
}
function currentCubeState() {
  const { sizeStates, ...current } = state;
  return JSON.parse(JSON.stringify(current));
}
function switchCubeSize(size) {
  validateCubeSize(size);
  if (size === state.size || saving) return;
  invalidateBatch();
  change(() => {
    state.sizeStates[state.size] = currentCubeState();
    const saved = state.sizeStates[size];
    Object.assign(state, saved ? JSON.parse(JSON.stringify(saved)) : {
      size, base: solvedState(size), notation: '', mode: 'setup', orientations: { '3d': [], ll: [] },
      labels: false, showBackFaces: true, singleView: 'both', batchView: 'both', colorOrigin: null, palette: { ...DEFAULT_PALETTE }
    });
  });
  activePresetName = ''; $("preset-name").value = '';
  syncControls(); renderPresets();
}
function insertNotationToken(token) {
  const input = $("notation");
  const before = input.value.slice(0, input.selectionStart);
  const after = input.value.slice(input.selectionEnd);
  const insertion = (before && !/\s$/.test(before) ? " " : "") + token + (after && /^\s/.test(after) ? "" : " ");
  input.value = before + insertion + after;
  change(() => { state.notation = input.value; });
  input.focus({ preventScroll: true });
  input.setSelectionRange(before.length + insertion.length, before.length + insertion.length);
}

function init() {
  $("cube-size").addEventListener("change", () => switchCubeSize(Number($("cube-size").value)));
  for (const token of ["x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"]) {
    $("notation-viewpoints").append(button(token, () => insertNotationToken(token)));
  }
  for (const [id, key, event] of [["notation", "notation", "input"], ["input-mode", "mode", "change"]]) {
    $(id).addEventListener(event, () => change(() => { state[key] = $(id).value; }, key === "notation" ? "notation" : null));
  }
  for (const [scope, key] of [["single", "singleView"], ["batch", "batchView"]]) {
    $(scope + "-view").addEventListener("click", event => {
      const control = event.target.closest("button[data-view-mode]");
      if (control) change(() => { state[key] = control.dataset.viewMode; });
    });
  }
  $("show-labels").addEventListener("change", () => change(() => { state.labels = $("show-labels").checked; }));
  $("show-back-faces").addEventListener("change", () => change(() => { state.showBackFaces = $("show-back-faces").checked; }));
  $("palette-color").addEventListener("input", () => syncPaletteEditor($("palette-color").value));
  $("palette-hex").addEventListener("change", () => {
    if (/^#[0-9a-f]{6}$/i.test($("palette-hex").value.trim())) syncPaletteEditor($("palette-hex").value);
  });
  for (const id of ["palette-r", "palette-g", "palette-b"]) {
    $(id).addEventListener("change", () => {
      const values = ["palette-r", "palette-g", "palette-b"].map(key => Number($(key).value));
      if (values.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) syncPaletteEditor(rgbToHex(...values));
    });
  }
  $("palette-apply").onclick = () => run(applyPaletteEditor);
  $("palette-reset").onclick = () => change(() => resetPalette());
  $("clear-notation").onclick = () => { change(() => { state.notation = ""; }); syncControls(); };
  $("cube-reset").onclick = () => change(() => { state.base = paletteSolvedState(); state.colorOrigin = null; });
  $("cube-blank").onclick = () => change(() => { state.base = Object.fromEntries(Object.keys(state.base).map(id => [id, state.palette.Blank])); state.colorOrigin = null; });
  $("undo").onclick = () => travel(-1);
  $("redo").onclick = () => travel(1);
  document.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if ([ $("preset-name"), $("save-filename"), $("batch-json") ].includes(event.target)) return;
    if (event.key.toLowerCase() === "z") { event.preventDefault(); travel(event.shiftKey ? 1 : -1); }
    if (event.key.toLowerCase() === "y") { event.preventDefault(); travel(1); }
  });
  renderPalette();
  for (const face of Object.keys(FACE_COLORS)) {
    $("face-paint").append(button(face, () => change(() => {
      for (let i = 0; i < state.size * state.size; i += 1) state.base[`${face}${i}`] = selectedColor;
      state.colorOrigin = null;
    })));
  }
  for (const token of ["x", "x'", "y", "y'", "z", "z'"]) {
    $("color-layout").append(button(token, () => change(() => {
      state.colorOrigin ||= { ...state.base };
      state.base = applyTokens(state.base, parseNotation(token, state.size), state.size);
    })));
  }
  const colorReset = button("색 배치 복원", () => change(() => {
    if (state.colorOrigin) state.base = { ...state.colorOrigin };
    state.colorOrigin = null;
  }));
  colorReset.id = "color-layout-reset";
  $("color-layout").append(colorReset);
  organizeViewControls($("color-layout"), "색 배치 변환", colorReset);
  for (const view of VIEWS) {
    for (const token of ["x", "x'", "y", "y'", "z", "z'"]) {
      const control = button(token, () => change(() => { state.orientations[view].push(...parseNotation(token)); }));
      control.title = `${({ x: "R", y: "U", z: "F" })[token[0]]}면에서 축을 바라볼 때 ${token.endsWith("'") ? "반시계" : "시계"} 방향 90° 시점 회전`;
      $( `viewpoint-${view}`).append(control);
    }
    const reset = button("시점 복원", () => change(() => { state.orientations[view] = []; }));
    reset.id = `view-reset-${view}`;
    $(`viewpoint-${view}`).append(reset);
    organizeViewControls($(`viewpoint-${view}`), "시점 변환", reset);
  }
  document.querySelectorAll("[data-download]").forEach(el => el.onclick = () => run(() => {
    if (!valid) throw new Error("입력한 회전기호를 확인하세요.");
    const name = validateFilename($("save-filename").value.trim());
    return saveJobs([{ svg: $(`cube-${el.dataset.download}-preview`).querySelector("svg").cloneNode(true), filename: `${name}-${el.dataset.download}.${el.dataset.format}`, format: el.dataset.format }]);
  }));
  $("save-directory").onclick = () => run(async () => {
    const picked = await window.showDirectoryPicker({ mode: "readwrite" });
    directory = picked;
    $("directory-name").textContent = picked.name;
    $("directory-name").textContent = picked.name;
  });

  if (typeof window.showDirectoryPicker !== "function") {
    $("save-directory").disabled = true;
    $("save-directory").disabled = true;
    $("directory-name").textContent = "기본 다운로드 폴더 (위치 선택 미지원)";
    $("directory-name").textContent = "기본 다운로드 폴더 (위치 선택 미지원)";
  }
  $("new-preset").onclick = () => { activePresetName = ""; $("preset-name").value = ""; renderPresets(); $("preset-name").focus(); };
  $("preset-name").addEventListener("input", updatePresetEditState);
  $("preset-name").addEventListener("keydown", event => { if (event.key === "Enter") run(savePreset); });
  $("save-preset").onclick = () => run(savePreset);
  $("preview-batch").onclick = () => run(loadBatch);
  $("batch-json").addEventListener("input", invalidateBatch);
  $("batch-file").onchange = () => run(async () => {
    const file = $("batch-file").files[0];
    if (!file) return;
    invalidateBatch();
    $("batch-json").value = await file.text();
    loadBatch();
  });
  $("batch-format").onchange = renderBatch;
  $("save-batch").onclick = () => run(() => saveBatch());
  $("stop-batch").onclick = requestBatchStop;
  renderPresets();
  render();
}
function organizeViewControls(container, title, reset) {
  const grid = document.createElement("div");
  grid.className = "viewpoint-button-grid";
  grid.append(...Array.from(container.children).filter(el => el !== reset));
  const header = document.createElement("div");
  header.className = "viewpoint-controls-header";
  const label = document.createElement("span");
  label.textContent = title;
  reset.className = "viewpoint-reset-button";
  header.append(label, reset);
  container.replaceChildren(header, grid);
}
function syncViewButtons() {
  for (const [scope, mode] of [["single", state.singleView], ["batch", state.batchView]]) {
    $(scope + "-view").querySelectorAll("button").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.viewMode === mode)));
  }
}
function updatePresetEditState() {
  $("save-preset").textContent = activePresetName && $("preset-name").value.trim() === activePresetName ? "변경 저장" : "저장";
  $("new-preset").disabled = !activePresetName && !$("preset-name").value.trim();
}
function renderPalette() {
  $("cube-palette").replaceChildren(...Object.entries(state.palette).map(([name, color]) => {
    const el = button("", () => {
      selectedPaletteName = name;
      selectedColor = color;
      renderPalette();
      syncPaletteEditor();
    });
    el.style.background = color;
    el.title = name;
    el.setAttribute("aria-label", name);
    el.setAttribute("aria-pressed", String(name === selectedPaletteName));
    return el;
  }));
}
function normalizeHexColor(value) {
  const color = String(value).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error("HEX 색상은 # 뒤에 6자리 16진수로 입력하세요.");
  return color;
}
function hexToRgb(color) {
  const value = normalizeHexColor(color).slice(1);
  return [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16));
}
function rgbToHex(red, green, blue) {
  const values = [red, green, blue].map(value => Number(value));
  if (!values.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) throw new Error("RGB 값은 0부터 255 사이의 정수로 입력하세요.");
  return `#${values.map(value => value.toString(16).padStart(2, "0")).join("")}`;
}
function syncPaletteEditor(color = state.palette[selectedPaletteName]) {
  color = normalizeHexColor(color);
  const [red, green, blue] = hexToRgb(color);
  $("palette-color").value = color;
  $("palette-hex").value = color;
  $("palette-r").value = red;
  $("palette-g").value = green;
  $("palette-b").value = blue;
}
function replaceColor(record, previous, next) {
  if (!record) return record;
  return Object.fromEntries(Object.entries(record).map(([key, color]) => [key, color === previous ? next : color]));
}
function setPaletteColor(name, color) {
  color = normalizeHexColor(color);
  const previous = state.palette[name];
  if (!previous) throw new Error("수정할 팔레트 색상을 선택하세요.");
  state.palette[name] = color;
  state.base = replaceColor(state.base, previous, color);
  state.colorOrigin = replaceColor(state.colorOrigin, previous, color);
  selectedColor = color;
}
function applyPaletteEditor() {
  const color = normalizeHexColor($("palette-hex").value);
  const rgbColor = rgbToHex($("palette-r").value, $("palette-g").value, $("palette-b").value);
  if (color !== rgbColor) throw new Error("HEX와 RGB 값이 일치하지 않습니다.");
  change(() => setPaletteColor(selectedPaletteName, color));
  renderPalette();
  syncPaletteEditor();
  status(`${selectedPaletteName} 팔레트 색상을 ${color}로 변경했습니다.`);
}
function resetPalette() {
  state.palette = { ...DEFAULT_PALETTE };
  state.base = solvedState(state.size);
  state.colorOrigin = null;
  selectedColor = state.palette[selectedPaletteName];
  renderPalette();
  syncPaletteEditor();
}
function paletteSolvedState() {
  return Object.fromEntries(Object.keys(solvedState(state.size)).map(id => [id, state.palette[id[0]]]));
}
function render() {
  $("cube-size").disabled = saving;
  syncViewButtons();
  $("save-batch").textContent = batchSaving ? "생성 중…" : "선택 항목 저장";
  $("stop-batch").disabled = !batchSaving || batchStopRequested;
  $("stop-batch").textContent = batchStopRequested ? "중단 요청됨" : "생성 중단";
  $("save-directory").disabled = saving || typeof window.showDirectoryPicker !== "function";

  $("clear-notation").disabled = !state.notation;
  let colors;
  try {
    colors = caseState(state.base, state.notation, state.mode, state.size);
    const sources = caseState(identityState(state.size), state.notation, state.mode, state.size);
    displayedSources = Object.fromEntries(VIEWS.map(view => [view, applyTokens(sources, state.orientations[view], state.size)]));
    valid = true;
    $("notation-error").hidden = true;
    $("notation").removeAttribute("aria-invalid");
  } catch (error) {
    valid = false;
    colors = state.base;
    $("notation-error").textContent = error.message;
    $("notation-error").hidden = false;
    $("notation").setAttribute("aria-invalid", "true");
  }
  for (const view of VIEWS) {
    $(`cube-${view}-preview`).replaceChildren(renderSvg(view, applyTokens(colors, state.orientations[view], state.size), valid));
    document.querySelector(`.cube-preview-card[data-view="${view}"]`).hidden = state.singleView !== "both" && state.singleView !== view;
    $(`view-reset-${view}`).disabled = !state.orientations[view].length;
  }
  document.querySelector(".cube-previews").classList.toggle("single", state.singleView !== "both");
  document.querySelectorAll("[data-download]").forEach(el => { el.disabled = !valid || saving; });
  $("undo").disabled = historyIndex === 0;
  $("redo").disabled = historyIndex === history.length - 1;
  $("color-layout-reset").disabled = !state.colorOrigin;
  renderBatch();
  cubeSimulatorRefresh();
}
function svgElement(tag, attributes = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
}
// Round the actual polygon, so the exported silhouette matches the preview.
function roundedPath(points, radius) {
  const corners = points.map((point, i) => {
    const before = points[(i + points.length - 1) % points.length];
    const after = points[(i + 1) % points.length];
    const toward = other => {
      const distance = Math.hypot(other[0] - point[0], other[1] - point[1]);
      const ratio = Math.min(radius / distance, .25);
      return point.map((v, j) => v + (other[j] - v) * ratio);
    };
    return { point, entry: toward(before), exit: toward(after) };
  });
  return `M ${corners[0].entry.join(" ")} ` + corners.map(c => `L ${c.entry.join(" ")} Q ${c.point.join(" ")} ${c.exit.join(" ")}`).join(" ") + " Z";
}
function renderSvg(view, colors, interactive = false) {
  const size = state.size;
  const svg = svgElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: view === "3d" ? (state.showBackFaces ? "-26 -16 372 396" : "0 0 320 335") : "0 0 370 350", role: "img", "aria-label": `${size}×${size}×${size} ${view.toUpperCase()} 미리보기` });
  const plate = points => svg.append(svgElement("path", { d: roundedPath(points, 4), fill: "#191d1b", "pointer-events": "none", "data-body": "true" }));
  const sticker = (face, index, points) => {
    const id = `${face}${index}`;
    const path = svgElement("path", { d: roundedPath(points, (view === "3d" ? 3 : 4) * 3 / size), fill: colors[id], "data-sticker": id });
    if (interactive) {
      path.setAttribute("class", "cube-sticker");
      path.addEventListener("click", () => change(() => {
        state.base[displayedSources[view][id]] = selectedColor;
        state.colorOrigin = null;
      }));
    }
    svg.append(path);
    if (state.labels) {
      const center = points.reduce((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
      const label = svgElement("text", { x: center[0], y: center[1], "text-anchor": "middle", "dominant-baseline": "central", "font-size": Math.min(10, 42 / size), "font-family": "sans-serif", fill: "#111", stroke: "#fff", "stroke-width": "2", "paint-order": "stroke", "pointer-events": "none" });
      label.textContent = id;
      svg.append(label);
    }
  };
  const rect = (x, y, w, h) => [[x,y], [x+w,y], [x+w,y+h], [x,y+h]];
  if (view === "3d") {
    const frontFaces = [
      ["U", [[160,24], [286,96], [160,168], [34,96]]],
      ["F", [[34,96], [160,168], [160,312], [34,240]]],
      ["R", [[160,168], [286,96], [286,240], [160,312]]]
    ];
    // Project the opposite faces in the same axes and offset them outwards.
    // The front body masks their inner stickers, leaving an outer rim visible.
    const rearFaces = [
      ["L", [[132,8], [6,80], [6,224], [132,152]]],
      ["B", [[314,80], [188,8], [188,152], [314,224]]],
      ["D", [[34,272], [160,344], [286,272], [160,200]]]
    ];
    const drawFace = (face, corners) => {
      const point = (u, v) => corners[0].map((n, axis) => n + (corners[1][axis] - n) * u + (corners[3][axis] - n) * v);
      for (let row = 0; row < size; row += 1) for (let col = 0; col < size; col += 1) {
        const inset = .054 / size;
        const u = col / size + inset, v = row / size + inset, right = (col + 1) / size - inset, bottom = (row + 1) / size - inset;
        sticker(face, row * size + col, [point(u,v), point(right,v), point(right,bottom), point(u,bottom)]);
      }
    };
    if (state.showBackFaces) {
      for (const [face, corners] of rearFaces) {
        plate(corners);
        drawFace(face, corners);
      }
    }
    plate([[160,24], [286,96], [286,240], [160,312], [34,240], [34,96]]);
    for (const [face, corners] of frontFaces) drawFace(face, corners);
  } else {
    // A cross-shaped body keeps the outside corners transparent.
    plate([[83,36], [287,36], [287,72], [323,72], [323,276], [287,276], [287,312], [83,312], [83,276], [47,276], [47,72], [83,72]]);
    const cell = 204 / size, gap = 12 / size;
    for (let row = 0; row < size; row += 1) for (let col = 0; col < size; col += 1) sticker("U", row * size + col, rect(85 + col * cell, 74 + row * cell, cell-gap, cell-gap));
    for (let i = 0; i < size; i += 1) {
      sticker("B", size-1-i, rect(85+i*cell,38,cell-gap,30));
      sticker("F", i, rect(85+i*cell,280,cell-gap,30));
      sticker("L", i, rect(49,74+i*cell,30,cell-gap));
      sticker("R", size-1-i, rect(291,74+i*cell,30,cell-gap));
    }
  }
  return svg;
}
function readPresets() {
  const presets = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  if (!Array.isArray(presets)) throw new Error("저장된 프리셋 형식이 올바르지 않습니다.");
  return presets;
}
function validatePreset(value) {
  const size = validateCubeSize(value?.size ?? 3);
  if (value?.showBackFaces !== undefined && typeof value.showBackFaces !== "boolean") throw new Error("프리셋 뒷면 표시 설정 오류");
  if (!value || !["setup", "alg"].includes(value.mode) || typeof value.notation !== "string" || typeof value.labels !== "boolean") throw new Error("올바르지 않은 프리셋입니다.");
  for (const key of ["singleView", "batchView"]) if (!["both", ...VIEWS].includes(value[key])) throw new Error("프리셋 보기 설정 오류");
  for (const id of Object.keys(solvedState(size))) {
    if (!/^#[0-9a-f]{6}$/i.test(value.base?.[id])) throw new Error("프리셋 색상 오류");
    if (value.colorOrigin && !/^#[0-9a-f]{6}$/i.test(value.colorOrigin[id])) throw new Error("프리셋 기준 색상 오류");
  }
  if (value.palette !== undefined) {
    for (const name of Object.keys(DEFAULT_PALETTE)) if (!/^#[0-9a-f]{6}$/i.test(value.palette?.[name])) throw new Error("프리셋 팔레트 오류");
  }
  parseNotation(value.notation, size);
  for (const view of VIEWS) if (!Array.isArray(value.orientations?.[view]) || value.orientations[view].some(t => !t || !["x","y","z"].includes(t.move) || ![1,2,3].includes(t.turns))) throw new Error("프리셋 시점 오류");
}
function savePreset() {
  if (!valid) throw new Error("회전기호 오류를 수정한 뒤 저장하세요.");
  const name = $("preset-name").value.trim();
  if (!name) { $("preset-name").focus(); throw new Error("프리셋 이름을 입력하세요."); }
  const presets = readPresets();
  const index = presets.findIndex(p => p.name === name);
  const preset = { name, state: currentCubeState() };
  if (index < 0) presets.push(preset); else presets[index] = preset;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  activePresetName = name;
  renderPresets();
  status(`프리셋 “${name}” 저장 완료`);
}
function renderPresets() {
  try {
    const presets = readPresets();
    $("preset-list").replaceChildren(...presets.map(preset => {
      const row = document.createElement("div");
      row.className = "preset-row";
      row.setAttribute("role", "listitem");
      const load = button("", () => {
        validatePreset(preset.state);
        invalidateBatch();
        change(() => {
          state.sizeStates[state.size] = currentCubeState();
          const { sizeStates, ...saved } = JSON.parse(JSON.stringify(preset.state));
          Object.assign(state, { size: 3, showBackFaces: true, palette: { ...DEFAULT_PALETTE } }, saved);
        });
        syncControls();
        $("preset-name").value = preset.name;
        activePresetName = preset.name;
        renderPresets();
        status(`프리셋 “${preset.name}”을 불러왔습니다.`);
      });
      load.className = "preset-load-button";
      load.classList.toggle("active", activePresetName === preset.name);
      const name = document.createElement("span");
      name.className = "preset-item-name";
      name.textContent = preset.name;
      const hint = document.createElement("span");
      hint.className = "preset-item-action";
      hint.textContent = activePresetName === preset.name ? "수정 중" : "불러오기";
      load.append(name, hint);
      const remove = button("삭제", () => {
        if (!window.confirm(`프리셋 “${preset.name}”을 삭제하시겠습니까?`)) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(readPresets().filter(p => p.name !== preset.name)));
        if (activePresetName === preset.name) activePresetName = "";
        if ($("preset-name").value.trim() === preset.name) $("preset-name").value = "";
        renderPresets();
        status(`프리셋 “${preset.name}”을 삭제했습니다.`);
      });
      remove.className = "preset-delete-button";
      remove.setAttribute("aria-label", `${preset.name} 프리셋 삭제`);
      row.append(load, remove);
      return row;
    }));
    if (!presets.length) {
      const empty = document.createElement("p");
      empty.className = "preset-empty";
      empty.textContent = "저장된 프리셋 없음";
      $("preset-list").append(empty);
    }
    updatePresetEditState();
  } catch (error) { status(`프리셋을 읽지 못했습니다: ${error.message}`); }
}
function invalidateBatch() {
  if (batchSaving) requestBatchStop();
  batchItems = null;
  $("batch-list").replaceChildren();
  $("batch-json").removeAttribute("aria-invalid");
  $("save-batch").disabled = true;
  $("batch-status").textContent = "입력이 변경되었습니다. 미리보기를 다시 생성하세요.";
}
function loadBatch() {
  invalidateBatch();
  try {
    batchItems = parseBatch($("batch-json").value, state.size).map(item => ({
      ...item,
      selected: !item.error,
      cancelled: false,
      queueStatus: item.error ? "오류" : "대기"
    }));
    renderBatch();
  }
  catch (error) { $("batch-status").textContent = error.message; $("batch-json").setAttribute("aria-invalid", "true"); }
}
function batchSvg(item, view) {
  return renderSvg(view, applyTokens(caseState(state.base, item.scramble, state.mode, state.size), state.orientations[view], state.size));
}
function selectedViews(mode) { return mode === "both" ? VIEWS : [mode]; }
function renderBatch() {
  if (!batchItems) return;
  $("batch-list").replaceChildren(...batchItems.map(item => {
    const card = document.createElement("article");
    card.className = "batch-card";
    const title = document.createElement("h3");
    title.textContent = item.filename;
    const description = document.createElement("p");
    description.textContent = item.error || item.scramble || "기본 상태";
    if (item.error) description.className = "error";
    const header = document.createElement("header");
    header.className = "batch-card-header";
    const heading = document.createElement("div");
    heading.className = "batch-card-heading";
    const notation = document.createElement("code");
    notation.textContent = item.scramble || "(완성 상태)";
    heading.append(title, notation);
    header.append(heading);
    if (!item.error) {
      const controls = document.createElement("div");
      controls.className = "batch-queue-controls";
      const selectionLabel = document.createElement("label");
      const selection = document.createElement("input");
      selection.type = "checkbox";
      selection.checked = item.selected;
      selection.disabled = batchSaving || item.cancelled;
      selection.addEventListener("change", () => {
        item.selected = selection.checked;
        item.queueStatus = selection.checked ? "대기" : "제외";
        renderBatch();
      });
      selectionLabel.append(selection, document.createTextNode("선택"));
      const queueStatus = document.createElement("span");
      queueStatus.className = "batch-queue-status";
      queueStatus.textContent = item.queueStatus;
      const cancel = button("취소", () => cancelBatchItem(item));
      cancel.disabled = item.cancelled || item.queueStatus === "완료";
      controls.append(selectionLabel, queueStatus, cancel);
      header.append(controls);
    }
    card.append(header);
    if (item.error) card.append(description);
    if (!item.error) {
      const views = document.createElement("div");
      views.className = "batch-views";
      for (const view of selectedViews(state.batchView)) {
        const panel = document.createElement("div");
        panel.className = "batch-view";
        const save = button(`${view.toUpperCase()} 저장`, () => saveBatch(item, view));
        save.disabled = saving;
        const viewHeader = document.createElement("div");
        viewHeader.className = "batch-view-header";
        const label = document.createElement("span");
        label.textContent = view.toUpperCase();
        save.textContent = "저장";
        viewHeader.append(label, save);
        panel.append(viewHeader, batchSvg(item, view));
        views.append(panel);
      }
      card.append(views);
    }
    return card;
  }));
  const validCount = batchItems.filter(item => !item.error).length;
  const selectedCount = batchItems.filter(item => !item.error && item.selected && !item.cancelled).length;
  $("save-batch").disabled = !selectedCount || saving;
  $("save-batch").textContent = batchSaving ? "생성 중…" : "선택 항목 저장";
  $("stop-batch").disabled = !batchSaving || batchStopRequested;
  $("stop-batch").textContent = batchStopRequested ? "중단 요청됨" : "생성 중단";
  if (!batchSaving) $("batch-status").textContent = `${selectedCount}/${validCount}개 선택 · ${batchItems.length - validCount}개 오류. 선택 항목이 생성 대기열에 들어갑니다.`;
}
function cancelBatchItem(item) {
  item.cancelled = true;
  item.selected = false;
  item.queueStatus = item.queueStatus === "생성 중" ? "취소 대기" : "취소됨";
  renderBatch();
}
function requestBatchStop() {
  if (!batchSaving) return;
  batchStopRequested = true;
  $("stop-batch").disabled = true;
  $("stop-batch").textContent = "중단 요청됨";
  $("batch-status").textContent = "현재 이미지 처리를 마친 뒤 생성을 중단합니다.";
}
function saveBatch(item = null, view = null) {
  const items = item ? [item] : (batchItems || []).filter(entry => !entry.error && entry.selected && !entry.cancelled);
  const format = $("batch-format").value;
  const jobs = items.flatMap(entry => (view ? [view] : selectedViews(state.batchView)).map(v => ({ item: item ? null : entry, view: v, svg: batchSvg(entry, v), filename: `${entry.filename}-${v}.${format}`, format })));
  return saveJobs(jobs, { batch: !item });
}
async function imageBlob(svg, format) {
  svg.querySelectorAll(".cube-sticker").forEach(el => el.removeAttribute("class"));
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  if (format === "svg") return blob;
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const [, , width, height] = svg.getAttribute("viewBox").split(" ").map(Number);
    const scale = 1600 / Math.max(width, height);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("PNG 생성 실패");
    return png;
  } finally { URL.revokeObjectURL(url); }
}
async function uniqueHandle(folder, filename) {
  const dot = filename.lastIndexOf(".");
  for (let index = 1; index <= 9999; index += 1) {
    const name = index === 1 ? filename : `${filename.slice(0, dot)} (${index})${filename.slice(dot)}`;
    try { await folder.getFileHandle(name); }
    catch (error) {
      if (error.name !== "NotFoundError") throw error;
      return { handle: await folder.getFileHandle(name, { create: true }), name };
    }
  }
  throw new Error("사용 가능한 파일명이 없습니다.");
}
async function saveJobs(jobs, options = {}) {
  if (saving || !jobs.length) return;
  saving = true;
  batchSaving = Boolean(options.batch);
  batchStopRequested = false;
  const folder = directory;
  let completed = 0;
  render();
  if (batchSaving) $("batch-status").textContent = `선택 항목 생성 중: 0/${jobs.length}`;
  else status(`저장 중: 0/${jobs.length}`);
  try {
    for (const job of jobs) {
      if (batchStopRequested) break;
      if (job.item?.cancelled) continue;
      if (job.item) {
        job.item.queueStatus = "생성 중";
        renderBatch();
      }
      const blob = await imageBlob(job.svg, job.format);
      if (batchStopRequested || job.item?.cancelled) continue;
      if (folder) {
        const { handle } = await uniqueHandle(folder, job.filename);
        const writable = await handle.createWritable();
        try { await writable.write(blob); await writable.close(); }
        catch (error) { await writable.abort().catch(() => {}); throw error; }
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = job.filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
        // Give the browser time to dispatch each download in a batch.
        if (jobs.length > 1) await new Promise(resolve => setTimeout(resolve, 200));
      }
      completed += 1;
      if (job.item) {
        const itemJobs = jobs.filter(entry => entry.item === job.item);
        const itemCompleted = itemJobs.filter(entry => entry.done).length + 1;
        job.done = true;
        job.item.queueStatus = itemCompleted === itemJobs.length ? "완료" : "생성 중";
        renderBatch();
      }
      if (batchSaving) $("batch-status").textContent = `선택 항목 생성 중: ${completed}/${jobs.length}`;
      else status(`${completed}/${jobs.length} ${folder ? "저장 완료" : "다운로드 요청"}`);
    }
    if (batchSaving) {
      for (const item of batchItems || []) {
        if (item.queueStatus === "대기" || item.queueStatus === "취소 대기" || item.queueStatus === "생성 중") {
          const done = jobs.some(job => job.item === item && job.done);
          item.queueStatus = done ? "일부 완료" : "취소됨";
        }
      }
      const stopped = batchStopRequested || completed < jobs.length;
      $("batch-status").textContent = stopped ? `${completed}/${jobs.length}개 이미지 처리 후 중단했습니다.` : `${completed}개 이미지 ${folder ? "저장" : "다운로드 요청"} 완료`;
    } else if (!folder && jobs.length > 1) status(`${completed}개 다운로드 요청 완료. 브라우저에서 여러 파일 다운로드 허용이 필요할 수 있습니다.`);
  } catch (error) { throw new Error(`${completed}/${jobs.length} 처리 후 중단: ${error.message}`); }
  finally {
    saving = false;
    batchSaving = false;
    batchStopRequested = false;
    render();
  }
}
init();
