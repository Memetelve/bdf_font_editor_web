// bdf.js
// Parsing and serialization for BDF fonts. Also includes helpers.

export function parseBdf(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  function peek() {
    return lines[i] ?? "";
  }
  function next() {
    return lines[i++] ?? "";
  }
  function eatEmpty() {
    while (i < lines.length && !lines[i].trim()) i++;
  }
  function isToken(line, token) {
    return line.startsWith(token + " ") || line === token;
  }

  const font = {
    version: "2.1",
    name: "Font",
    size: { point: 16, xres: 75, yres: 75 },
    boundingBox: { width: 8, height: 16, xoff: 0, yoff: 0 },
    properties: {},
    glyphs: [],
  };

  eatEmpty();
  if (isToken(peek().trim(), "STARTFONT")) {
    const parts = next().trim().split(/\s+/);
    font.version = parts[1] ?? "2.1";
  }

  // Read header until CHARS
  while (i < lines.length) {
    const t = peek().trim();
    if (!t) {
      next();
      continue;
    }
    if (isToken(t, "CHARS")) break;
    if (isToken(t, "FONT")) {
      const parts = next().trim().split(/\s+/);
      font.name = parts.slice(1).join(" ");
      continue;
    }
    if (isToken(t, "SIZE")) {
      const parts = next().trim().split(/\s+/);
      font.size = {
        point: toInt(parts[1], 16),
        xres: toInt(parts[2], 75),
        yres: toInt(parts[3], 75),
      };
      continue;
    }
    if (isToken(t, "FONTBOUNDINGBOX")) {
      const parts = next().trim().split(/\s+/);
      font.boundingBox = {
        width: toInt(parts[1], 8),
        height: toInt(parts[2], 16),
        xoff: toInt(parts[3], 0),
        yoff: toInt(parts[4], 0),
      };
      continue;
    }
    if (isToken(t, "STARTPROPERTIES")) {
      next(); // consume STARTPROPERTIES n
      while (i < lines.length) {
        const l = next().trim();
        if (isToken(l, "ENDPROPERTIES")) break;
        if (!l) continue;
        const k = l.split(/\s+/)[0];
        const rest = l.slice(k.length).trim();
        font.properties[k] = parsePropValue(rest);
      }
      continue;
    }
    // Unknown header token
    next();
  }

  // CHARS
  let glyphCount = 0;
  if (isToken(peek().trim(), "CHARS")) {
    const parts = next().trim().split(/\s+/);
    glyphCount = toInt(parts[1], 0);
  }

  // Read glyphs
  while (i < lines.length) {
    let t = peek().trim();
    if (!t) {
      next();
      continue;
    }
    if (isToken(t, "ENDFONT")) break;
    if (!isToken(t, "STARTCHAR")) {
      next();
      continue;
    }
    const gl = {
      name: "",
      encoding: -1,
      sWidthX: 0,
      sWidthY: 0,
      dWidthX: font.boundingBox.width,
      dWidthY: 0,
      bbx: {
        width: font.boundingBox.width,
        height: font.boundingBox.height,
        xoff: 0,
        yoff: 0,
      },
      bitmap: [],
    };

    // STARTCHAR name
    {
      const parts = next().trim().split(/\s+/);
      gl.name = parts.slice(1).join(" ");
    }

    // Read until BITMAP
    while (i < lines.length) {
      t = peek().trim();
      if (isToken(t, "BITMAP")) {
        next();
        break;
      }
      if (isToken(t, "ENDCHAR")) {
        // No bitmap (empty glyph)
        next();
        font.glyphs.push(gl);
        t = "";
        break;
      }
      if (isToken(t, "ENCODING")) {
        const parts = next().trim().split(/\s+/);
        gl.encoding = toInt(parts[1], -1);
      } else if (isToken(t, "SWIDTH")) {
        const p = next().trim().split(/\s+/);
        gl.sWidthX = toInt(p[1], 0);
        gl.sWidthY = toInt(p[2], 0);
      } else if (isToken(t, "DWIDTH")) {
        const p = next().trim().split(/\s+/);
        gl.dWidthX = toInt(p[1], gl.dWidthX);
        gl.dWidthY = toInt(p[2], 0);
      } else if (isToken(t, "BBX")) {
        const p = next().trim().split(/\s+/);
        gl.bbx.width = toInt(p[1], gl.bbx.width);
        gl.bbx.height = toInt(p[2], gl.bbx.height);
        gl.bbx.xoff = toInt(p[3], 0);
        gl.bbx.yoff = toInt(p[4], 0);
      } else {
        // Unknown token inside glyph header
        next();
      }
    }

    // Read bitmap lines until ENDCHAR
    if (t !== "") {
      const h = gl.bbx.height;
      const w = gl.bbx.width;
      const rows = [];
      let rowsRead = 0;
      while (i < lines.length) {
        const l = next().trim();
        if (isToken(l, "ENDCHAR")) break;
        if (!l) continue;
        if (rowsRead < 20000) {
          rows.push(hexToBits(l, w));
          rowsRead++;
        }
      }
      // Some BDFs might have less/more rows than declared; fix length
      gl.bitmap = normalizeBitmap(rows, w, gl.bbx.height);
      font.glyphs.push(gl);
    }
  }

  // If glyph count missing or wrong, ignore
  return font;
}

