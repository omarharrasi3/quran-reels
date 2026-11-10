// Quran text/translation from api.alquran.cloud, audio from everyayah.com (both CORS-enabled).

const API = 'https://api.alquran.cloud/v1';
const AUDIO_HOSTS = ['https://everyayah.com/data', 'https://mirrors.quranicaudio.com/everyayah'];

// Folders on everyayah.com. Each one was checked to have the whole Quran and to allow use from other websites.
export const RECITERS = [
  { id: 'Alafasy_128kbps', name: 'Mishary Rashid Alafasy', nameAr: 'مشاري راشد العفاسي' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'Abdul Basit (Murattal)', nameAr: 'عبد الباسط عبد الصمد (مرتل)' },
  { id: 'Abdul_Basit_Mujawwad_128kbps', name: 'Abdul Basit (Mujawwad)', nameAr: 'عبد الباسط عبد الصمد (مجود)' },
  { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'Abdurrahman As-Sudais', nameAr: 'عبد الرحمن السديس' },
  { id: 'Saood_ash-Shuraym_128kbps', name: 'Saud Ash-Shuraim', nameAr: 'سعود الشريم' },
  { id: 'MaherAlMuaiqly128kbps', name: 'Maher Al-Muaiqly', nameAr: 'ماهر المعيقلي' },
  { id: 'Yasser_Ad-Dussary_128kbps', name: 'Yasser Ad-Dossari', nameAr: 'ياسر الدوسري' },
  { id: 'Salah_Al_Budair_128kbps', name: 'Salah Al-Budair', nameAr: 'صلاح البدير' },
  { id: 'Hudhaify_128kbps', name: 'Ali Al-Hudhaify', nameAr: 'علي الحذيفي' },
  { id: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps', name: 'Abdullah Al-Juhany', nameAr: 'عبد الله الجهني' },
  { id: 'Khaalid_Abdullaah_al-Qahtaanee_192kbps', name: 'Khalid Al-Qahtani', nameAr: 'خالد القحطاني' },
  { id: 'Muhsin_Al_Qasim_192kbps', name: 'Muhsin Al-Qasim', nameAr: 'محسن القاسم' },
  { id: 'Husary_128kbps', name: 'Mahmoud Khalil Al-Husary', nameAr: 'محمود خليل الحصري' },
  { id: 'Husary_128kbps_Mujawwad', name: 'Al-Husary (Mujawwad)', nameAr: 'الحصري (مجود)' },
  { id: 'Husary_Muallim_128kbps', name: 'Al-Husary (Teaching)', nameAr: 'الحصري (المعلم)' },
  { id: 'Minshawy_Murattal_128kbps', name: 'Mohamed Siddiq Al-Minshawi', nameAr: 'محمد صديق المنشاوي' },
  { id: 'Minshawy_Mujawwad_192kbps', name: 'Al-Minshawi (Mujawwad)', nameAr: 'المنشاوي (مجود)' },
  { id: 'Mohammad_al_Tablaway_128kbps', name: 'Mohammad Al-Tablawi', nameAr: 'محمد الطبلاوي' },
  { id: 'mahmoud_ali_al_banna_32kbps', name: 'Mahmoud Ali Al-Banna', nameAr: 'محمود علي البنا' },
  { id: 'Nasser_Alqatami_128kbps', name: 'Nasser Al-Qatami', nameAr: 'ناصر القطامي' },
  { id: 'ahmed_ibn_ali_al_ajamy_128kbps', name: 'Ahmed Al-Ajmi', nameAr: 'أحمد العجمي' },
  { id: 'Abu_Bakr_Ash-Shaatree_128kbps', name: 'Abu Bakr Ash-Shatri', nameAr: 'أبو بكر الشاطري' },
  { id: 'Muhammad_Ayyoub_128kbps', name: 'Muhammad Ayyoub', nameAr: 'محمد أيوب' },
  { id: 'Muhammad_Jibreel_128kbps', name: 'Muhammad Jibreel', nameAr: 'محمد جبريل' },
  { id: 'Ghamadi_40kbps', name: 'Saad Al-Ghamdi', nameAr: 'سعد الغامدي' },
  { id: 'Hani_Rifai_192kbps', name: 'Hani Ar-Rifai', nameAr: 'هاني الرفاعي' },
  { id: 'Abdullah_Basfar_192kbps', name: 'Abdullah Basfar', nameAr: 'عبد الله بصفر' },
  { id: 'Abdullah_Matroud_128kbps', name: 'Abdullah Matroud', nameAr: 'عبد الله مطرود' },
  { id: 'Salaah_AbdulRahman_Bukhatir_128kbps', name: 'Salah Bukhatir', nameAr: 'صلاح بو خاطر' },
  { id: 'Fares_Abbad_64kbps', name: 'Fares Abbad', nameAr: 'فارس عباد' },
  { id: 'Ahmed_Neana_128kbps', name: 'Ahmed Neana', nameAr: 'أحمد نعينع' },
  { id: 'Akram_AlAlaqimy_128kbps', name: 'Akram Al-Alaqimy', nameAr: 'أكرم العلاقمي' },
  { id: 'Ali_Jaber_64kbps', name: 'Ali Jaber', nameAr: 'علي جابر' },
  { id: 'Ali_Hajjaj_AlSuesy_128kbps', name: 'Ali Hajjaj As-Suesy', nameAr: 'علي حجاج السويسي' },
  { id: 'Ayman_Sowaid_64kbps', name: 'Ayman Swaid', nameAr: 'أيمن سويد' },
  { id: 'aziz_alili_128kbps', name: 'Aziz Alili', nameAr: 'عزيز عليلي' },
  { id: 'khalefa_al_tunaiji_64kbps', name: 'Khalifa Al-Tunaiji', nameAr: 'خليفة الطنيجي' },
  { id: 'Muhammad_AbdulKareem_128kbps', name: 'Muhammad Abdulkareem', nameAr: 'محمد عبد الكريم' },
  { id: 'Sahl_Yassin_128kbps', name: 'Sahl Yassin', nameAr: 'سهل ياسين' },
  { id: 'Yaser_Salamah_128kbps', name: 'Yaser Salamah', nameAr: 'ياسر سلامة' },
  { id: 'Karim_Mansoori_40kbps', name: 'Karim Mansoori', nameAr: 'كريم منصوري' },
  { id: 'Parhizgar_48kbps', name: 'Shahriar Parhizgar', nameAr: 'شهريار پرهيزگار' },
  { id: 'warsh/warsh_Abdul_Basit_128kbps', name: 'Abdul Basit (Warsh)', nameAr: 'عبد الباسط (ورش)', warsh: true },
  { id: 'warsh/warsh_ibrahim_aldosary_128kbps', name: 'Ibrahim Ad-Dosary (Warsh)', nameAr: 'إبراهيم الدوسري (ورش)', warsh: true },
  { id: 'warsh/warsh_yassin_al_jazaery_64kbps', name: 'Yassin Al-Jazaery (Warsh)', nameAr: 'ياسين الجزائري (ورش)', warsh: true },
];

// Translations shown under the Arabic. script picks the font and writing direction on the reel.
export const TRANSLATIONS = [
  { id: '', name: 'No translation' },
  { id: 'ar.muyassar', lang: 'العربية', name: 'التفسير الميسر (tafsir)', script: 'arabic', tafsir: true },
  { id: 'en.sahih', lang: 'English', name: 'Sahih International' },
  { id: 'en.itani', lang: 'English', name: "The Clear Qur'an (Talal Itani)" },
  { id: 'en.hilali', lang: 'English', name: 'Hilali & Muhsin Khan' },
  { id: 'en.yusufali', lang: 'English', name: 'Abdullah Yusuf Ali' },
  { id: 'en.pickthall', lang: 'English', name: 'Marmaduke Pickthall' },
  { id: 'ur.jalandhry', lang: 'اردو Urdu', name: 'Fateh Muhammad Jalandhry', script: 'urdu' },
  { id: 'ur.junagarhi', lang: 'اردو Urdu', name: 'Muhammad Junagarhi', script: 'urdu' },
  { id: 'fa.fooladvand', lang: 'فارسی Persian', name: 'Fooladvand', script: 'arabic' },
  { id: 'ps.abdulwali', lang: 'پښتو Pashto', name: 'Abdul Wali', script: 'arabic' },
  { id: 'fr.hamidullah', lang: 'Français', name: 'Muhammad Hamidullah' },
  { id: 'es.cortes', lang: 'Español', name: 'Julio Cortés' },
  { id: 'de.bubenheim', lang: 'Deutsch', name: 'Bubenheim & Elyas' },
  { id: 'tr.diyanet', lang: 'Türkçe', name: 'Diyanet İşleri' },
  { id: 'id.indonesian', lang: 'Bahasa Indonesia', name: 'Kementerian Agama' },
  { id: 'ms.basmeih', lang: 'Bahasa Melayu', name: 'Abdullah Basmeih' },
  { id: 'bn.bengali', lang: 'বাংলা Bengali', name: 'Muhiuddin Khan' },
  { id: 'hi.hindi', lang: 'हिन्दी Hindi', name: 'Farooq Khan & Nadwi' },
  { id: 'ru.kuliev', lang: 'Русский', name: 'Elmir Kuliev' },
  { id: 'pt.elhayek', lang: 'Português', name: 'Samir El-Hayek' },
  { id: 'it.piccardo', lang: 'Italiano', name: 'Hamza Piccardo' },
  { id: 'nl.siregar', lang: 'Nederlands', name: 'Sofian Siregar' },
  { id: 'bs.korkut', lang: 'Bosanski', name: 'Besim Korkut' },
  { id: 'sq.ahmeti', lang: 'Shqip', name: 'Sherif Ahmeti' },
  { id: 'sw.barwani', lang: 'Kiswahili', name: 'Ali Muhsin Al-Barwani' },
  { id: 'so.abduh', lang: 'Soomaali', name: 'Mahmud Abduh' },
  { id: 'ha.gumi', lang: 'Hausa', name: 'Abubakar Gumi' },
  { id: 'uz.sodik', lang: "O'zbek", name: 'Muhammad Sodik' },
  { id: 'az.mammadaliyev', lang: 'Azərbaycan', name: 'Mammadaliyev & Bunyadov' },
  { id: 'sv.bernstrom', lang: 'Svenska', name: 'Knut Bernström' },
  { id: 'ta.tamil', lang: 'தமிழ் Tamil', name: 'Jan Trust Foundation' },
  { id: 'ml.abdulhameed', lang: 'മലയാളം Malayalam', name: 'Abdul Hameed & Parappoor' },
];
export const getTranslation = (id) => TRANSLATIONS.find((t) => t.id === id) || TRANSLATIONS[0];

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

/**
 * Returns [{ numberInSurah, arabic, english }] for ayat from..to (inclusive).
 * `english` holds the chosen translation (any language), or '' when none is chosen.
 */
export async function getVerses(surah, from, to, translation = 'en.sahih') {
  const editions = translation ? `quran-uthmani,${translation}` : 'quran-uthmani';
  const data = await getJSON(
    `${API}/surah/${surah}/editions/${editions}?offset=${from - 1}&limit=${to - from + 1}`
  );
  const [ar, en] = data;
  return ar.ayahs.map((a, i) => {
    // Drop the BOM and the mushaf page markers ۞ (rub el hizb) and ۩ (sajdah sign), which render as stray symbols.
    let arabic = a.text.replace(/[﻿۞۩]/g, '').replace(/\s+/g, ' ').trim();
    // Ayah 1 of every surah except Al-Fatiha (1) and At-Tawbah (9) carries the basmala prefix in this edition,
    // but the recitation audio for that ayah does not, so strip it from the text.
    if (a.numberInSurah === 1 && surah !== 1 && surah !== 9) {
      const words = arabic.split(/\s+/);
      if (words[0].startsWith('بِسْمِ')) arabic = words.slice(4).join(' ');
    }
    return { numberInSurah: a.numberInSurah, arabic, english: en ? cleanTranslation(en.ayahs[i].text, translation) : '' };
  });
}

function cleanTranslation(text, id) {
  let t = text.replace(/\s+/g, ' ').trim();
  // The Urdu Nastaliq font draws the ﷺ ligature very large, so spell it out.
  if (id.startsWith('ur.')) t = t.replace(/\uFDFA/g, 'صلی اللہ علیہ وسلم');
  return t;
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
