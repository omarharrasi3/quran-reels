// Background clips: user upload or Pexels search (user's own free API key, stored only in this browser).

const KEY_STORAGE = 'qr.pexelsKey';

export function getPexelsKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}
export function setPexelsKey(k) {
  try { localStorage.setItem(KEY_STORAGE, k); } catch { /* private mode: key lives for this page only */ }
}

/** Creates a looping, muted <video> from a Blob/File and resolves once it can be drawn. */
export function videoFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = URL.createObjectURL(blob);
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('This video file could not be played. Try an MP4 (H.264) clip.'));
  });
}

export async function searchPexels(query, key) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=18`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (res.status === 401 || res.status === 403) throw new Error('Pexels rejected the API key. Check it and try again.');
  if (!res.ok) throw new Error(`Pexels search failed (${res.status}).`);
  const data = await res.json();
  return data.videos.map((v) => ({
    id: v.id,
    thumb: v.image,
    duration: v.duration,
    author: v.user?.name,
    pageUrl: v.url,
    file: pickFile(v.video_files),
  })).filter((v) => v.file);
}

// Prefer an mp4 close to 1080 wide; avoid huge 4K downloads.
function pickFile(files) {
  const mp4 = files.filter((f) => f.file_type === 'video/mp4' && f.width && f.height);
  if (!mp4.length) return null;
  const score = (f) => Math.abs(f.width - 1080) + (f.height < f.width ? 5000 : 0);
  return mp4.sort((a, b) => score(a) - score(b))[0];
}

// ---------- Wikimedia Commons: free-licensed clips, no account or key needed

const stripHtml = (s) => {
  const d = document.createElement('div');
  d.innerHTML = s || '';
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
};

// Best browser-playable file: a WebM/MP4 transcode (or original) of at least 480p, preferring ~1080p.
function pickCommonsFile(v) {
  const options = (v.derivatives || [])
    .filter((d) => /video\/(webm|mp4)/.test(d.type) && !/ogg|theora/.test(d.type))
    .map((d) => ({ src: d.src, height: Number(d.height) || 0 }));
  if (/video\/(webm|mp4)/.test(v.mime) && v.size < 80e6) options.push({ src: v.url, height: v.height });
  const ok = options.filter((o) => o.height >= 480);
  if (!ok.length) return null;
  return ok.sort((a, b) => Math.abs(a.height - 1080) - Math.abs(b.height - 1080))[0];
}

export async function searchCommons(query) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: '40',
    gsrsearch: `${query} filetype:video`,
    prop: 'videoinfo', viprop: 'url|size|mime|derivatives|extmetadata',
    viextmetadatafilter: 'LicenseShortName|Artist', viurlwidth: '240',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!res.ok) throw new Error(`Search failed (${res.status}).`);
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
  return pages.map((p) => {
    const v = p.videoinfo?.[0];
    if (!v) return null;
    const file = pickCommonsFile(v);
    if (!file || (v.duration && v.duration < 4)) return null;
    const m = v.extmetadata || {};
    return {
      id: p.pageid,
      title: p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
      thumb: v.thumburl,
      duration: Math.round(v.duration || 0),
      hd: file.height >= 720,
      file,
      author: stripHtml(m.Artist?.value) || 'Unknown author',
      license: stripHtml(m.LicenseShortName?.value) || 'see Commons page',
      pageUrl: v.descriptionurl,
    };
  }).filter(Boolean)
    .sort((a, b) => Number(b.hd) - Number(a.hd)) // HD first, otherwise keep search relevance
    .slice(0, 18);
}

/** Download any CORS-enabled video URL into a blob-backed <video>. */
export async function loadVideoUrl(url, onProgress = () => {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the clip (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress(got / total);
  }
  return videoFromBlob(new Blob(parts, { type: res.headers.get('content-type') || 'video/webm' }));
}

/** Downloads the Pexels clip into the browser so the canvas can use it for export. */
export async function loadPexelsVideo(item, onProgress = () => {}) {
  let res;
  try {
    res = await fetch(item.file.link);
  } catch {
    throw new Error('Pexels blocked loading this clip directly. Download it from Pexels and use "Upload clip" instead.');
  }
  if (!res.ok) throw new Error(`Could not download the clip (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress(got / total);
  }
  return videoFromBlob(new Blob(parts, { type: 'video/mp4' }));
}
