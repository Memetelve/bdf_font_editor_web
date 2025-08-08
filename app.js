// app.js
// App UI, editor logic, preview rendering.

import {
  parseBdf,
  serializeBdf,
  drawGlyphGrid,
  renderGlyphPreviewTo,
  createEmptyFont,
  createBlankGlyph,
} from "./bdf.js";

const els = {
  fileInput: byId("fileInput"),
  exportBtn: byId("exportBtn"),
  newFontBtn: byId("newFontBtn"),

  fontName: byId("fontName"),
  sizePt: byId("sizePt"),
  sizeX: byId("sizeX"),
  sizeY: byId("sizeY"),
  bbxW: byId("bbxW"),
  bbxH: byId("bbxH"),
  bbxX: byId("bbxX"),
  bbxY: byId("bbxY"),

  addGlyphBtn: byId("addGlyphBtn"),
  delGlyphBtn: byId("delGlyphBtn"),
  glyphList: byId("glyphList"),

  gName: byId("gName"),
  gEnc: byId("gEnc"),
  gDWX: byId("gDWX"),
  gDWY: byId("gDWY"),
  gBW: byId("gBW"),
  gBH: byId("gBH"),
  gBX: byId("gBX"),
  gBY: byId("gBY"),

  clearGlyphBtn: byId("clearGlyphBtn"),
  invertGlyphBtn: byId("invertGlyphBtn"),
  zoomRange: byId("zoomRange"),
  showGridChk: byId("showGridChk"),
  showAxesChk: byId("showAxesChk"),

  glyphCanvas: byId("glyphCanvas"),

  previewText: byId("previewText"),
  previewScale: byId("previewScale"),
  previewCanvas: byId("previewCanvas"),
};

const state = {
  font: createEmptyFont(),
  selectedGlyphIndex: 0,
  zoom: 22,
  showGrid: true,
  showAxes: true,
  dragging: false,
  dragSet: true,
};

init();

function init() {
  bindEvents();
  refreshAll();
}

function bindEvents() {
  els.fileInput.addEventListener("change", onLoadFile);
  els.exportBtn.addEventListener("click", onExport);
  els.newFontBtn.addEventListener("click", onNewFont);

  // Font header controls
  els.fontName.addEventListener("input", () => {
    state.font.name = els.fontName.value;
  });
  els.sizePt.addEventListener("change", () => {
    state.font.size.point = toInt(els.sizePt.value, 16);
    refreshPreview();
  });
  els.sizeX.addEventListener("change", () => {
    state.font.size.xres = toInt(els.sizeX.value, 75);
  });
  els.sizeY.addEventListener("change", () => {
    state.font.size.yres = toInt(els.sizeY.value, 75);
  });
  els.bbxW.addEventListener("change", onFontBBXChange);
  els.bbxH.addEventListener("change", onFontBBXChange);
  els.bbxX.addEventListener("change", onFontBBXChange);
  els.bbxY.addEventListener("change", onFontBBXChange);

  // Glyph controls
  els.addGlyphBtn.addEventListener("click", onAddGlyph);
  els.delGlyphBtn.addEventListener("click", onDelGlyph);

  els.gName.addEventListener("input", () => {
    const g = currentGlyph();
    if (!g) return;
    g.name = els.gName.value;
    refreshGlyphList();
  });
  els.gEnc.addEventListener("change", () => {
    const g = currentGlyph();
    if (!g) return;
    g.encoding = toInt(els.gEnc.value, -1);
    refreshGlyphList();
  });
  els.gDWX.addEventListener("change", () => {
    const g = currentGlyph();
    if (!g) return;
    g.dWidthX = toInt(els.gDWX.value, g.dWidthX);
    refreshEditor();
    refreshPreview();
  });
  els.gDWY.addEventListener("change", () => {
    const g = currentGlyph();
    if (!g) return;
    g.dWidthY = toInt(els.gDWY.value, g.dWidthY);
    refreshEditor();
    refreshPreview();
  });

  els.gBW.addEventListener("change", () => onGlyphBBXChange("width"));
  els.gBH.addEventListener("change", () => onGlyphBBXChange("height"));
  els.gBX.addEventListener("change", () => onGlyphBBXChange("xoff"));
  els.gBY.addEventListener("change", () => onGlyphBBXChange("yoff"));

  els.clearGlyphBtn.addEventListener("click", () => {
    const g = currentGlyph();
    if (!g) return;
    for (let y = 0; y < g.bbx.height; y++) {
      for (let x = 0; x < g.bbx.width; x++) {
        g.bitmap[y][x] = false;
      }
    }
    refreshEditor();
    refreshGlyphListItem(state.selectedGlyphIndex);
    refreshPreview();
  });

  els.invertGlyphBtn.addEventListener("click", () => {
    const g = currentGlyph();
    if (!g) return;
    for (let y = 0; y < g.bbx.height; y++) {
      for (let x = 0; x < g.bbx.width; x++) {
        g.bitmap[y][x] = !g.bitmap[y][x];
      }
    }
    refreshEditor();
    refreshGlyphListItem(state.selectedGlyphIndex);
    refreshPreview();
  });

  els.zoomRange.addEventListener("input", () => {
    state.zoom = toInt(els.zoomRange.value, 22);
    refreshEditor();
  });

  els.showGridChk.addEventListener("change", () => {
    state.showGrid = !!els.showGridChk.checked;
    refreshEditor();
  });
  els.showAxesChk.addEventListener("change", () => {
    state.showAxes = !!els.showAxesChk.checked;
    refreshEditor();
  });

  // Glyph canvas interactions
  const canvas = els.glyphCanvas;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => {
    const g = currentGlyph();
    if (!g) return;
    const pos = canvasToCell(e, g);
    if (!pos) return;
    const { x, y } = pos;
    const val = g.bitmap[y]?.[x] ?? false;
    if (e.button === 2) {
      state.dragSet = false;
    } else {
      state.dragSet = !val;
    }
    state.dragging = true;
    setPixel(g, x, y, state.dragSet);
  });
  canvas.addEventListener("mousemove", (e) => {
    if (!state.dragging) return;
    const g = currentGlyph();
    if (!g) return;
    const pos = canvasToCell(e, g);
    if (!pos) return;
    setPixel(g, pos.x, pos.y, state.dragSet);
  });
  window.addEventListener("mouseup", () => {
    state.dragging = false;
  });

  // Preview controls
  els.previewText.addEventListener("input", refreshPreview);
  els.previewScale.addEventListener("input", refreshPreview);
}

