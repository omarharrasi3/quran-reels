import { RECITERS, getSurahs } from './quran-api.js';
import { buildReel, SAMPLE_RATE } from './timeline.js';
import { drawFrame } from './renderer.js';
import { webCodecsSupport, exportWebCodecs, exportRealtime } from './exporter.js';
import {
  getPexelsKey, setPexelsKey, searchPexels, loadPexelsVideo, videoFromBlob, searchCommons, loadVideoUrl,
} from './backgrounds.js';
import { STYLES, getStyle, thumbnail } from './generated.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(
  ['surah', 'from', 'to', 'reciter', 'basmala', 'load', 'loadStatus', 'upload', 'clearBg', 'pexelsKey', 'pexelsQuery',
   'pexelsSearch', 'pexelsResults', 'chips', 'bgStatus', 'overlay', 'showTranslation', 'showHeader', 'showReciter',
   'handle', 'arScale', 'export', 'cancel', 'progress', 'exportStatus', 'download', 'canvas', 'play', 'seek', 'time',
   'durationNote', 'styleGrid', 'freeQuery', 'freeSearch', 'freeChips', 'freeResults', 'bgCredit'].map((id) => [id, $(id)])
);
const ctx = els.canvas.getContext('2d');

const state = {
  surahs: [],
  reel: null,
  meta: null, // { surahNameAr, surahNameEn, reciterName, slug }
  video: null,
  bgStyle: getStyle('night'), // animated background; null when a video/gradient is used
  playing: false,
  audioCtx: null,
  source: null,
  startedAt: 0,
  pausedAt: 0,
  exporting: null,
};

