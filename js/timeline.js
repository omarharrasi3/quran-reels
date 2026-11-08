// Builds the reel timeline: which text is on screen when, plus the joined audio track.
// This is the single place to extend later (e.g. word-by-word timings).

import { getVerses, fetchAyahAudio, BASMALA_AR, BASMALA_EN } from './quran-api.js';

export const SAMPLE_RATE = 48000;

/**
 * @returns {Promise<{segments: Array<{start,end,arabic,english,ayahNo}>, audio: AudioBuffer, duration: number}>}
 */
export async function buildReel({ surah, from, to, reciterId, withBasmala }, onProgress = () => {}) {
  const verses = await getVerses(surah, from, to);
  const items = verses.map((v) => ({ ...v, audioRef: [surah, v.numberInSurah] }));
  if (withBasmala) {
    // Basmala recitation = Al-Fatiha 1:1 by the same reciter.
    items.unshift({ numberInSurah: null, arabic: BASMALA_AR, english: BASMALA_EN, audioRef: [1, 1] });
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

  return { segments, audio, duration: totalFrames / SAMPLE_RATE };
}

export function segmentAt(segments, t) {
  for (const s of segments) if (t >= s.start && t < s.end) return s;
  return segments[segments.length - 1];
}
