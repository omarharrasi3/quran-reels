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
  const words = text.split(/\s+/).filter(Boolean);
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

function splitEvenly(arr, parts) {
  const out = [];
  const per = Math.ceil(arr.length / parts);
  for (let i = 0; i < parts; i++) out.push(arr.slice(i * per, (i + 1) * per));
  return out;
}

/** Fit a segment's text into the safe area; very long ayat are split into timed pages. */
function layout(ctx, seg, opts) {
  const key = `${opts.showTranslation}|${opts.arScale}`;
  const cached = layoutCache.get(seg);
  if (cached && cached.key === key) return cached.pages;

  const maxW = W - TEXT_X_MARGIN * 2;
  const areaH = TEXT_BOTTOM - TEXT_TOP;
  const arText = seg.ayahNo ? `${seg.arabic} ۝${toArabicDigits(seg.ayahNo)}` : seg.arabic;
  const scale = opts.arScale || 1;
  let fit = null;

  const minSize = Math.round(66 * scale);
  for (let arSize = Math.round(96 * scale); arSize >= minSize; arSize -= 4) {
    ctx.font = `${arSize}px ${AR_FONT}`;
    ctx.direction = 'rtl';
    const arLines = wrap(ctx, arText, maxW);
    const enSize = Math.max(32, Math.min(44, Math.round(arSize * 0.46)));
    ctx.font = `${enSize}px ${EN_FONT}`;
    ctx.direction = 'ltr';
    const enLines = opts.showTranslation ? wrap(ctx, seg.english, maxW) : [];
    const h = arLines.length * arSize * 1.85 + (enLines.length ? 60 + enLines.length * enSize * 1.4 : 0);
    fit = { arSize, enSize, arLines, enLines, h };
    if (h <= areaH) break;
  }

  let pages;
  if (fit.h <= areaH) {
    pages = [{ ...fit, start: seg.start, end: seg.end }];
  } else {
    // Still too tall at the smallest size: split across pages, timed by Arabic character count.
    const maxPerPage = Math.max(1, Math.floor((areaH * 0.62) / (fit.arSize * 1.85)));
    const nPages = Math.ceil(fit.arLines.length / maxPerPage);
    const perPageAr = Math.ceil(fit.arLines.length / nPages); // balance lines across pages
    const arPages = [];
    for (let i = 0; i < fit.arLines.length; i += perPageAr) arPages.push(fit.arLines.slice(i, i + perPageAr));
    const enWords = seg.english.split(/\s+/);
    const enPages = splitEvenly(enWords, arPages.length);
    ctx.font = `${fit.enSize}px ${EN_FONT}`;
    ctx.direction = 'ltr';
    const totalChars = arPages.reduce((s, p) => s + p.join(' ').length, 0);
    let t = seg.start;
    pages = arPages.map((arLines, i) => {
      const dur = ((seg.end - seg.start) * arLines.join(' ').length) / totalChars;
      const page = {
        arSize: fit.arSize,
        enSize: fit.enSize,
        arLines,
        enLines: opts.showTranslation ? wrap(ctx, enPages[i].join(' '), maxW) : [],
        start: t,
        end: i === arPages.length - 1 ? seg.end : t + dur,
      };
      t += dur;
      return page;
    });
  }
  layoutCache.set(seg, { key, pages });
  return pages;
}

function drawBackground(ctx, video, t) {
  if (video && video.readyState >= 2 && video.videoWidth) {
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

/**
 * opts: { video, overlay (0..1), showTranslation, showHeader, surahNameAr, surahNameEn, reciterName, handle, arScale }
 */
export function drawFrame(ctx, reel, t, opts) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, opts.video, t);

  ctx.fillStyle = `rgba(0,0,0,${opts.overlay})`;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;

  if (opts.showHeader) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.direction = 'rtl';
    ctx.font = `64px ${AR_FONT}`;
    ctx.fillText(opts.surahNameAr || '', W / 2, 220);
    ctx.direction = 'ltr';
    ctx.font = `500 30px ${EN_FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(opts.surahNameEn || '', W / 2, 300);
  }

  if (reel && reel.segments.length) {
    const seg = segmentAt(reel.segments, t);
    const pages = layout(ctx, seg, opts);
    const page = pages.find((p) => t >= p.start && t < p.end) || pages[pages.length - 1];
    const alpha = Math.max(0, Math.min(1, (t - page.start) / FADE, (page.end - t) / FADE));
    const isFirst = page.start === 0;
    ctx.globalAlpha = isFirst ? Math.min(1, (page.end - t) / FADE) : alpha;

    const arLH = page.arSize * 1.85;
    const enLH = page.enSize * 1.4;
    const blockH = page.arLines.length * arLH + (page.enLines.length ? 60 + page.enLines.length * enLH : 0);
    let y = TEXT_TOP + (TEXT_BOTTOM - TEXT_TOP - blockH) / 2 + arLH / 2;

    ctx.fillStyle = '#ffffff';
    ctx.direction = 'rtl';
    ctx.font = `${page.arSize}px ${AR_FONT}`;
    for (const line of page.arLines) {
      ctx.fillText(line, W / 2, y);
      y += arLH;
    }
    if (page.enLines.length) {
      y += 60 - arLH / 2 + enLH / 2;
      ctx.direction = 'ltr';
      ctx.font = `${page.enSize}px ${EN_FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      for (const line of page.enLines) {
        ctx.fillText(line, W / 2, y);
        y += enLH;
      }
    }
    ctx.globalAlpha = 1;
  }

  ctx.direction = 'ltr';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 28px ${EN_FONT}`;
  if (opts.reciterName) ctx.fillText(opts.reciterName, W / 2, 1580);
  if (opts.handle) {
    ctx.font = `600 30px ${EN_FONT}`;
    ctx.fillText(opts.handle, W / 2, 1630);
  }
  ctx.restore();
}