function setStatus(el, msg, isError = false) {
  el.textContent = msg;
  el.classList.toggle('error', isError);
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function renderOpts() {
  return {
    video: state.bgStyle ? null : state.video,
    bgStyle: state.bgStyle,
    overlay: Number(els.overlay.value),
    showTranslation: els.showTranslation.checked,
    showHeader: els.showHeader.checked,
    surahNameAr: state.meta?.surahNameAr,
    surahNameEn: state.meta?.surahNameEn,
    reciterName: els.showReciter.checked ? state.meta?.reciterName : '',
    handle: els.handle.value.trim(),
    arScale: Number(els.arScale.value),
  };
}

// ---------- setup
RECITERS.forEach((r) => els.reciter.add(new Option(r.name, r.id)));
['clouds sky', 'ocean waves', 'forest', 'rain', 'mountains', 'stars night', 'desert', 'waterfall', 'sunset'].forEach((q) => {
  const b = document.createElement('button');
  b.textContent = q;
  b.onclick = () => { els.pexelsQuery.value = q; doPexelsSearch(); };
  els.chips.append(b);
});
els.pexelsKey.value = getPexelsKey();

function currentSurah() {
  return state.surahs.find((s) => s.number === Number(els.surah.value));
}
function syncAyahLimits() {
  const s = currentSurah();
  if (!s) return;
  els.from.max = els.to.max = s.numberOfAyahs;
  const noBasmala = s.number === 1 || s.number === 9;
  els.basmala.disabled = noBasmala;
  if (noBasmala) els.basmala.checked = false;
}

getSurahs()
  .then((list) => {
    state.surahs = list;
    els.surah.innerHTML = '';
    list.forEach((s) => els.surah.add(new Option(`${s.number}. ${s.englishName} — ${s.name}`, s.number)));
    els.surah.value = '1';
    syncAyahLimits();
  })
  .catch((e) => setStatus(els.loadStatus, `Couldn't load the surah list: ${e.message}`, true));

els.surah.onchange = () => {
  syncAyahLimits();
  const s = currentSurah();
  els.from.value = 1;
  els.to.value = Math.min(s.numberOfAyahs, 5);
  if (s.number !== 1 && s.number !== 9) els.basmala.checked = true;
};
els.from.onchange = () => {
  if (Number(els.from.value) !== 1 && currentSurah()?.number !== 1) els.basmala.checked = false;
};

const fontsReady = Promise.all([
  document.fonts.load('64px "Amiri Quran"', 'بِسْمِ ٱللَّهِ'),
  document.fonts.load('64px "Amiri"', 'بِسْمِ'),
  document.fonts.load('40px "Inter"', 'Allah'),
  document.fonts.load('600 40px "Inter"', 'Allah'),
]).catch(() => {});

// ---------- load verses
els.load.onclick = async () => {
  const s = currentSurah();
  if (!s) return;
  let from = Math.max(1, Math.min(s.numberOfAyahs, Number(els.from.value) || 1));
  let to = Math.max(from, Math.min(s.numberOfAyahs, Number(els.to.value) || from));
  els.from.value = from;
  els.to.value = to;
  if (to - from > 60) {
    setStatus(els.loadStatus, 'Please choose 60 ayat or fewer for one reel.', true);
    return;
  }
  stop();
  els.load.disabled = true;
  setStatus(els.loadStatus, 'Loading text and recitation…');
  try {
    await fontsReady;
    const reciter = RECITERS.find((r) => r.id === els.reciter.value);
    state.reel = await buildReel(
      { surah: s.number, from, to, reciterId: reciter.id, withBasmala: els.basmala.checked && !els.basmala.disabled },
      (p) => setStatus(els.loadStatus, `Loading recitation… ${Math.round(p * 100)}%`)
    );
    state.meta = {
      surahNameAr: s.name,
      surahNameEn: `${s.englishName} · ${from === to ? from : `${from}–${to}`}`,
      reciterName: reciter.name,
      slug: `${s.englishName.replace(/[^a-z0-9]+/gi, '-')}-${from}-${to}`.toLowerCase(),
    };
    state.pausedAt = 0;
    els.seek.max = state.reel.duration;
    els.seek.value = 0;
    els.seek.disabled = false;
    els.play.disabled = false;
    els.export.disabled = false;
    els.download.hidden = true;
    const d = state.reel.duration;
    setStatus(els.loadStatus, `Ready: ${state.reel.segments.length} part(s), ${fmt(d)} long. Press play to preview.`);
    els.durationNote.textContent = d > 180
      ? `This reel is ${fmt(d)}. Instagram Reels are limited to 3 minutes, so pick fewer ayat.`
      : d > 90 ? `Length ${fmt(d)}. Fine for Reels, but 15–60 s clips usually do best.` : '';
  } catch (e) {
    console.error(e);
    setStatus(els.loadStatus, `Something went wrong: ${e.message}`, true);
  } finally {
    els.load.disabled = false;
  }
};

// ---------- playback
function currentTime() {
  if (!state.playing) return state.pausedAt;
  return Math.min(state.reel.duration, state.audioCtx.currentTime - state.startedAt);
}

function play() {
  if (!state.reel) return;
  if (!state.audioCtx) state.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
  state.audioCtx.resume();
  if (state.pausedAt >= state.reel.duration - 0.05) state.pausedAt = 0;
  const src = state.audioCtx.createBufferSource();
  src.buffer = state.reel.audio;
  src.connect(state.audioCtx.destination);
  src.start(0, state.pausedAt);
  src.onended = () => {
    if (state.source === src) { state.pausedAt = currentTime(); state.playing = false; state.source = null; updatePlayUi(); }
  };
  state.source = src;
  state.startedAt = state.audioCtx.currentTime - state.pausedAt;
  state.playing = true;
  if (state.video && !state.bgStyle) {
    state.video.currentTime = state.pausedAt % (state.video.duration || 1);
    state.video.play().catch(() => {});
  }
  updatePlayUi();
}

function stop() {
  if (state.playing) state.pausedAt = currentTime();
  state.playing = false;
  if (state.source) { const s = state.source; state.source = null; try { s.stop(); } catch {} }
  if (state.video) state.video.pause();
  updatePlayUi();
}

function updatePlayUi() {
  els.play.textContent = state.playing ? '❚❚' : '▶';
  els.play.setAttribute('aria-label', state.playing ? 'Pause preview' : 'Play preview');
  els.canvas.parentElement.classList.toggle('playing', state.playing);
}

els.play.onclick = () => (state.playing ? stop() : play());
els.seek.oninput = () => {
  const wasPlaying = state.playing;
  stop();
  state.pausedAt = Number(els.seek.value);
  if (state.video && state.video.duration) state.video.currentTime = state.pausedAt % state.video.duration;
  if (wasPlaying) play();
};

function loop() {
  if (!state.exporting) {
    const t = state.reel ? currentTime() : 0;
    drawFrame(ctx, state.reel, t, renderOpts());
    if (state.reel) {
      if (state.playing) els.seek.value = t;
      els.time.textContent = `${fmt(t)} / ${fmt(state.reel.duration)}`;
    }
  }
  requestAnimationFrame(loop);
}
fontsReady.then(() => requestAnimationFrame(loop));

// ---------- backgrounds
document.querySelectorAll('.tabs [role=tab]').forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll('.tabpanel').forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
    if (tab.dataset.tab === 'free' && !els.freeResults.children.length) doFreeSearch();
  };
});

