import { applyTokens, applyOrientationTokens, parseNotation, invertTokens, formatToken, identityState } from "./fto-engine.js";

const FACE_ORDER = ["U", "R", "F", "L", "B", "BR", "D", "BL"];
const DRAW_ORDER = {
  cif: ["D", "BR", "BL", "B", "F", "L", "R", "U"],
  eif: ["D", "BR", "BL", "B", "F", "L", "R", "U"]
};
const PRESET_STORAGE_KEY = "fto-image-generator.presets.v1";
const SAVE_FILENAME_STORAGE_KEY = "fto-image-generator.save-filename.v1";
const HISTORY_LIMIT = 100;
const VIEWS = ["cif", "eif"];
const VIEWPOINT_TOKENS = [
  { move: "U", suffix: "" }, { move: "U", suffix: "'" },
  { move: "R", suffix: "" }, { move: "R", suffix: "'" },
  { move: "F", suffix: "" }, { move: "F", suffix: "'" },
  { move: "V", suffix: "" }
];
const EIF_VIEWPOINT_MOVE_MAP = { U: "B", R: "R", F: "U", V: "V" };

const state = {
  template: null,
  eifTemplate: null,
  colors: null,
  defaultColors: null,
  baseColors: {},
  stickerTexts: {},
  colorLayoutOrigin: null,
  selectedColor: "#2c2d2d",
  selectedPaletteName: "U",
  activePresetName: "",
  lastTokens: [],
  viewpointTokens: { cif: [], eif: [] },
  displayedSources: { cif: identityState(), eif: identityState() },
  valid: false,
  batchItems: [],
  batchPreparedItems: [],
  viewModes: { single: "both", batch: "both" },
  batchSaving: false,
  batchStopRequested: false,
  saving: false,
  saveDirectoryHandle: null,
  saveFeedbackTimer: null,
  saveFeedbackHideTimer: null
};

const history = {
  undoStack: [],
  redoStack: [],
  current: null,
  activeGroup: null,
  groupTimer: null
};

const els = {
  cif: document.querySelector("#cif-preview"),
  eif: document.querySelector("#eif-preview"),
  notation: document.querySelector("#notation"),
  mode: document.querySelector("#input-mode"),
  showBackFaces: document.querySelector("#show-back-faces"),
  showLabels: document.querySelector("#show-labels"),
  stickerTextTarget: document.querySelector("#sticker-text-target"),
  stickerTextInput: document.querySelector("#sticker-text-input"),
  showStickerText: document.querySelector("#show-sticker-text"),
  palette: document.querySelector("#palette"),
  paletteColor: document.querySelector("#palette-color"),
  paletteHex: document.querySelector("#palette-hex"),
  paletteRed: document.querySelector("#palette-r"),
  paletteGreen: document.querySelector("#palette-g"),
  paletteBlue: document.querySelector("#palette-b"),
  paletteApply: document.querySelector("#palette-apply"),
  paletteReset: document.querySelector("#palette-reset"),
  faceButtons: document.querySelector("#face-buttons"),
  viewpointControls: {
    cif: document.querySelector("#cif-viewpoint-controls"),
    eif: document.querySelector("#eif-viewpoint-controls")
  },
  viewpointReset: {},
  colorLayoutControls: document.querySelector("#color-layout-controls"),
  colorLayoutReset: null,
  presetName: document.querySelector("#preset-name"),
  presetList: document.querySelector("#preset-list"),
  newPreset: document.querySelector("#new-preset"),
  savePreset: document.querySelector("#save-preset"),
  undo: document.querySelector("#undo"),
  redo: document.querySelector("#redo"),
  saveFilename: document.querySelector("#save-filename"),
  selectSaveDirectory: document.querySelector("#select-save-directory"),
  saveDirectoryName: document.querySelector("#save-directory-name"),
  selectBatchSaveDirectory: document.querySelector("#select-save-directory"),
  batchSaveDirectoryName: document.querySelector("#save-directory-name"),
  saveToast: document.querySelector("#save-toast"),
  singleWorkspace: document.querySelector("#single-workspace"),
  viewModeControls: {
    single: document.querySelector("#single-view-mode"),
    batch: document.querySelector("#batch-view-mode")
  },
  batchJsonFile: document.querySelector("#batch-json-file"),
  batchJson: document.querySelector("#batch-json"),
  batchFormat: document.querySelector("#batch-format"),
  previewBatch: document.querySelector("#preview-batch"),
  saveBatch: document.querySelector("#save-batch"),
  stopBatch: document.querySelector("#stop-batch"),
  batchStatus: document.querySelector("#batch-status"),
  batchPreviewList: document.querySelector("#batch-preview-list"),
  status: document.querySelector("#status"),
  resetSolved: document.querySelector("#reset-solved"),
  resetBlank: document.querySelector("#reset-blank")
};

init().catch(error => {
  els.status.textContent = `초기화 실패: ${error.message}`;
});

async function init() {
  const [template, eifTemplate, colors] = await Promise.all([
    fetch("./src/assets/fto-template.json").then((res) => res.json()),
    fetch("./src/assets/fto-eif-template.json").then((res) => res.json()),
    fetch("./src/assets/fto-colors.json").then((res) => res.json())
  ]);
  state.template = template;
  state.eifTemplate = eifTemplate;
  state.colors = cloneColors(colors);
  state.defaultColors = cloneColors(colors);
  state.selectedColor = state.colors.faces[state.selectedPaletteName];
  resetSolved();
  els.stickerTextTarget.replaceChildren(...state.template.stickers.map((sticker) => {
    const option = document.createElement("option");
    option.value = sticker.id;
    option.textContent = sticker.id;
    return option;
  }));
  els.saveFilename.value = readSaveFilename();
  renderControls();
  renderPresetOptions();
  bindEvents();
  updateSaveDirectorySupport();
  update();
  history.current = captureImageState();
  updateHistoryButtons();
}

