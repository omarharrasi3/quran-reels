// Builds the reel timeline: which text is on screen when, plus the joined audio track.
// This is the single place to extend later (e.g. word-by-word timings).

import { getVerses, fetchAyahAudio, getTranslation, BASMALA_AR, BASMALA_EN } from './quran-api.js';

export const SAMPLE_RATE = 48000;

/**
 * @returns {Promise<{segments: Array<{start,end,arabic,english,ayahNo}>, audio: AudioBuffer, duration: number}>}
 */
export async function buildReel({ surah, from, to, reciterId, withBasmala, translation = 'en.sahih' }, onProgress = () => {}) {
  const tr = getTranslation(translation);
  const [verses, basmalaTr] = await Promise.all([
    getVerses(surah, from, to, tr.id),
    // The basmala in the chosen language is Al-Fatiha 1:1 (a tafsir explains the whole surah there, so skip it).
    withBasmala && tr.id && tr.id !== 'en.sahih' && !tr.tafsir
      ? getVerses(1, 1, 1, tr.id).then((v) => v[0].english)
      : null,
  ]);
  const items = verses.map((v) => ({ ...v, audioRef: [surah, v.numberInSurah] }));
  if (withBasmala) {
    // Basmala recitation = Al-Fatiha 1:1 by the same reciter.
    const english = tr.id === 'en.sahih' ? BASMALA_EN : basmalaTr || '';
    items.unshift({ numberInSurah: null, arabic: BASMALA_AR, english, audioRef: [1, 1] });
  }

  // Decode at a fixed sample rate so all clips can be concatenated and encoded directly.
  const decoder = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  let done = 0;
  const buffers = await Promise.all(
    items.map(async (it) => {
      const raw = await fetchAyahAudio(reciterId, ...it.audioRef);
      const buf = await decoder.decodeAudioData(raw);
      onProgress(++done / items.length);
      return buf;
    })
  );

  const totalFrames = buffers.reduce((s, b) => s + b.length, 0);
  const audio = new AudioBuffer({ length: totalFrames, numberOfChannels: 2, sampleRate: SAMPLE_RATE });
  const segments = [];
  let offset = 0;
  items.forEach((it, i) => {
    const b = buffers[i];
    for (let ch = 0; ch < 2; ch++) {
      audio.copyToChannel(b.getChannelData(Math.min(ch, b.numberOfChannels - 1)), ch, offset);
    }
    segments.push({
      start: offset / SAMPLE_RATE,
      end: (offset + b.length) / SAMPLE_RATE,
      arabic: it.arabic,
      english: it.english,
      ayahNo: it.numberInSurah,
    });
    offset += b.length;
  });

  shareGroupedText(segments);
  return { segments, audio, duration: totalFrames / SAMPLE_RATE };
}

export function segmentAt(segments, t) {
  for (const s of segments) if (t >= s.start && t < s.end) return s;
  return segments[segments.length - 1];
}

/**
 * A tafsir often explains several ayat in one passage, so the same text comes back for each of them.
 * Instead of repeating it, spread its words over those ayat in proportion to how long each is recited.
 */
function shareGroupedText(segments) {
  for (let i = 0; i < segments.length; ) {
    let j = i + 1;
    while (j < segments.length && segments[i].english && segments[j].english === segments[i].english) j++;
    if (j - i > 1) {
      const run = segments.slice(i, j);
      const words = run[0].english.split(/\s+/);
      const total = run.reduce((t, s) => t + (s.end - s.start), 0);
      let used = 0;
      let time = 0;
      run.forEach((s, k) => {
        time += s.end - s.start;
        const upto = k === run.length - 1 ? words.length : Math.round((words.length * time) / total);
        s.english = words.slice(used, Math.max(upto, used + 1)).join(' ');
        used = Math.max(upto, used + 1);
      });
    }
    i = j;
  }
}