function markSelected(btn) {
  document.querySelectorAll('.grid button.selected').forEach((b) => b.classList.remove('selected'));
  if (btn) btn.classList.add('selected');
}

function setCredit(text) {
  els.bgCredit.hidden = !text;
  els.bgCredit.textContent = text || '';
}

function useStyle(style, btn) {
  if (state.video) state.video.pause();
  state.bgStyle = style;
  els.overlay.value = style.overlay;
  markSelected(btn);
  setCredit('');
  setStatus(els.bgStatus, `Using the “${style.name}” animated background.`);
}

STYLES.forEach((style) => {
  const b = document.createElement('button');
  b.title = style.name;
  b.append(thumbnail(style));
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = style.name;
  b.append(label);
  b.onclick = () => useStyle(style, b);
  if (style === state.bgStyle) b.classList.add('selected');
  els.styleGrid.append(b);
});
els.overlay.value = state.bgStyle.overlay;

async function useVideo(v, btn) {
  if (state.video) { state.video.pause(); URL.revokeObjectURL(state.video.src); }
  state.video = v;
  state.bgStyle = null;
  els.overlay.value = 0.45;
  markSelected(btn);
  if (state.playing) {
    v.currentTime = currentTime() % (v.duration || 1);
    v.play().catch(() => {});
  }
}

function resultButton(it, badge) {
  const b = document.createElement('button');
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = '';
  img.src = it.thumb;
  const span = document.createElement('span');
  span.textContent = badge;
  b.append(img, span);
  return b;
}

['clouds timelapse', 'ocean waves', 'forest', 'waterfall', 'rain', 'mountains', 'sunset', 'stars night', 'desert', 'river'].forEach((q) => {
  const b = document.createElement('button');
  b.textContent = q;
  b.onclick = () => { els.freeQuery.value = q; doFreeSearch(); };
  els.freeChips.append(b);
});
els.freeSearch.onclick = () => doFreeSearch();
els.freeQuery.onkeydown = (e) => { if (e.key === 'Enter') doFreeSearch(); };

async function doFreeSearch() {
  setStatus(els.bgStatus, 'Searching free clips…');
  els.freeResults.innerHTML = '';
  try {
    const items = await searchCommons(els.freeQuery.value.trim() || 'nature');
    if (!items.length) { setStatus(els.bgStatus, 'No clips found. Try another word, like “clouds” or “sea”.'); return; }
    setStatus(els.bgStatus, 'Tap a clip to use it. HD clips look best.');
    for (const it of items) {
      const b = resultButton(it, `${it.hd ? 'HD · ' : ''}${it.duration}s`);
      b.title = `${it.title}, by ${it.author} (${it.license})`;
      b.onclick = async () => {
        setStatus(els.bgStatus, 'Downloading clip…');
        try {
          const v = await loadVideoUrl(it.file.src, (p) => setStatus(els.bgStatus, `Downloading clip… ${Math.round(p * 100)}%`));
          await useVideo(v, b);
          setStatus(els.bgStatus, `Using “${it.title}”.`);
          setCredit(`Background: “${it.title}” by ${it.author}, ${it.license}, via Wikimedia Commons. Please add this credit to your Instagram caption.`);
        } catch (e) {
          setStatus(els.bgStatus, e.message, true);
        }
      };
      els.freeResults.append(b);
    }
  } catch (e) {
    setStatus(els.bgStatus, `Couldn't search right now: ${e.message}`, true);
  }
}