function onLoadFile(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const text = String(fr.result || "");
      const font = parseBdf(text);
      if (!font || !Array.isArray(font.glyphs)) {
        alert("Failed to parse BDF.");
        return;
      }
      state.font = font;
      state.selectedGlyphIndex = 0;
      refreshAll();
    } catch (err) {
      console.error(err);
      alert("Error parsing BDF file (see console).");
    }
  };
  fr.readAsText(f);
}

function onExport() {
  try {
    const data = serializeBdf(state.font);
    const blob = new Blob([data], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    const name = (state.font.name || "font").replace(/[^\w.-]+/g, "_");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.bdf`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  } catch (err) {
    console.error(err);
    alert("Failed to export BDF (see console).");
  }
}

function onNewFont() {
  if (
    !confirm(
      "Create a new empty font? Unsaved changes will be lost."
    )
  ) {
    return;
  }
  state.font = createEmptyFont();
  state.selectedGlyphIndex = 0;
  refreshAll();
}

function onFontBBXChange() {
  const bbx = state.font.boundingBox;
  bbx.width = clampInt(toInt(els.bbxW.value, bbx.width), 1, 1024);
  bbx.height = clampInt(toInt(els.bbxH.value, bbx.height), 1, 1024);
  bbx.xoff = clampInt(toInt(els.bbxX.value, bbx.xoff), -512, 512);
  bbx.yoff = clampInt(toInt(els.bbxY.value, bbx.yoff), -512, 512);
}

function onAddGlyph() {
  const encStr = prompt(
    "New glyph encoding (integer, e.g. 65 for 'A'):",
    "65"
  );
  if (encStr == null) return;
  const enc = parseInt(encStr, 10);
  if (!Number.isFinite(enc)) {
    alert("Invalid encoding.");
    return;
  }
  const existing = state.font.glyphs.findIndex(
    (g) => g.encoding === enc
  );
  if (existing >= 0) {
    if (
      !confirm(
        "A glyph with that encoding exists. Add another unencoded " +
          "one (ENCODING -1)?"
      )
    ) {
      return;
    }
  }
  const g = createBlankGlyph(
    Number.isFinite(enc) ? enc : -1,
    "",
    state.font.boundingBox,
    state.font.boundingBox.width
  );
  state.font.glyphs.push(g);
  state.selectedGlyphIndex = state.font.glyphs.length - 1;
  refreshGlyphList();
  refreshRightPanels();
}

function onDelGlyph() {
  if (!currentGlyph()) return;
  if (!confirm("Delete selected glyph?")) return;
  state.font.glyphs.splice(state.selectedGlyphIndex, 1);
  state.selectedGlyphIndex = Math.max(
    0,
    Math.min(state.selectedGlyphIndex, state.font.glyphs.length - 1)
  );
  refreshAll();
}

function onGlyphBBXChange(field) {
  const g = currentGlyph();
  if (!g) return;
  const bbx = g.bbx;
  const oldW = bbx.width;
  const oldH = bbx.height;

  if (field === "width") {
    const w = clampInt(toInt(els.gBW.value, oldW), 1, 1024);
    if (w !== oldW) {
      // Resize bitmap columns
      for (let y = 0; y < oldH; y++) {
        const row = g.bitmap[y] || [];
        if (w > oldW) {
          for (let x = oldW; x < w; x++) row[x] = false;
        } else {
          row.length = w;
        }
      }
      bbx.width = w;
    }
  } else if (field === "height") {
    const h = clampInt(toInt(els.gBH.value, oldH), 1, 1024);
    if (h !== oldH) {
      if (h > oldH) {
        for (let y = oldH; y < h; y++) {
          g.bitmap[y] = new Array(bbx.width).fill(false);
        }
      } else {
        g.bitmap.length = h;
      }
      bbx.height = h;
    }
  } else if (field === "xoff") {
    bbx.xoff = clampInt(toInt(els.gBX.value, bbx.xoff), -512, 512);
  } else if (field === "yoff") {
    bbx.yoff = clampInt(toInt(els.gBY.value, bbx.yoff), -512, 512);
  }

  refreshEditor();
  refreshGlyphListItem(state.selectedGlyphIndex);
  refreshPreview();
}

function setPixel(g, x, y, v) {
  if (
    y >= 0 &&
    y < g.bbx.height &&
    x >= 0 &&
    x < g.bbx.width
  ) {
    g.bitmap[y][x] = !!v;
    refreshEditor(); // Just redraw, canvas sized to glyph
    refreshGlyphListItem(state.selectedGlyphIndex);
    // No full preview refresh on every drag for perf; throttle:
    schedulePreviewRefresh();
  }
}

function canvasToCell(e, g) {
  const rect = els.glyphCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left - 1;
  const y = e.clientY - rect.top - 1;
  const s = state.zoom;
  const gx = Math.floor(x / s);
  const gy = Math.floor(y / s);
  if (
    gx < 0 ||
    gy < 0 ||
    gx >= g.bbx.width ||
    gy >= g.bbx.height
  ) {
    return null;
  }
  return { x: gx, y: gy };
}

function refreshAll() {
  refreshLeftPanels();
  refreshGlyphList();
  refreshRightPanels();
  refreshPreview();
}

function refreshLeftPanels() {
  const f = state.font;
  els.fontName.value = f.name || "";
  els.sizePt.value = f.size.point ?? 16;
  els.sizeX.value = f.size.xres ?? 75;
  els.sizeY.value = f.size.yres ?? 75;
  els.bbxW.value = f.boundingBox.width ?? 8;
  els.bbxH.value = f.boundingBox.height ?? 16;
  els.bbxX.value = f.boundingBox.xoff ?? 0;
  els.bbxY.value = f.boundingBox.yoff ?? 0;
}

function refreshRightPanels() {
  refreshEditorForm();
  refreshEditor();
}

function refreshEditorForm() {
  const g = currentGlyph();
  if (!g) return;
  els.gName.value = g.name || "";
  els.gEnc.value = g.encoding ?? -1;
  els.gDWX.value = g.dWidthX ?? g.bbx.width;
  els.gDWY.value = g.dWidthY ?? 0;
  els.gBW.value = g.bbx.width ?? 8;
  els.gBH.value = g.bbx.height ?? 16;
  els.gBX.value = g.bbx.xoff ?? 0;
  els.gBY.value = g.bbx.yoff ?? 0;
  els.zoomRange.value = String(state.zoom);
  els.showGridChk.checked = !!state.showGrid;
  els.showAxesChk.checked = !!state.showAxes;
}

function refreshEditor() {
  const g = currentGlyph();
  if (!g) {
    const ctx = els.glyphCanvas.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }
  const ctx = els.glyphCanvas.getContext("2d");
  drawGlyphGrid(ctx, g, state.zoom, {
    grid: state.showGrid,
    axes: state.showAxes,
  });
}

function refreshGlyphList() {
  const list = els.glyphList;
  list.innerHTML = "";
  const frag = document.createDocumentFragment();
  state.font.glyphs.forEach((g, idx) => {
    frag.appendChild(createGlyphListItem(g, idx));
  });
  list.appendChild(frag);
}

function refreshGlyphListItem(idx) {
  const node = els.glyphList.querySelector(
    `[data-index="${idx}"]`
  );
  if (!node) return;
  updateGlyphListItem(node, state.font.glyphs[idx], idx);
}

function createGlyphListItem(g, idx) {
  const item = document.createElement("div");
  item.className =
    "glyphItem" + (idx === state.selectedGlyphIndex ? " active" : "");
  item.dataset.index = String(idx);

  const code = document.createElement("div");
  code.className = "code";
  code.textContent = String(g.encoding);
  const name = document.createElement("div");
  name.textContent = g.name || "(unnamed)";
  const mini = document.createElement("canvas");
  mini.width = 64;
  mini.height = 32;

  item.appendChild(code);
  item.appendChild(name);
  item.appendChild(mini);

  item.addEventListener("click", () => {
    state.selectedGlyphIndex = idx;
    refreshGlyphList();
    refreshRightPanels();
  });

  // Render preview
  const ctx = mini.getContext("2d");
  renderGlyphPreviewTo(ctx, g, 2);

  return item;
}

function updateGlyphListItem(node, g, idx) {
  node.className =
    "glyphItem" + (idx === state.selectedGlyphIndex ? " active" : "");
  node.querySelector(".code").textContent = String(g.encoding);
  node.childNodes[1].textContent = g.name || "(unnamed)";
  const mini = node.querySelector("canvas");
  const ctx = mini.getContext("2d");
  renderGlyphPreviewTo(ctx, g, 2);
}

function refreshPreview() {
  const text = els.previewText.value || "";
  const scale = toInt(els.previewScale.value, 2);
  drawPreview(text, scale);
}

let previewRaf = 0;
function schedulePreviewRefresh() {
  if (previewRaf) return;
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0;
    refreshPreview();
  });
}

function drawPreview(text, scale) {
  const ctx = els.previewCanvas.getContext("2d");
  const s = Math.max(1, scale | 0);
  const pad = 8 * s;

  // Compute rough width
  let widthPx = pad * 2;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const g = findGlyphByEncoding(cp);
    widthPx += ((g?.dWidthX ?? state.font.boundingBox.width) + 1) * s;
  }
  const heightPx = Math.max(
    64,
    (state.font.boundingBox.height + 10) * s
  );

  ctx.canvas.width = Math.min(2000, widthPx);
  ctx.canvas.height = Math.min(600, heightPx);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "#0a0d13";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const ascent =
    toInt(state.font.properties.FONT_ASCENT, 0) || 0;
  const descent =
    toInt(state.font.properties.FONT_DESCENT, 0) || 0;
  const baselineY = pad + ascent * s;

  let xPen = pad;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const g = findGlyphByEncoding(cp);
    if (!g) {
      xPen += state.font.boundingBox.width * s;
      continue;
    }
    drawGlyphAt(ctx, g, xPen, baselineY, s);
    xPen += (g.dWidthX || g.bbx.width) * s;
  }

  // Baseline
  ctx.strokeStyle = "rgba(90,220,130,0.5)";
  ctx.beginPath();
  ctx.moveTo(0, baselineY + 0.5);
  ctx.lineTo(ctx.canvas.width, baselineY + 0.5);
  ctx.stroke();
}

function drawGlyphAt(ctx, g, xOrigin, yBaseline, s) {
  const w = g.bbx.width;
  const h = g.bbx.height;
  const xLeft = xOrigin + g.bbx.xoff * s;
  const yTop = yBaseline - (g.bbx.yoff + h) * s;

  ctx.fillStyle = "#e6e8ef";
  const bm = g.bitmap || [];
  for (let i = 0; i < h; i++) {
    const row = bm[i] || [];
    for (let j = 0; j < w; j++) {
      if (row[j]) {
        ctx.fillRect(xLeft + j * s, yTop + i * s, s, s);
      }
    }
  }
}

function findGlyphByEncoding(enc) {
  if (!Number.isFinite(enc)) return null;
  return (
    state.font.glyphs.find((g) => g.encoding === enc) || null
  );
}

function currentGlyph() {
  return state.font.glyphs[state.selectedGlyphIndex] || null;
}

// Utils

function byId(id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function clampInt(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n | 0));
}
