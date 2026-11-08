// Quran text/translation from api.alquran.cloud, audio from everyayah.com (both CORS-enabled).

const API = 'https://api.alquran.cloud/v1';
const AUDIO_HOSTS = ['https://everyayah.com/data', 'https://mirrors.quranicaudio.com/everyayah'];

export const RECITERS = [
  { id: 'Alafasy_128kbps', name: 'Mishary Rashid Alafasy' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'Abdul Basit (Murattal)' },
  { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'Abdurrahman As-Sudais' },
  { id: 'MaherAlMuaiqly128kbps', name: 'Maher Al-Muaiqly' },
  { id: 'Yasser_Ad-Dussary_128kbps', name: 'Yasser Ad-Dossari' },
  { id: 'Husary_128kbps', name: 'Mahmoud Khalil Al-Husary' },
  { id: 'Minshawy_Murattal_128kbps', name: 'Mohamed Siddiq Al-Minshawi' },
  { id: 'Saood_ash-Shuraym_128kbps', name: 'Saud Ash-Shuraim' },
  { id: 'Nasser_Alqatami_128kbps', name: 'Nasser Al-Qatami' },
  { id: 'Hudhaify_128kbps', name: 'Ali Al-Hudhaify' },
  { id: 'ahmed_ibn_ali_al_ajamy_128kbps', name: 'Ahmed Al-Ajmi' },
  { id: 'Abu_Bakr_Ash-Shaatree_128kbps', name: 'Abu Bakr Ash-Shatri' },
  { id: 'Muhammad_Ayyoub_128kbps', name: 'Muhammad Ayyoub' },
  { id: 'Ghamadi_40kbps', name: 'Saad Al-Ghamdi' },
];

export const BASMALA_AR = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
export const BASMALA_EN = 'In the name of Allah, the Entirely Merciful, the Especially Merciful.';

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.data || 'Quran API error');
  return json.data;
}

let surahCache = null;
export async function getSurahs() {
  if (!surahCache) surahCache = await getJSON(`${API}/surah`);
  return surahCache;
}

/** Returns [{ numberInSurah, arabic, english }] for ayat from..to (inclusive). */
export async function getVerses(surah, from, to) {
  const data = await getJSON(
    `${API}/surah/${surah}/editions/quran-uthmani,en.sahih?offset=${from - 1}&limit=${to - from + 1}`
  );
  const [ar, en] = data;
  return ar.ayahs.map((a, i) => {
    let arabic = a.text.replace(/﻿/g, '').trim();
    // Ayah 1 of every surah except Al-Fatiha (1) and At-Tawbah (9) carries the basmala prefix in this edition,
    // but the recitation audio for that ayah does not, so strip it from the text.
    if (a.numberInSurah === 1 && surah !== 1 && surah !== 9) {
      const words = arabic.split(/\s+/);
      if (words[0].startsWith('بِسْمِ')) arabic = words.slice(4).join(' ');
    }
    return { numberInSurah: a.numberInSurah, arabic, english: en.ayahs[i].text.trim() };
  });
}

const pad3 = (n) => String(n).padStart(3, '0');

export function audioUrl(reciterId, surah, ayah, hostIndex = 0) {
  return `${AUDIO_HOSTS[hostIndex]}/${reciterId}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

/** Fetch an ayah mp3 as ArrayBuffer, falling back to the mirror. */
export async function fetchAyahAudio(reciterId, surah, ayah) {
  let lastErr;
  for (let h = 0; h < AUDIO_HOSTS.length; h++) {
    try {
      const res = await fetch(audioUrl(reciterId, surah, ayah, h));
      if (res.ok) return await res.arrayBuffer();
      lastErr = new Error(`Audio ${surah}:${ayah} returned ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function toArabicDigits(n) {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
}