els.upload.onchange = async () => {
  const f = els.upload.files[0];
  if (!f) return;
  setStatus(els.bgStatus, 'Loading clip…');
  try {
    await useVideo(await videoFromBlob(f));
    setCredit('');
    setStatus(els.bgStatus, `Using “${f.name}”.`);
  } catch (e) {
    setStatus(els.bgStatus, e.message, true);
  }
  els.upload.value = '';
};
els.clearBg.onclick = () => {
  if (state.video) { state.video.pause(); URL.revokeObjectURL(state.video.src); }
  state.video = null;
  state.bgStyle = null;
  els.overlay.value = 0.2;
  markSelected(null);
  setCredit('');
  setStatus(els.bgStatus, 'Using the plain gradient.');
};

els.pexelsKey.onchange = () => setPexelsKey(els.pexelsKey.value.trim());
els.pexelsSearch.onclick = () => doPexelsSearch();
els.pexelsQuery.onkeydown = (e) => { if (e.key === 'Enter') doPexelsSearch(); };

async function doPexelsSearch() {
  const key = els.pexelsKey.value.trim();
  if (!key) { setStatus(els.bgStatus, 'Paste your Pexels API key first.', true); return; }
  setPexelsKey(key);
  setStatus(els.bgStatus, 'Searching Pexels…');
  els.pexelsResults.innerHTML = '';
  try {
    const items = await searchPexels(els.pexelsQuery.value.trim() || 'nature', key);
    if (!items.length) { setStatus(els.bgStatus, 'No clips found. Try another word.'); return; }
    setStatus(els.bgStatus, 'Tap a clip to use it.');
    for (const it of items) {
      const b = resultButton(it, `${it.duration}s`);
      b.title = it.author ? `Video by ${it.author} on Pexels` : 'Pexels video';
      b.onclick = async () => {
        setStatus(els.bgStatus, 'Downloading clip…');
        try {
          const v = await loadPexelsVideo(it, (p) => setStatus(els.bgStatus, `Downloading clip… ${Math.round(p * 100)}%`));
          await useVideo(v, b);
          setCredit(`Background video by ${it.author || 'a Pexels creator'} on Pexels (free to use, credit appreciated).`);
          setStatus(els.bgStatus, `Using a clip by ${it.author || 'a Pexels creator'} (Pexels).`);
        } catch (e) {
          setStatus(els.bgStatus, e.message, true);
        }
      };
      els.pexelsResults.append(b);
    }
  } catch (e) {
    setStatus(els.bgStatus, e.message, true);
  }
}

// ---------- export
els.export.onclick = async () => {
  if (!state.reel || state.exporting) return;
  stop();
  const abort = new AbortController();
  state.exporting = abort;
  els.export.disabled = els.load.disabled = true;
  els.cancel.hidden = false;
  els.progress.hidden = false;
  els.progress.value = 0;
  els.download.hidden = true;
  const opts = renderOpts();
  const t0 = performance.now();
  try {
    const fast = await webCodecsSupport();
    setStatus(els.exportStatus, fast ? 'Creating MP4…' : 'Recording in real time (your browser lacks fast export)…');
    const onProgress = (p) => {
      els.progress.value = p;
      // keep the preview alive so people can see something is happening
      drawFrame(ctx, state.reel, p * state.reel.duration, opts);
    };
    const blob = fast
      ? await exportWebCodecs(state.reel, opts, { onProgress, signal: abort.signal })
      : await exportRealtime(state.reel, opts, { onProgress, signal: abort.signal });
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    if (els.download.href) URL.revokeObjectURL(els.download.href);
    els.download.href = URL.createObjectURL(blob);
    els.download.download = `quran-${state.meta.slug}.${ext}`;
    els.download.hidden = false;
    window.lastExport = blob; // handy for debugging
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setStatus(els.exportStatus, `Done in ${secs}s · ${(blob.size / 1e6).toFixed(1)} MB${ext === 'webm' ? ' (WebM: use Chrome or Safari for MP4)' : ''}.`);
  } catch (e) {
    console.error(e);
    setStatus(els.exportStatus, e.name === 'AbortError' ? 'Cancelled.' : `Export failed: ${e.message}`, e.name !== 'AbortError');
  } finally {
    state.exporting = null;
    els.export.disabled = els.load.disabled = false;
    els.cancel.hidden = true;
    els.progress.hidden = true;
  }
};
els.cancel.onclick = () => state.exporting?.abort();
