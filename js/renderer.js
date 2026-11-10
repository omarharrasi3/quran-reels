// Draws one frame of the reel at time t. Used by both live preview and MP4 export.

import { segmentAt } from './timeline.js';
import { toArabicDigits } from './quran-api.js';

export const W = 1080;
export const H = 1920;

const AR_FONT = '"Amiri Quran", "Amiri", serif';
const EN_FONT = '"Inter", system-ui, sans-serif';
const TEXT_X_MARGIN = 100;
const TEXT_TOP = 380; // keep clear of the header
const TEXT_BOTTOM = 1500; // keep clear of Instagram's caption/buttons overlay
const FADE = 0.35;

const layoutCache = new WeakMap();

function wrap(ctx, text, maxW) {
  // Split on ordinary spaces only, so a no-break space keeps the ayah marker with its last word.
  const words = text.split(/[ \t\n]+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (line && ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Splits arr into `parts` consecutive groups whose sizes differ by at most one. */
function splitEvenly(arr, parts) {
  const out = [];
  let i = 0;
  for (let k = 0; k < parts; k++) {
    const size = Math.round((arr.length - i) / (parts - k));
    out.push(arr.slice(i, i + size));
    i += size;
  }
  return out;
}

// How each script is drawn on the reel: font, direction, size multiplier and line spacing.
const SCRIPTS = {
  latin: { font: EN_FONT, dir: 'ltr', size: 1, lh: 1.4 },
  arabic: { font: '"Amiri", serif', dir: 'rtl', size: 1.15, lh: 1.65 },
  urdu: { font: '"Noto Nastaliq Urdu", "Amiri", serif', dir: 'rtl', size: 1.0, lh: 2.2 },
};
const scriptOf = (opts) => SCRIPTS[opts.trScript] || SCRIPTS.latin;

/** Fit a segment's text into the safe area; long ayat (or long translations) are split into timed pages. */
function layout(ctx, seg, opts) {
  const sc = scriptOf(opts);
  const showTr = opts.showTranslation && !!seg.english;
  const key = `${showTr}|${opts.arScale}|${opts.trScript}`;
  const cached = layoutCache.get(seg);
  if (cached && cached.key === key) return cached.pages;

  const maxW = W - TEXT_X_MARGIN * 2;
  const areaH = TEXT_BOTTOM - TEXT_TOP;
  const arText = seg.ayahNo ? `${seg.arabic} ۝${toArabicDigits(seg.ayahNo)}` : seg.arabic;
  const scale = opts.arScale || 1;
  const trSizeFor = (arSize) => Math.round(sc.size * Math.max(32, Math.min(44, Math.round(arSize * 0.46))));
  const wrapTr = (text, trSize) => {
    ctx.font = `${trSize}px ${sc.font}`;
    ctx.direction = sc.dir;
    return wrap(ctx, text, maxW);
  };
  const heightOf = (arLines, trLines, arSize, trSize) =>
    arLines.length * arSize * 1.85 + (trLines.length ? 60 + trLines.length * trSize * sc.lh : 0);
  let fit = null;

  const minSize = Math.round(66 * scale);
  for (let arSize = Math.round(96 * scale); arSize >= minSize; arSize -= 4) {
    ctx.font = `${arSize}px ${AR_FONT}`;
    ctx.direction = 'rtl';
    const arLines = wrap(ctx, arText, maxW);
    const enSize = trSizeFor(arSize);
    const enLines = showTr ? wrapTr(seg.english, enSize) : [];
    const h = heightOf(arLines, enLines, arSize, enSize);
    fit = { arSize, enSize, arLines, enLines, h };
    if (h <= areaH) break;
  }

  let pages;
  if (fit.h <= areaH) {
    pages = [{ ...fit, start: seg.start, end: seg.end }];
  } else {
    // Still too tall at the smallest size: split across pages. Use the fewest pages where every page fits.
    // When there are more pages than Arabic lines (a short ayah with a long tafsir), each page repeats the ayah.
    const maxPerPage = Math.max(1, Math.floor((areaH * 0.62) / (fit.arSize * 1.85)));
    const trWords = showTr ? seg.english.split(/\s+/) : [];
    let n = Math.ceil(fit.arLines.length / maxPerPage);
    let split;
    for (; ; n++) {
      const repeat = n > fit.arLines.length;
      const arPages = repeat ? Array(n).fill(fit.arLines) : splitEvenly(fit.arLines, n);
      const trPages = splitEvenly(trWords, n).map((w) => (w.length ? wrapTr(w.join(' '), fit.enSize) : []));
      split = { repeat, arPages, trPages };
      const fits = arPages.every((a, i) => heightOf(a, trPages[i], fit.arSize, fit.enSize) <= areaH);
      if (fits || n >= 30 || (!showTr && !repeat && n >= fit.arLines.length)) break;
    }
    // Time each page by how much text it holds: the Arabic, or the translation when the ayah repeats.
    const weights = split.arPages.map((a, i) =>
      split.repeat ? split.trPages[i].join(' ').length || 1 : a.join(' ').length || 1);
    const total = weights.reduce((x, y) => x + y, 0);
    let t = seg.start;
    pages = split.arPages.map((arLines, i) => {
      const dur = ((seg.end - seg.start) * weights[i]) / total;
      const page = {
        arSize: fit.arSize,
        enSize: fit.enSize,
        arLines,
        enLines: split.trPages[i],
        start: t,
        end: i === split.arPages.length - 1 ? seg.end : t + dur,
      };
      t += dur;
      return page;
    });
  }
  pages.forEach((p) => { p.trFont = sc.font; p.trDir = sc.dir; p.trLH = sc.lh; });
  layoutCache.set(seg, { key, pages });
  return pages;
}

// Still photo with a slow "Ken Burns" zoom and pan across the whole reel.
function drawPhoto(ctx, img, t, duration) {
  const p = Math.min(1, Math.max(0, t / Math.max(1, duration)));
  const ease = p * p * (3 - 2 * p);
  const cover = Math.max(W / img.width, H / img.height);
  const s = cover * (1.06 + 0.1 * ease);
  const dw = img.width * s, dh = img.height * s;
  const exX = dw - W, exY = dh - H;
  const x = -exX / 2 + (ease - 0.5) * exX * 0.7;
  const y = -exY / 2 - (ease - 0.5) * exY * 0.3;
  ctx.drawImage(img, x, y, dw, dh);
}

function drawBackground(ctx, video, t, bgStyle, image, duration, frame) {
  if (bgStyle) {
    bgStyle.draw(ctx, t, W, H);
  } else if (image) {
    drawPhoto(ctx, image, t, duration);
  } else if (frame) {
    // a decoded frame of the clip (export only)
    const s = Math.max(W / frame.displayWidth, H / frame.displayHeight);
    const dw = frame.displayWidth * s;
    const dh = frame.displayHeight * s;
    frame.draw(ctx, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else if (video && video.readyState >= 2 && video.videoWidth) {
    const s = Math.max(W / video.videoWidth, H / video.videoHeight);
    const dw = video.videoWidth * s;
    const dh = video.videoHeight * s;
    ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    // Slowly drifting gradient when no clip is loaded.
    const a = t * 0.15;
    const g = ctx.createLinearGradient(
      W / 2 + Math.cos(a) * W, 0, W / 2 - Math.cos(a) * W, H
    );
    g.addColorStop(0, '#0f2b2a');
    g.addColorStop(0.5, '#123b3a');
    g.addColorStop(1, '#0a1a24');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function newLayer() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

// Soft text shadows are the most expensive thing on the canvas, so text is drawn once per page
// into a transparent layer and that finished layer is reused for every frame.
function setupText(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;
}

let vignette = null;
function vignetteLayer() {
  if (vignette) return vignette;
  vignette = newLayer();
  const c = vignette.getContext('2d');
  const g = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  return vignette;
}

// Surah name at the top, reciter and handle at the bottom.
const labels = { key: null, canvas: null };
function labelLayer(opts) {
  const key = [opts.showHeader, opts.surahNameAr, opts.surahNameEn, opts.reciterName, opts.handle].join('|');
  if (labels.key === key) return labels.canvas;
  labels.key = key;
  labels.canvas ||= newLayer();
  const c = labels.canvas.getContext('2d');
  c.clearRect(0, 0, W, H);
  setupText(c);
  if (opts.showHeader) {
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.direction = 'rtl';
    c.font = `64px ${AR_FONT}`;
    c.fillText(opts.surahNameAr || '', W / 2, 220);
    c.direction = 'ltr';
    c.font = `500 30px ${EN_FONT}`;
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText(opts.surahNameEn || '', W / 2, 300);
  }
  c.direction = 'ltr';
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.font = `500 28px ${EN_FONT}`;
  if (opts.reciterName) c.fillText(opts.reciterName, W / 2, 1580);
  if (opts.handle) {
    c.font = `600 30px ${EN_FONT}`;
    c.fillText(opts.handle, W / 2, 1630);
  }
  return labels.canvas;
}

// The verse currently on screen. Only one is kept: pages change every few seconds.
const verse = { page: null, canvas: null };
function verseLayer(page) {
  if (verse.page === page) return verse.canvas;
  verse.page = page;
  verse.canvas ||= newLayer();
  const c = verse.canvas.getContext('2d');
  c.clearRect(0, 0, W, H);
  setupText(c);

  const arLH = page.arSize * 1.85;
  const enLH = page.enSize * page.trLH;
  const blockH = page.arLines.length * arLH + (page.enLines.length ? 60 + page.enLines.length * enLH : 0);
  let y = TEXT_TOP + (TEXT_BOTTOM - TEXT_TOP - blockH) / 2 + arLH / 2;

  c.fillStyle = '#ffffff';
  c.direction = 'rtl';
  c.font = `${page.arSize}px ${AR_FONT}`;
  for (const line of page.arLines) {
    c.fillText(line, W / 2, y);
    y += arLH;
  }
  if (page.enLines.length) {
    y += 60 - arLH / 2 + enLH / 2;
    c.direction = page.trDir;
    c.font = `${page.enSize}px ${page.trFont}`;
    c.fillStyle = 'rgba(255,255,255,0.88)';
    for (const line of page.enLines) {
      c.fillText(line, W / 2, y);
      y += enLH;
    }
  }
  return verse.canvas;
}

/**
 * opts: { video, bgStyle (from generated.js; wins over video), overlay (0..1), showTranslation, trScript, showHeader, surahNameAr, surahNameEn, reciterName, handle, arScale }
 */
export function drawFrame(ctx, reel, t, opts) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, opts.video, t, opts.bgStyle, opts.image, reel ? reel.duration : 30, opts.frame);

  ctx.fillStyle = `rgba(0,0,0,${opts.overlay})`;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(vignetteLayer(), 0, 0);

  if (reel && reel.segments.length) {
    const seg = segmentAt(reel.segments, t);
    const pages = layout(ctx, seg, opts);
    const page = pages.find((p) => t >= p.start && t < p.end) || pages[pages.length - 1];
    const alpha = Math.max(0, Math.min(1, (t - page.start) / FADE, (page.end - t) / FADE));
    const isFirst = page.start === 0;
    ctx.globalAlpha = isFirst ? Math.min(1, (page.end - t) / FADE) : alpha;
    if (ctx.globalAlpha > 0) ctx.drawImage(verseLayer(page), 0, 0);
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(labelLayer(opts), 0, 0);
  ctx.restore();
}