function bindEvents() {
  new MutationObserver(() => {
    const message = els.status.textContent;
    if (!message || /^(Setup|Alg) ·/.test(message) || message === document.querySelector("#notation-error").textContent) return;
    showSaveFeedback(message, "");
  }).observe(els.status, { childList: true, characterData: true, subtree: true });
  els.batchJson.addEventListener("input", invalidateBatch);
  els.notation.addEventListener("input", () => updateAndRecord("notation"));
  for (const token of ["{Uo}", "{Uo'}", "{Ro}", "{Ro'}", "{Fo}", "{Fo'}", "T", "T'", "T2"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = token;
    button.addEventListener("click", () => insertNotationToken(token));
    document.querySelector("#notation-viewpoints").append(button);
  }
  els.mode.addEventListener("change", () => updateAndRecord());
  els.showBackFaces.addEventListener("change", () => updateAndRecord());
  els.showLabels.addEventListener("change", () => updateAndRecord());
  els.stickerTextTarget.addEventListener("change", syncStickerTextInput);
  els.stickerTextInput.addEventListener("input", () => {
    const id = els.stickerTextTarget.value;
    if (els.stickerTextInput.value) state.stickerTexts[id] = els.stickerTextInput.value;
    else delete state.stickerTexts[id];
    updateAndRecord("sticker-text");
  });
  els.showStickerText.addEventListener("change", () => updateAndRecord());
  els.paletteColor.addEventListener("input", () => syncPaletteEditor(els.paletteColor.value));
  els.paletteHex.addEventListener("change", () => {
    if (/^#[0-9a-f]{6}$/i.test(els.paletteHex.value.trim())) syncPaletteEditor(els.paletteHex.value);
  });
  for (const input of [els.paletteRed, els.paletteGreen, els.paletteBlue]) {
    input.addEventListener("change", () => {
      const values = [els.paletteRed, els.paletteGreen, els.paletteBlue].map(element => Number(element.value));
      if (values.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
        syncPaletteEditor(rgbToHex(...values));
      }
    });
  }
  els.paletteApply.addEventListener("click", () => {
    try {
      applyPaletteEditor();
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  els.paletteReset.addEventListener("click", resetPalette);
  els.resetSolved.addEventListener("click", () => {
    resetSolved();
    updateAndRecord();
  });
  els.resetBlank.addEventListener("click", () => {
    resetBlank();
    updateAndRecord();
  });
  document.querySelector("#clear-notation").addEventListener("click", () => {
    els.notation.value = "";
    updateAndRecord();
  });
  els.undo.addEventListener("click", undo);
  els.redo.addEventListener("click", redo);
  els.newPreset.addEventListener("click", startNewPreset);
  els.savePreset.addEventListener("click", savePreset);
  els.presetName.addEventListener("input", updatePresetEditState);
  els.presetName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") savePreset();
  });
  els.saveFilename.addEventListener("input", () => {
    localStorage.setItem(SAVE_FILENAME_STORAGE_KEY, els.saveFilename.value);
  });
  els.selectSaveDirectory.addEventListener("click", () => {
    selectSaveDirectory().catch(error => { els.status.textContent = `저장 위치 선택 실패: ${error.message}`; });
  });
  els.batchJsonFile.addEventListener("change", () => {
    loadBatchJsonFile().catch(error => { els.batchStatus.textContent = `JSON 파일 불러오기 실패: ${error.message}`; });
  });
  els.previewBatch.addEventListener("click", loadBatchPreviews);
  els.saveBatch.addEventListener("click", () => {
    saveAction(saveAllBatchImages).catch(error => { els.batchStatus.textContent = `전체 저장 실패: ${error.message}`; });
  });
  els.stopBatch.addEventListener("click", requestBatchStop);
  for (const view of VIEWS) {
    document.querySelector(`#download-${view}-svg`).addEventListener("click", () => {
      saveAction(() => downloadSvg(view)).catch(error => { els.status.textContent = `저장 실패: ${error.message}`; });
    });
    document.querySelector(`#download-${view}-png`).addEventListener("click", () => {
      saveAction(() => downloadPng(view)).catch(error => { els.status.textContent = `저장 실패: ${error.message}`; });
    });
  }
  for (const scope of ["single", "batch"]) {
    els.viewModeControls[scope].addEventListener("click", (event) => {
      const button = event.target.closest("button[data-view-mode]");
      if (button) setViewMode(scope, button.dataset.viewMode);
    });
  }
  document.addEventListener("keydown", handleHistoryShortcut);
}

function insertNotationToken(token) {
  const input = els.notation;
  const before = input.value.slice(0, input.selectionStart);
  const after = input.value.slice(input.selectionEnd);
  const insertion = (before && !/\s$/.test(before) ? " " : "") + token + (after && /^\s/.test(after) ? "" : " ");
  input.value = before + insertion + after;
  updateAndRecord();
  input.focus({ preventScroll: true });
  input.setSelectionRange(before.length + insertion.length, before.length + insertion.length);
}

function setViewMode(scope, mode) {
  if (!VIEWS.includes(mode) && mode !== "both") return;
  state.viewModes[scope] = mode;
  const controls = els.viewModeControls[scope];
  for (const button of controls.querySelectorAll("button[data-view-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.viewMode === mode));
  }
  if (scope === "single") {
    els.singleWorkspace.dataset.viewMode = mode;
    for (const panel of els.singleWorkspace.querySelectorAll(".preview-panel[data-view]")) {
      panel.hidden = !isViewVisible(mode, panel.dataset.view);
    }
    return;
  }
  els.batchPreviewList.dataset.viewMode = mode;
  for (const view of els.batchPreviewList.querySelectorAll(".batch-view[data-view]")) {
    view.hidden = !isViewVisible(mode, view.dataset.view);
  }
  if (state.batchPreparedItems.length) updateBatchStatus();
}

function isViewVisible(mode, view) {
  return mode === "both" || mode === view;
}

function selectedViews(mode) {
  return VIEWS.filter((view) => isViewVisible(mode, view));
}

function renderControls() {
  for (const view of VIEWS) {
    const header = document.createElement("div");
    header.className = "viewpoint-controls-header";
    const label = document.createElement("span");
    label.textContent = "시점 변환";
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "viewpoint-reset-button";
    resetButton.textContent = "시점 복원";
    resetButton.addEventListener("click", () => {
      if (!state.viewpointTokens[view].length) return;
      state.viewpointTokens[view] = [];
      updateAndRecord();
    });
    els.viewpointReset[view] = resetButton;
    header.append(label, resetButton);

    const buttonGrid = document.createElement("div");
    buttonGrid.className = "viewpoint-button-grid";
    buttonGrid.replaceChildren(
      ...VIEWPOINT_TOKENS.map((token) => {
        const button = document.createElement("button");
        button.type = "button";
        if (token.move === "V") {
          button.className = "viewpoint-vertex-button";
          button.textContent = "꼭짓점 ↻90°";
          button.title = view === "cif"
            ? "정면 꼭짓점 기준 시계방향 90° 시점 회전"
            : "정면 하단 꼭짓점 기준 시계방향 90° 시점 회전";
          button.setAttribute("aria-label", button.title);
        } else {
          button.textContent = formatViewpointToken(token);
          const axisMove = view === "eif" ? EIF_VIEWPOINT_MOVE_MAP[token.move] : token.move;
          button.title = `${axisMove}면 수직축으로 ${token.suffix ? "반시계" : "시계"} 방향 120° 시점 회전`;
        }
        button.addEventListener("click", () => {
          state.viewpointTokens[view].push({ ...token });
          updateAndRecord();
        });
        return button;
      })
    );
    els.viewpointControls[view].replaceChildren(header, buttonGrid);
  }
  renderColorLayoutControls();
  renderPalette();
  els.faceButtons.replaceChildren(
    ...FACE_ORDER.map((face) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = face;
      button.addEventListener("click", () => {
        state.colorLayoutOrigin = null;
        for (const sticker of state.template.stickers.filter((item) => item.face === face)) {
          state.baseColors[sticker.id] = state.selectedColor;
        }
        updateAndRecord();
      });
      return button;
    })
  );
}

function paletteName(item) {
  return item.face || "Blank";
}

function renderPalette() {
  els.palette.replaceChildren(
    ...state.colors.palette.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.title = item.name;
      button.setAttribute("aria-label", item.name);
      button.style.background = item.color;
      button.dataset.color = item.color;
      button.dataset.paletteName = paletteName(item);
      button.addEventListener("click", () => {
        state.selectedPaletteName = paletteName(item);
        state.selectedColor = item.color;
        updateSwatches();
        syncPaletteEditor();
      });
      return button;
    })
  );
  updateSwatches();
  syncPaletteEditor();
}

function cloneColors(colors) {
  return {
    ...colors,
    faces: { ...colors.faces },
    palette: colors.palette.map(item => ({ ...item }))
  };
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
  if (!values.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new Error("RGB 값은 0부터 255 사이의 정수로 입력하세요.");
  }
  return `#${values.map(value => value.toString(16).padStart(2, "0")).join("")}`;
}

function syncPaletteEditor(color = state.selectedColor) {
  color = normalizeHexColor(color);
  const [red, green, blue] = hexToRgb(color);
  els.paletteColor.value = color;
  els.paletteHex.value = color;
  els.paletteRed.value = red;
  els.paletteGreen.value = green;
  els.paletteBlue.value = blue;
}

function replaceColor(record, previous, next) {
  if (!record) return record;
  return Object.fromEntries(Object.entries(record).map(([key, color]) => [key, color === previous ? next : color]));
}

function setPaletteColor(name, color) {
  color = normalizeHexColor(color);
  const item = state.colors.palette.find(candidate => paletteName(candidate) === name);
  if (!item) throw new Error("수정할 팔레트 색상을 선택하세요.");
  const previous = item.color;
  item.color = color;
  if (item.face) state.colors.faces[item.face] = color;
  else state.colors.blank = color;
  state.baseColors = replaceColor(state.baseColors, previous, color);
  state.colorLayoutOrigin = replaceColor(state.colorLayoutOrigin, previous, color);
  state.selectedColor = color;
}

function applyPaletteEditor() {
  const color = normalizeHexColor(els.paletteHex.value);
  const rgbColor = rgbToHex(els.paletteRed.value, els.paletteGreen.value, els.paletteBlue.value);
  if (color !== rgbColor) throw new Error("HEX와 RGB 값이 일치하지 않습니다.");
  setPaletteColor(state.selectedPaletteName, color);
  renderPalette();
  updateAndRecord();
  els.status.textContent += `\n${state.selectedPaletteName} 팔레트 색상을 ${color}로 변경했습니다.`;
}

function resetPalette() {
  state.colors = cloneColors(state.defaultColors);
  state.selectedColor = state.selectedPaletteName === "Blank"
    ? state.colors.blank
    : state.colors.faces[state.selectedPaletteName];
  resetSolved();
  renderPalette();
  updateAndRecord();
}

function readPresets() {
  try {
    const value = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter(isValidPreset) : [];
  } catch {
    return [];
  }
}

function writePresets(presets) {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

function isValidPreset(preset) {
  if (!preset || typeof preset.name !== "string" || typeof preset.baseColors !== "object") return false;
  if (typeof preset.notation !== "string" || !["setup", "alg"].includes(preset.mode)) return false;
  if (preset.colors && !isValidColors(preset.colors)) return false;
  if (preset.stickerTexts && (typeof preset.stickerTexts !== "object" ||
    Object.entries(preset.stickerTexts).some(([id, value]) =>
      !state.template.stickers.some((sticker) => sticker.id === id) || typeof value !== "string" || value.length > 20
    ))) return false;
  if (preset.viewpointTokens && !VIEWS.every((view) =>
    Array.isArray(preset.viewpointTokens[view]) && preset.viewpointTokens[view].every(isValidViewpointToken)
  )) return false;
  return state.template.stickers.every((sticker) => typeof preset.baseColors[sticker.id] === "string");
}

function isValidColors(colors) {
  if (!colors || !FACE_ORDER.every(face => /^#[0-9a-f]{6}$/i.test(colors.faces?.[face]))) return false;
  if (!/^#[0-9a-f]{6}$/i.test(colors.blank) || !Array.isArray(colors.palette) || colors.palette.length !== FACE_ORDER.length + 1) return false;
  const names = colors.palette.map(paletteName);
  return [...FACE_ORDER, "Blank"].every(name => names.includes(name))
    && colors.palette.every(item => /^#[0-9a-f]{6}$/i.test(item.color));
}

function isValidViewpointToken(token) {
  return token && ["U", "R", "F", "V"].includes(token.move) && ["", "'"].includes(token.suffix);
}

function renderColorLayoutControls() {
  const header = document.createElement("div");
  header.className = "viewpoint-controls-header";
  const label = document.createElement("span");
  label.textContent = "색 배치 변환";
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "viewpoint-reset-button";
  resetButton.textContent = "색 배치 복원";
  resetButton.addEventListener("click", resetColorLayoutTransform);
  els.colorLayoutReset = resetButton;
  header.append(label, resetButton);

  const buttonGrid = document.createElement("div");
  buttonGrid.className = "viewpoint-button-grid";
  buttonGrid.replaceChildren(...VIEWPOINT_TOKENS.map((token) => {
    const button = document.createElement("button");
    button.type = "button";
    if (token.move === "V") {
      button.className = "viewpoint-vertex-button";
      button.textContent = "꼭짓점 ↻90°";
      button.title = "정면 꼭짓점 기준으로 색 배치를 시계방향 90° 회전";
    } else {
      button.textContent = formatViewpointToken(token);
      button.title = `${token.move}면 수직축으로 색 배치를 ${token.suffix ? "반시계" : "시계"} 방향 120° 회전`;
    }
    button.addEventListener("click", () => applyColorLayoutTransform(token));
    return button;
  }));
  els.colorLayoutControls.replaceChildren(header, buttonGrid);
}

function applyColorLayoutTransform(token) {
  if (!state.colorLayoutOrigin) state.colorLayoutOrigin = { ...state.baseColors };
  state.baseColors = applyOrientationTokens(state.baseColors, [token]);
  updateAndRecord();
}

function resetColorLayoutTransform() {
  if (!state.colorLayoutOrigin) return;
  state.baseColors = { ...state.colorLayoutOrigin };
  state.colorLayoutOrigin = null;
  updateAndRecord();
}

function formatViewpointToken(token) {
  if (token.move === "V") return token.suffix ? "꼭짓점↺90°" : "꼭짓점↻90°";
  return `{${token.move}o${token.suffix}}`;
}

function physicalViewpointTokens(view, tokens) {
  if (view !== "eif") return tokens;
  return tokens.map((token) => ({
    ...token,
    move: EIF_VIEWPOINT_MOVE_MAP[token.move]
  }));
}

function renderPresetOptions() {
  const presets = readPresets();
  if (!presets.length) {
    const empty = document.createElement("p");
    empty.className = "preset-empty";
    empty.textContent = "저장된 프리셋 없음";
    els.presetList.replaceChildren(empty);
    updatePresetEditState();
    return;
  }
  els.presetList.replaceChildren(...presets.map((preset) => {
    const item = document.createElement("div");
    item.className = "preset-item";
    item.setAttribute("role", "listitem");

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "preset-load-button";
    const active = preset.name === state.activePresetName;
    loadButton.classList.toggle("active", active);

    const name = document.createElement("span");
    name.className = "preset-item-name";
    name.textContent = preset.name;
    const action = document.createElement("span");
    action.className = "preset-item-action";
    action.textContent = active ? "수정 중" : "불러오기";
    loadButton.append(name, action);
    loadButton.addEventListener("click", () => loadPreset(preset.name));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "preset-delete-button";
    deleteButton.textContent = "삭제";
    deleteButton.setAttribute("aria-label", `${preset.name} 프리셋 삭제`);
    deleteButton.addEventListener("click", () => deletePreset(preset.name));

    item.append(loadButton, deleteButton);
    return item;
  }));
  updatePresetEditState();
}

function updatePresetEditState() {
  const editing = Boolean(state.activePresetName && els.presetName.value.trim() === state.activePresetName);
  els.savePreset.textContent = editing ? "변경 저장" : "저장";
  els.newPreset.disabled = !state.activePresetName && !els.presetName.value.trim();
}

function startNewPreset() {
  state.activePresetName = "";
  els.presetName.value = "";
  renderPresetOptions();
  els.presetName.focus();
  els.status.textContent = "새 프리셋 이름을 입력해 주세요.";
}

function syncStickerTextInput() {
  els.stickerTextInput.value = state.stickerTexts[els.stickerTextTarget.value] || "";
}

function savePreset() {
  const name = els.presetName.value.trim();
  if (!name) {
    els.status.textContent = "프리셋 이름을 입력해 주세요.";
    els.presetName.focus();
    return;
  }
  const preset = {
    name,
    baseColors: { ...state.baseColors },
    notation: els.notation.value,
    mode: els.mode.value,
    showBackFaces: els.showBackFaces.checked,
    showLabels: els.showLabels.checked,
    stickerTexts: { ...state.stickerTexts },
    showStickerText: els.showStickerText.checked,
    selectedColor: state.selectedColor,
    selectedPaletteName: state.selectedPaletteName,
    colors: cloneColors(state.colors),
    viewpointTokens: Object.fromEntries(VIEWS.map((view) => [
      view,
      state.viewpointTokens[view].map((token) => ({ ...token }))
    ]))
  };
  try {
    const presets = readPresets();
    const existingIndex = presets.findIndex((item) => item.name === name);
    if (existingIndex >= 0) presets[existingIndex] = preset;
    else presets.push(preset);
    writePresets(presets);
    const updated = state.activePresetName === name;
    state.activePresetName = name;
    renderPresetOptions();
    els.status.textContent = `프리셋 “${name}”을 ${updated ? "변경 저장" : "저장"}했습니다.`;
  } catch (error) {
    els.status.textContent = `프리셋 저장 실패: ${error.message}`;
  }
}

function loadPreset(name) {
  const preset = readPresets().find((item) => item.name === name);
  if (!preset) return;
  state.baseColors = { ...preset.baseColors };
  state.colorLayoutOrigin = null;
  if (preset.colors) state.colors = cloneColors(preset.colors);
  state.selectedPaletteName = [...FACE_ORDER, "Blank"].includes(preset.selectedPaletteName)
    ? preset.selectedPaletteName
    : state.colors.palette.find(item => item.color === preset.selectedColor)?.face || "Blank";
  state.selectedColor = state.selectedPaletteName === "Blank"
    ? state.colors.blank
    : state.colors.faces[state.selectedPaletteName];
  els.notation.value = preset.notation;
  els.mode.value = preset.mode;
  els.showBackFaces.checked = preset.showBackFaces !== false;
  els.showLabels.checked = Boolean(preset.showLabels);
  state.stickerTexts = { ...preset.stickerTexts };
  els.showStickerText.checked = preset.showStickerText !== false;
  syncStickerTextInput();
  state.viewpointTokens = Object.fromEntries(VIEWS.map((view) => [
    view,
    (preset.viewpointTokens?.[view] || []).map((token) => ({ ...token }))
  ]));
  state.activePresetName = preset.name;
  els.presetName.value = preset.name;
  renderPalette();
  updateAndRecord();
  renderPresetOptions();
  els.status.textContent += `\n프리셋 “${preset.name}”을 불러왔습니다.`;
}

function deletePreset(name) {
  if (!window.confirm(`프리셋 “${name}”을 삭제하시겠습니까?`)) return;
  try {
    writePresets(readPresets().filter((preset) => preset.name !== name));
    if (state.activePresetName === name) state.activePresetName = "";
    if (els.presetName.value.trim() === name) els.presetName.value = "";
    renderPresetOptions();
    els.status.textContent = `프리셋 “${name}”을 삭제했습니다.`;
  } catch (error) {
    els.status.textContent = `프리셋 삭제 실패: ${error.message}`;
  }
}

function updateSwatches() {
  for (const button of els.palette.querySelectorAll(".swatch")) {
    const active = button.dataset.paletteName === state.selectedPaletteName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function resetSolved() {
  state.colorLayoutOrigin = null;
  state.baseColors = Object.fromEntries(state.template.stickers.map((sticker) => [sticker.id, state.colors.faces[sticker.face]]));
}

function resetBlank() {
  state.colorLayoutOrigin = null;
  state.baseColors = Object.fromEntries(state.template.stickers.map((sticker) => [sticker.id, state.colors.blank]));
}

function captureImageState() {
  return {
    baseColors: { ...state.baseColors },
    colorLayoutOrigin: state.colorLayoutOrigin ? { ...state.colorLayoutOrigin } : null,
    notation: els.notation.value,
    mode: els.mode.value,
    showBackFaces: els.showBackFaces.checked,
    showLabels: els.showLabels.checked,
    stickerTexts: { ...state.stickerTexts },
    showStickerText: els.showStickerText.checked,
    colors: cloneColors(state.colors),
    selectedPaletteName: state.selectedPaletteName,
    viewpointTokens: Object.fromEntries(VIEWS.map((view) => [
      view,
      state.viewpointTokens[view].map((token) => ({ ...token }))
    ]))
  };
}

function applyImageState(snapshot) {
  state.baseColors = { ...snapshot.baseColors };
  state.colorLayoutOrigin = snapshot.colorLayoutOrigin ? { ...snapshot.colorLayoutOrigin } : null;
  if (snapshot.colors) state.colors = cloneColors(snapshot.colors);
  state.selectedPaletteName = snapshot.selectedPaletteName || state.selectedPaletteName;
  state.selectedColor = state.selectedPaletteName === "Blank"
    ? state.colors.blank
    : state.colors.faces[state.selectedPaletteName];
  els.notation.value = snapshot.notation;
  els.mode.value = snapshot.mode;
  els.showBackFaces.checked = snapshot.showBackFaces !== false;
  els.showLabels.checked = snapshot.showLabels;
  state.stickerTexts = { ...snapshot.stickerTexts };
  els.showStickerText.checked = snapshot.showStickerText !== false;
  syncStickerTextInput();
  state.viewpointTokens = Object.fromEntries(VIEWS.map((view) => [
    view,
    snapshot.viewpointTokens[view].map((token) => ({ ...token }))
  ]));
  renderPalette();
}

function snapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function finishHistoryGroup() {
  if (history.groupTimer) clearTimeout(history.groupTimer);
  history.groupTimer = null;
  history.activeGroup = null;
}

function recordHistoryChange(group = null) {
  const next = captureImageState();
  if (!history.current) {
    history.current = next;
    updateHistoryButtons();
    return;
  }
  if (snapshotsEqual(history.current, next)) return;
  if (group && history.activeGroup === group) {
    history.current = next;
  } else {
    finishHistoryGroup();
    history.undoStack.push(history.current);
    if (history.undoStack.length > HISTORY_LIMIT) history.undoStack.shift();
    history.redoStack = [];
    history.current = next;
    history.activeGroup = group;
  }
  if (group) {
    if (history.groupTimer) clearTimeout(history.groupTimer);
    history.groupTimer = setTimeout(finishHistoryGroup, 600);
  }
  updateHistoryButtons();
}

function updateAndRecord(group = null) {
  update();
  recordHistoryChange(group);
}

function undo() {
  finishHistoryGroup();
  if (!history.undoStack.length) return;
  history.redoStack.push(history.current);
  history.current = history.undoStack.pop();
  applyImageState(history.current);
  update();
  updateHistoryButtons();
}

function redo() {
  finishHistoryGroup();
  if (!history.redoStack.length) return;
  history.undoStack.push(history.current);
  history.current = history.redoStack.pop();
  applyImageState(history.current);
  update();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  els.undo.disabled = history.undoStack.length === 0;
  els.redo.disabled = history.redoStack.length === 0;
}

function handleHistoryShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if ([els.presetName, els.saveFilename, els.batchJson].includes(event.target)) return;
  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (key === "y") {
    event.preventDefault();
    redo();
  }
}

function update() {
  const errorLabel = document.querySelector("#notation-error");
  errorLabel.hidden = true;
  errorLabel.textContent = "";
  try {
    const parsed = parseNotation(els.notation.value);
    const tokens = els.mode.value === "alg" ? invertTokens(parsed) : parsed;
    state.lastTokens = tokens;
    state.valid = true;
    const colors = applyTokens(state.baseColors, tokens);
    const sources = applyTokens(identityState(), tokens);
    for (const view of VIEWS) {
      const viewpointTokens = physicalViewpointTokens(view, state.viewpointTokens[view]);
      state.displayedSources[view] = applyOrientationTokens(sources, viewpointTokens);
      renderPreview(els[view], view, applyOrientationTokens(colors, viewpointTokens));
    }
    els.status.textContent = [
      els.mode.value === "alg" ? "Alg · 입력한 공식으로 풀리는 케이스" : "Setup · 입력한 회전을 적용한 상태",
      `적용 회전: ${tokens.map(formatToken).join(" ") || "없음 (완성 상태)"}`,
      ...VIEWS.map((view) => `${view.toUpperCase()} 시점: ${state.viewpointTokens[view].map(formatViewpointToken).join(" ") || "기본"}`)
    ].join("\n");
  } catch (error) {
    state.valid = false;
    for (const view of VIEWS) {
      const viewpointTokens = physicalViewpointTokens(view, state.viewpointTokens[view]);
      state.displayedSources[view] = applyOrientationTokens(identityState(), viewpointTokens);
      renderPreview(els[view], view, applyOrientationTokens(state.baseColors, viewpointTokens));
    }
    errorLabel.textContent = error.message;
    errorLabel.hidden = false;
    els.status.textContent = error.message;
  }
  els.notation.setAttribute("aria-invalid", String(!state.valid));
  document.querySelector("#clear-notation").disabled = !els.notation.value;
  for (const view of VIEWS) {
    document.querySelector(`#download-${view}-svg`).disabled = !state.valid || state.saving;
    document.querySelector(`#download-${view}-png`).disabled = !state.valid || state.saving;
  }
  for (const view of VIEWS) els.viewpointReset[view].disabled = state.viewpointTokens[view].length === 0;
  els.colorLayoutReset.disabled = !state.colorLayoutOrigin;
  if (state.batchItems.length) renderBatchPreviewCards();
  updateSaveButtons();
  simulatorRefresh();
}

function renderPreview(container, view, colors, options = {}) {
  const template = view === "eif" ? state.eifTemplate : state.template;
  const showBackFaces = options.showBackFaces ?? els.showBackFaces.checked;
  const showLabels = options.showLabels ?? els.showLabels.checked;
  const interactive = options.interactive !== false;
  const sources = options.sources || state.displayedSources[view];
  const { x, y, width, height } = template.viewBox;
  const padding = template.stroke.width * 2;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `${x - padding} ${y - padding} ${width + padding * 2} ${height + padding * 2}`);
  svg.setAttribute("data-view", view);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${view.toUpperCase()} FTO preview`);

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", x);
  bg.setAttribute("y", y);
  bg.setAttribute("width", width);
  bg.setAttribute("height", height);
  bg.setAttribute("fill", "transparent");
  svg.append(bg);

  const stickers = orderedStickers(template, view);
  const rearFaces = new Set(template.backPlate?.rearFaces || []);
  const body = document.createElementNS("http://www.w3.org/2000/svg", "g");
  body.setAttribute("aria-hidden", "true");
  body.setAttribute("pointer-events", "none");
  const bodyFaces = (template.backPlate?.bodyFaces || DRAW_ORDER[view] || FACE_ORDER)
    .filter((face) => showBackFaces || !rearFaces.has(face));
  for (const face of bodyFaces) {
    const points = stickers
      .filter((sticker) => sticker.face === face)
      .flatMap((sticker) => pathPoints(sticker.path));
    const hull = convexHull(points);
    if (hull.length < 3) continue;
    const surface = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    surface.setAttribute("points", hull.map(([pointX, pointY]) => `${pointX},${pointY}`).join(" "));
    surface.setAttribute("fill", state.colors.line || template.stroke.color);
    surface.setAttribute("stroke", state.colors.line || template.stroke.color);
    surface.setAttribute("stroke-width", template.stroke.width);
    surface.setAttribute("stroke-linejoin", template.stroke.lineJoin);
    body.append(surface);
  }
  svg.append(body);

  if (showBackFaces) {
    for (const sticker of stickers.filter((item) => rearFaces.has(item.face))) {
      appendSticker(svg, sticker, template, colors, view, { interactive, showLabels, sources });
    }
  }
  if (template.backPlate) svg.append(renderBackPlate(template));
  for (const sticker of stickers.filter((item) => !rearFaces.has(item.face))) {
    appendSticker(svg, sticker, template, colors, view, { interactive, showLabels, sources });
  }
  container.replaceChildren(svg);
}

function renderBackPlate(template) {
  const plate = document.createElementNS("http://www.w3.org/2000/svg", template.backPlate.type);
  if (template.backPlate.type === "rect") {
    for (const attribute of ["x", "y", "width", "height"]) {
      plate.setAttribute(attribute, template.backPlate[attribute]);
    }
  } else {
    plate.setAttribute("points", template.backPlate.points.map((point) => point.join(",")).join(" "));
  }
  plate.setAttribute("fill", state.colors.line || template.stroke.color);
  plate.setAttribute("stroke", state.colors.line || template.stroke.color);
  plate.setAttribute("stroke-width", template.stroke.width);
  plate.setAttribute("stroke-linejoin", template.stroke.lineJoin);
  plate.setAttribute("pointer-events", "none");
  plate.setAttribute("aria-hidden", "true");
  return plate;
}

function appendSticker(svg, sticker, template, colors, view, options = {}) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "sticker");
  path.setAttribute("d", sticker.path);
  path.setAttribute("fill", colors[sticker.id] || state.colors.faces[sticker.face] || state.colors.blank);
  path.setAttribute("stroke", template.stroke.color);
  path.setAttribute("stroke-width", template.stroke.width);
  path.setAttribute("stroke-linejoin", template.stroke.lineJoin);
  path.setAttribute("stroke-linecap", template.stroke.lineCap);
  path.dataset.sticker = sticker.id;
  if (options.interactive !== false) {
    path.addEventListener("click", () => {
      if (!state.valid) return;
      state.colorLayoutOrigin = null;
      state.baseColors[state.displayedSources[view][sticker.id]] = state.selectedColor;
      updateAndRecord();
    });
  }
  svg.append(path);
  const customText = els.showStickerText.checked && state.stickerTexts[options.sources[sticker.id]];
  if (customText) svg.append(renderStickerLabel(sticker, customText));
  else if (options.showLabels ?? els.showLabels.checked) svg.append(renderStickerLabel(sticker));
}

function pathPoints(path) {
  const values = path.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
  const points = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push([values[index], values[index + 1]]);
  }
  return points;
}

function convexHull(points) {
  const unique = [...new Map(points.map((point) => [point.join(","), point])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length < 3) return unique;
  const cross = (origin, a, b) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const half = (input) => {
    const result = [];
    for (const point of input) {
      while (result.length >= 2 && cross(result.at(-2), result.at(-1), point) <= 0) result.pop();
      result.push(point);
    }
    return result;
  };
  return [...half(unique).slice(0, -1), ...half([...unique].reverse()).slice(0, -1)];
}

function orderedStickers(template, view) {
  const order = DRAW_ORDER[view] || FACE_ORDER;
  const rank = Object.fromEntries(order.map((face, index) => [face, index]));
  return [...template.stickers].sort((a, b) => {
    const faceDiff = (rank[a.face] ?? order.length) - (rank[b.face] ?? order.length);
    if (faceDiff) return faceDiff;
    return (a.drawIndex ?? 0) - (b.drawIndex ?? 0);
  });
}

function renderStickerLabel(sticker, value = sticker.id) {
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("class", "sticker-label");
  label.setAttribute("x", sticker.center.x);
  label.setAttribute("y", sticker.center.y);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "central");
  label.setAttribute("fill", "#111");
  label.setAttribute("stroke", "#fff");
  label.setAttribute("stroke-width", "0.35");
  label.setAttribute("paint-order", "stroke");
  const fontSize = value === sticker.id ? 3.2 : Math.min(4.5, sticker.bbox.h * 0.35);
  label.setAttribute("font-size", fontSize);
  label.setAttribute("font-weight", "800");
  label.setAttribute("font-family", "Arial, sans-serif");
  if (value.length * fontSize > sticker.bbox.w * 0.8) {
    label.setAttribute("textLength", sticker.bbox.w * 0.8);
    label.setAttribute("lengthAdjust", "spacingAndGlyphs");
  }
  label.textContent = value;
  return label;
}

function invalidateBatch() {
  if (state.batchSaving) requestBatchStop();
  state.batchItems = [];
  state.batchPreparedItems = [];
  els.batchPreviewList.replaceChildren();
  els.batchJson.removeAttribute("aria-invalid");
  els.batchStatus.textContent = "입력이 변경되었습니다. 미리보기를 다시 생성하세요.";
  updateSaveButtons();
}

async function loadBatchJsonFile() {
  const [file] = els.batchJsonFile.files;
  if (!file) return;
  els.batchJson.value = await file.text();
  els.batchJsonFile.value = "";
  loadBatchPreviews();
}

function loadBatchPreviews() {
  try {
    state.batchItems = parseBatchJson(els.batchJson.value);
    renderBatchPreviewCards();
  } catch (error) {
    state.batchItems = [];
    state.batchPreparedItems = [];
    els.batchPreviewList.replaceChildren();
    els.saveBatch.disabled = true;
    els.batchJson.setAttribute("aria-invalid", "true");
    els.batchStatus.textContent = error.message;
  }
}

function parseBatchJson(text) {
  if (!text.trim()) throw new Error("JSON을 입력하거나 파일을 불러와 주세요.");
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 문법 오류: ${error.message}`);
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("JSON 최상위 값은 하나 이상의 항목이 있는 배열이어야 합니다.");
  }
  return value.map((item, index) => {
    const fallbackName = `항목 ${index + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { index, filename: fallbackName, scramble: "", error: "객체 형식이어야 합니다." };
    }
    const filename = typeof item.filename === "string" ? item.filename.trim() : "";
    const scramble = typeof item.scramble === "string" ? item.scramble : "";
    try {
      validateFilenameBase(filename);
      if (typeof item.scramble !== "string") throw new Error("scramble은 문자열이어야 합니다.");
      return { index, filename, scramble };
    } catch (error) {
      return { index, filename: filename || fallbackName, scramble, error: error.message };
    }
  });
}

function prepareBatchItem(item) {
  if (item.error) return item;
  try {
    const parsed = parseNotation(item.scramble);
    return {
      ...item,
      tokens: els.mode.value === "alg" ? invertTokens(parsed) : parsed,
      selected: true,
      cancelled: false,
      queueStatus: "대기"
    };
  } catch (error) {
    return { ...item, error: error.message };
  }
}

function renderBatchPreviewCards() {
  state.batchPreparedItems = state.batchItems.map(prepareBatchItem);
  els.batchPreviewList.replaceChildren(...state.batchPreparedItems.map(renderBatchCard));
  updateBatchStatus();
}

function updateBatchStatus() {
  const validCount = state.batchPreparedItems.filter((item) => !item.error).length;
  const selectedCount = state.batchPreparedItems.filter((item) => !item.error && item.selected && !item.cancelled).length;
  const errorCount = state.batchPreparedItems.length - validCount;
  const views = selectedViews(state.viewModes.batch).map((view) => view.toUpperCase()).join("·");
  els.batchJson.setAttribute("aria-invalid", String(errorCount > 0));
  els.saveBatch.disabled = state.saving || state.batchSaving || selectedCount === 0;
  els.batchStatus.textContent = [
    `${state.batchPreparedItems.length}개 항목 중 ${selectedCount}/${validCount}개 선택`,
    errorCount ? `${errorCount}개 항목에 오류가 있습니다. 오류 항목은 저장에서 제외됩니다.` : `${views} 보기 이미지를 저장합니다.`
  ].join("\n");
}

function renderBatchCard(item) {
  const card = document.createElement("article");
  card.className = "batch-card";

  const header = document.createElement("header");
  header.className = "batch-card-header";
  const heading = document.createElement("div");
  heading.className = "batch-card-heading";
  const title = document.createElement("h3");
  title.textContent = `${item.index + 1}. ${item.filename}`;
  const notation = document.createElement("code");
  notation.textContent = item.scramble || "(완성 상태)";
  heading.append(title, notation);
  header.append(heading);
  card.append(header);

  if (item.error) {
    const error = document.createElement("p");
    error.className = "batch-card-error";
    error.textContent = item.error;
    card.append(error);
    return card;
  }

  const queueControls = document.createElement("div");
  queueControls.className = "batch-queue-controls";
  const selectionLabel = document.createElement("label");
  const selection = document.createElement("input");
  selection.type = "checkbox";
  selection.checked = item.selected;
  selection.disabled = state.batchSaving || item.cancelled;
  selection.addEventListener("change", () => {
    item.selected = selection.checked;
    item.queueStatus = selection.checked ? "대기" : "제외";
    updateBatchStatus();
    syncBatchQueueControls();
  });
  selectionLabel.append(selection, document.createTextNode("선택"));
  const queueStatus = document.createElement("span");
  queueStatus.className = "batch-queue-status";
  queueStatus.dataset.batchStatus = String(item.index);
  queueStatus.textContent = item.queueStatus;
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.batchCancel = String(item.index);
  cancelButton.textContent = "취소";
  cancelButton.disabled = item.cancelled || item.queueStatus === "완료";
  cancelButton.addEventListener("click", () => cancelBatchItem(item));
  queueControls.append(selectionLabel, queueStatus, cancelButton);
  header.append(queueControls);

  const views = document.createElement("div");
  views.className = "batch-card-views";
  for (const view of VIEWS) {
    const section = document.createElement("section");
    section.className = "batch-view";
    section.dataset.view = view;
    section.hidden = !isViewVisible(state.viewModes.batch, view);
    const viewHeader = document.createElement("div");
    viewHeader.className = "batch-view-header";
    const label = document.createElement("span");
    label.textContent = view.toUpperCase();
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "저장";
    saveButton.disabled = state.saving;
    saveButton.addEventListener("click", () => {
      saveAction(() => saveBatchItemImage(item, view)).catch(error => { els.batchStatus.textContent = `저장 실패: ${error.message}`; });
    });
    viewHeader.append(label, saveButton);
    const preview = document.createElement("div");
    preview.className = "batch-preview";
    renderBatchItemPreview(preview, item, view);
    section.append(viewHeader, preview);
    views.append(section);
  }
  card.append(views);
  return card;
}

function syncBatchQueueControls() {
  for (const item of state.batchPreparedItems) {
    const status = els.batchPreviewList.querySelector(`[data-batch-status="${item.index}"]`);
    if (status) status.textContent = item.queueStatus || "대기";
    const cancel = els.batchPreviewList.querySelector(`[data-batch-cancel="${item.index}"]`);
    if (cancel) cancel.disabled = item.cancelled || item.queueStatus === "완료";
  }
}

function cancelBatchItem(item) {
  item.cancelled = true;
  item.selected = false;
  item.queueStatus = item.queueStatus === "생성 중" ? "취소 대기" : "취소됨";
  syncBatchQueueControls();
  updateBatchStatus();
}

function requestBatchStop() {
  if (!state.batchSaving) return;
  state.batchStopRequested = true;
  els.stopBatch.disabled = true;
  els.stopBatch.textContent = "중단 요청됨";
  els.batchStatus.textContent = "현재 이미지 처리를 마친 뒤 생성을 중단합니다.";
}

function renderBatchItemPreview(container, item, view) {
  const colors = applyTokens(state.baseColors, item.tokens);
  const viewpointTokens = physicalViewpointTokens(view, state.viewpointTokens[view]);
  const sources = applyOrientationTokens(applyTokens(identityState(), item.tokens), viewpointTokens);
  renderPreview(container, view, applyOrientationTokens(colors, viewpointTokens), { interactive: false, sources });
}

function buildBatchSvg(item, view) {
  const container = document.createElement("div");
  renderBatchItemPreview(container, item, view);
  return container.querySelector("svg");
}

async function saveBatchItemImage(item, view, feedback = true) {
  const extension = els.batchFormat.value;
  const svg = buildBatchSvg(item, view);
  const blob = extension === "png" ? await svgToPngBlob(svg) : svgToBlob(svg);
  const filename = `${item.filename}-${view}.${extension}`;
  await saveNamedBlob(blob, filename, feedback);
  if (feedback) els.batchStatus.textContent = `“${filename}” 저장을 시작했습니다.`;
}

function updateSaveButtons() {
  for (const view of VIEWS) {
    document.querySelector(`#download-${view}-svg`).disabled = !state.valid || state.saving;
    document.querySelector(`#download-${view}-png`).disabled = !state.valid || state.saving;
  }
  els.batchPreviewList.querySelectorAll(".batch-view-header button").forEach(button => { button.disabled = state.saving; });
  els.saveBatch.disabled = state.saving || !state.batchPreparedItems.some(item => !item.error && item.selected && !item.cancelled);
  els.saveBatch.textContent = state.batchSaving ? "생성 중…" : "선택 항목 저장";
  els.stopBatch.disabled = !state.batchSaving || state.batchStopRequested;
  els.stopBatch.textContent = state.batchStopRequested ? "중단 요청됨" : "생성 중단";
  els.selectSaveDirectory.disabled = state.saving || typeof window.showDirectoryPicker !== "function";
  els.selectBatchSaveDirectory.disabled = els.selectSaveDirectory.disabled;
}

async function saveAction(action) {
  if (state.saving) return;
  state.saving = true;
  updateSaveButtons();
  showSaveFeedback("저장 중…", "");
  try { await action(); }
  finally { state.saving = false; updateSaveButtons(); }
}

async function saveAllBatchImages() {
  const items = state.batchPreparedItems.filter((item) => !item.error && item.selected && !item.cancelled);
  if (!items.length || state.batchSaving) return;
  state.batchSaving = true;
  state.batchStopRequested = false;
  updateSaveButtons();
  const views = selectedViews(state.viewModes.batch);
  const total = items.length * views.length;
  const extension = els.batchFormat.value;
  let completed = 0;
  try {
    for (const item of items) {
      if (state.batchStopRequested) break;
      if (item.cancelled) continue;
      item.queueStatus = "생성 중";
      syncBatchQueueControls();
      let itemCompleted = 0;
      for (const view of views) {
        if (state.batchStopRequested || item.cancelled) break;
        const svg = buildBatchSvg(item, view);
        const blob = extension === "png" ? await svgToPngBlob(svg) : svgToBlob(svg);
        if (state.batchStopRequested || item.cancelled) break;
        await saveNamedBlob(blob, `${item.filename}-${view}.${extension}`, false);
        completed += 1;
        itemCompleted += 1;
        els.batchStatus.textContent = `선택 항목 생성 중: ${completed}/${total}`;
        showSaveFeedback("저장 중", `${completed}/${total}`);
      }
      item.queueStatus = itemCompleted === views.length ? "완료" : itemCompleted ? "일부 완료" : "취소됨";
      syncBatchQueueControls();
    }
    for (const item of items) {
      if (item.queueStatus === "대기" || item.queueStatus === "취소 대기") item.queueStatus = "취소됨";
    }
    syncBatchQueueControls();
    const stopped = state.batchStopRequested || completed < total;
    const result = state.saveDirectoryHandle ? "저장" : "다운로드 요청";
    els.batchStatus.textContent = stopped ? `${completed}/${total}개 이미지 처리 후 중단했습니다.` : `${completed}개 이미지 ${result} 완료`;
    showSaveFeedback(stopped ? "생성 중단" : `${result} 완료`, `${completed}/${total}개 이미지`);
  } finally {
    state.batchSaving = false;
    state.batchStopRequested = false;
    updateSaveButtons();
  }
}

function currentSvg(view) {
  if (!state.valid) throw new Error("입력한 회전기호를 확인해 주세요.");
  return document.querySelector(`#${view}-preview svg`).cloneNode(true);
}

async function downloadSvg(view) {
  const svg = currentSvg(view);
  await saveBlob(svgToBlob(svg), view, "svg");
}

async function downloadPng(view) {
  const svg = currentSvg(view);
  await saveBlob(await svgToPngBlob(svg), view, "png");
}

function svgToBlob(svg) {
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const text = new XMLSerializer().serializeToString(svg);
  return new Blob([text], { type: "image/svg+xml" });
}

async function svgToPngBlob(svg) {
  const text = await svgToBlob(svg).text();
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
    const canvas = document.createElement("canvas");
    const { width, height } = svg.viewBox.baseVal;
    const scale = 1600 / Math.max(width, height);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG를 만들지 못했습니다.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readSaveFilename() {
  try {
    return localStorage.getItem(SAVE_FILENAME_STORAGE_KEY) || "fto";
  } catch {
    return "fto";
  }
}

function updateSaveDirectorySupport() {
  const supported = typeof window.showDirectoryPicker === "function";
  els.selectSaveDirectory.disabled = !supported;
  els.selectBatchSaveDirectory.disabled = !supported;
  if (!supported) {
    els.selectSaveDirectory.title = "이 브라우저에서는 저장 위치 선택을 지원하지 않습니다.";
    els.selectBatchSaveDirectory.title = "이 브라우저에서는 저장 위치 선택을 지원하지 않습니다.";
    els.saveDirectoryName.textContent = "브라우저 기본 다운로드 폴더 (위치 선택 미지원)";
    els.batchSaveDirectoryName.textContent = "브라우저 기본 다운로드 폴더 (위치 선택 미지원)";
  }
}

async function selectSaveDirectory() {
  if (typeof window.showDirectoryPicker !== "function") return;
  try {
    state.saveDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    els.saveDirectoryName.textContent = state.saveDirectoryHandle.name;
    els.batchSaveDirectoryName.textContent = state.saveDirectoryHandle.name;
    els.status.textContent = `저장 위치를 “${state.saveDirectoryHandle.name}” 폴더로 설정했습니다.`;
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  }
}

function buildSaveFilename(view, extension) {
  const base = els.saveFilename.value.trim();
  validateFilenameBase(base);
  return `${base}-${view}.${extension}`;
}

function validateFilenameBase(base) {
  if (!base) throw new Error("filename을 입력해 주세요.");
  if (base.length > 80) throw new Error("filename은 80자 이하여야 합니다.");
  if (/[<>:\"/\\|?*\u0000-\u001F]/.test(base) || base === "." || base === "..") {
    throw new Error("filename에 사용할 수 없는 문자가 있습니다.");
  }
}

async function saveBlob(blob, view, extension) {
  const filename = buildSaveFilename(view, extension);
  await saveNamedBlob(blob, filename);
}

async function saveNamedBlob(blob, filename, feedback = true) {
  if (!state.saveDirectoryHandle) {
    downloadBlob(blob, filename);
    if (feedback) {
      els.status.textContent = `“${filename}” 다운로드를 시작했습니다.`;
      showSaveFeedback("다운로드 시작", filename);
    }
    return;
  }
  const { handle, filename: availableName } = await createUniqueFileHandle(state.saveDirectoryHandle, filename);
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  if (feedback) {
    els.status.textContent = `“${state.saveDirectoryHandle.name}” 폴더에 “${availableName}”을 저장했습니다.`;
    showSaveFeedback("저장 완료", availableName);
  }
}

function showSaveFeedback(title, filename) {
  if (state.saveFeedbackTimer) clearTimeout(state.saveFeedbackTimer);
  if (state.saveFeedbackHideTimer) clearTimeout(state.saveFeedbackHideTimer);
  els.saveToast.textContent = `${title}\n${filename}`;
  els.saveToast.hidden = false;
  requestAnimationFrame(() => els.saveToast.classList.add("visible"));
  state.saveFeedbackTimer = setTimeout(() => {
    els.saveToast.classList.remove("visible");
    state.saveFeedbackHideTimer = setTimeout(() => { els.saveToast.hidden = true; }, 180);
  }, 2200);
}

async function createUniqueFileHandle(directory, filename) {
  const dotIndex = filename.lastIndexOf(".");
  const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : "";
  for (let index = 1; index <= 9999; index += 1) {
    const candidate = index === 1 ? filename : `${stem} (${index})${extension}`;
    try {
      await directory.getFileHandle(candidate);
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
      return { handle: await directory.getFileHandle(candidate, { create: true }), filename: candidate };
    }
  }
  throw new Error("사용 가능한 파일명을 찾지 못했습니다.");
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
