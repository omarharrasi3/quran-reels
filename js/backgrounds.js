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