export function serializeBdf(font) {
  const lines = [];
  lines.push(`STARTFONT ${font.version}`);
  lines.push(`FONT ${font.name}`);
  lines.push(
    `SIZE ${safeInt(font.size.point)} ${safeInt(font.size.xres)} ` +
      `${safeInt(font.size.yres)}`
  );
  lines.push(
    `FONTBOUNDINGBOX ${safeInt(font.boundingBox.width)} ` +
      `${safeInt(font.boundingBox.height)} ` +
      `${safeInt(font.boundingBox.xoff)} ${safeInt(font.boundingBox.yoff)}`
  );

  const propKeys = Object.keys(font.properties || {});
  if (propKeys.length > 0) {
    lines.push(`STARTPROPERTIES ${propKeys.length}`);
    for (const k of propKeys) {
      const v = font.properties[k];
      lines.push(`${k} ${formatPropValue(v)}`);
    }
    lines.push("ENDPROPERTIES");
  }

  lines.push(`CHARS ${font.glyphs.length}`);
  for (const g of font.glyphs) {
    lines.push(`STARTCHAR ${g.name || "unnamed"}`);
    lines.push(`ENCODING ${safeInt(g.encoding)}`);
    lines.push(
      `SWIDTH ${safeInt(g.sWidthX || 0)} ${safeInt(g.sWidthY || 0)}`
    );
    lines.push(
      `DWIDTH ${safeInt(g.dWidthX || 0)} ${safeInt(g.dWidthY || 0)}`
    );
    lines.push(
      `BBX ${safeInt(g.bbx.width)} ${safeInt(g.bbx.height)} ` +
        `${safeInt(g.bbx.xoff)} ${safeInt(g.bbx.yoff)}`
    );
    lines.push("BITMAP");
    const w = g.bbx.width;
    const h = g.bbx.height;
    const bm = normalizeBitmap(g.bitmap || [], w, h);
    for (let i = 0; i < h; i++) {
      const row = bm[i] || [];
      lines.push(bitsRowToHex(row, w).toUpperCase());
    }
    lines.push("ENDCHAR");
  }
  lines.push("ENDFONT");
  return lines.join("\n");
}

// Helpers

function toInt(s, def = 0) {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : def;
}

function safeInt(n) {
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function parsePropValue(rest) {
  if (!rest) return "";
  // String in quotes or numeric
  const m = rest.match(/^"([\s\S]*)"$/);
  if (m) return m[1];
  const n = parseInt(rest, 10);
  return Number.isFinite(n) ? n : rest;
}

function formatPropValue(v) {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (/^\d+$/.test(v)) return v;
    return `"${v}"`;
  }
  return String(v ?? "");
}

function hexToBits(hexStr, width) {
  const clean = hexStr.replace(/^0x/i, "").trim();
  const need = Math.ceil(width / 4);
  const use = clean.length >= need ? clean : clean.padStart(need, "0");
  let bits = "";
  for (let i = 0; i < use.length; i++) {
    const nib = parseInt(use[i], 16);
    const b = (nib >>> 0).toString(2).padStart(4, "0");
    bits += b;
  }
  const out = [];
  for (let i = 0; i < width; i++) {
    out.push(bits[i] === "1");
  }
  return out;
}

function bitsRowToHex(row, width) {
  const need = Math.ceil(width / 4);
  let bits = "";
  for (let i = 0; i < width; i++) {
    bits += row[i] ? "1" : "0";
  }
  // pad right to full nibble
  const extra = need * 4 - width;
  bits += "0".repeat(extra);

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nib = bits.slice(i, i + 4);
    hex += parseInt(nib, 2).toString(16);
  }
  return hex;
}

function normalizeBitmap(rows, width, height) {
  const h = Math.max(0, height | 0);
  const w = Math.max(0, width | 0);
  const out = [];
  for (let i = 0; i < h; i++) {
    const r = rows[i] || [];
    const row = new Array(w);
    for (let j = 0; j < w; j++) {
      row[j] = !!r[j];
    }
    out.push(row);
  }
  return out;
}

// Rendering helpers for previews

export function drawGlyphGrid(ctx, glyph, scale, opts) {
  const w = glyph.bbx.width;
  const h = glyph.bbx.height;
  const s = Math.max(1, scale | 0);
  const pad = 1;

  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = false;

  const cw = w * s + 1;
  const ch = h * s + 1;
  ctx.canvas.width = cw + pad * 2;
  ctx.canvas.height = ch + pad * 2;

  ctx.fillStyle = "#0b0e14";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.translate(pad, pad);

  // Background
  ctx.fillStyle = "#0f1420";
  ctx.fillRect(0, 0, cw, ch);

  // Pixels
  const bm = glyph.bitmap || [];
  for (let y = 0; y < h; y++) {
    const row = bm[y] || [];
    for (let x = 0; x < w; x++) {
      if (row[x]) {
        ctx.fillStyle = "#e6e8ef";
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
  }

  // Grid
  if (opts?.grid) {
    ctx.strokeStyle = "rgba(160,170,185,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(x * s + 0.5, 0);
      ctx.lineTo(x * s + 0.5, h * s);
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(0, y * s + 0.5);
      ctx.lineTo(w * s, y * s + 0.5);
    }
    ctx.stroke();
  }

  // Axes (origin and baseline)
  if (opts?.axes) {
    const jOrigin = -glyph.bbx.xoff;
    const iBase = glyph.bbx.yoff + glyph.bbx.height - 1;

    if (jOrigin >= 0 && jOrigin < w) {
      ctx.strokeStyle = "rgba(91,156,255,0.7)";
      ctx.beginPath();
      ctx.moveTo(jOrigin * s + 0.5, 0);
      ctx.lineTo(jOrigin * s + 0.5, h * s);
      ctx.stroke();
    }
    if (iBase >= 0 && iBase < h) {
      ctx.strokeStyle = "rgba(90,220,130,0.7)";
      ctx.beginPath();
      ctx.moveTo(0, iBase * s + 0.5);
      ctx.lineTo(w * s, iBase * s + 0.5);
      ctx.stroke();
    }

    // DWIDTH x marker (relative to origin)
    const dcol = jOrigin + (glyph.dWidthX | 0);
    if (dcol >= 0 && dcol < w) {
      ctx.strokeStyle = "rgba(255,160,90,0.7)";
      ctx.beginPath();
      ctx.moveTo(dcol * s + 0.5, 0);
      ctx.lineTo(dcol * s + 0.5, h * s);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function renderGlyphPreviewTo(
  ctx,
  glyph,
  scale,
  bg = "#0a0d13",
  fg = "#e6e8ef"
) {
  const s = Math.max(1, scale | 0);
  const w = glyph.bbx.width;
  const h = glyph.bbx.height;

  const pad = 1;
  const cw = Math.max(1, w * s + 1);
  const ch = Math.max(1, h * s + 1);
  ctx.canvas.width = cw + pad * 2;
  ctx.canvas.height = ch + pad * 2;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.translate(pad, pad);

  ctx.fillStyle = fg;
  const bm = glyph.bitmap || [];
  for (let y = 0; y < h; y++) {
    const row = bm[y] || [];
    for (let x = 0; x < w; x++) {
      if (row[x]) {
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
  }

  ctx.restore();
}

export function createEmptyFont() {
  const font = {
    version: "2.1",
    name: "NewFont",
    size: { point: 16, xres: 75, yres: 75 },
    boundingBox: { width: 8, height: 16, xoff: 0, yoff: -3 },
    properties: {
      FONT_ASCENT: 12,
      FONT_DESCENT: 4,
    },
    glyphs: [],
  };
  // Create a space glyph by default
  font.glyphs.push(
    createBlankGlyph(32, "space", font.boundingBox, font.boundingBox.width)
  );
  return font;
}

export function createBlankGlyph(
  encoding,
  name,
  bbx,
  dwidthX = bbx.width
) {
  return {
    name: name || `uni${encoding}`,
    encoding: encoding ?? -1,
    sWidthX: 0,
    sWidthY: 0,
    dWidthX: dwidthX | 0,
    dWidthY: 0,
    bbx: {
      width: bbx.width | 0,
      height: bbx.height | 0,
      xoff: bbx.xoff | 0,
      yoff: bbx.yoff | 0,
    },
    bitmap: new Array(bbx.height | 0)
      .fill(null)
      .map(() => new Array(bbx.width | 0).fill(false)),
  };
}
