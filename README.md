# Quran Reels Maker

A web page that makes Quran recitation reels (1080×1920 MP4) for Instagram, entirely in the browser. There is no server and no install.

## How to use it
1. **Verses:** pick a surah, the ayah range and a reciter, then press **Load verses**.
2. **Background:** you have three options:
   - Upload a nature clip.
   - Search Pexels. This needs a free API key from https://www.pexels.com/api/, which is saved only in your browser.
   - Keep the plain gradient.
3. **Text:** turn the English translation, the surah name and the reciter name on or off, and add your @handle.
4. **Export:** press **Create MP4**, then **Download video**. Post it as a Reel.

Best in **Chrome** or **Safari** on a computer. Their fast export makes the video in a fraction of its length. Other browsers fall back to real-time recording.

Long ayat (e.g. Ayat al-Kursi) are split into timed pages automatically. Reels over 3 minutes trigger a warning.

## Sources
- Arabic text: Tanzil Uthmani, via api.alquran.cloud
- Translation: Sahih International, via api.alquran.cloud
- Recitation audio: everyayah.com (with the quranicaudio.com mirror as a fallback)
- Fonts: Amiri Quran and Inter (Google Fonts)
- MP4 writing: mp4-muxer

## Run it locally
The page uses JS modules, so it must be served over http, not opened as a file:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Put it online (free)
**GitHub Pages:**
1. Create a repository and push these files.
2. Go to Settings → Pages → *Deploy from a branch* → `main` / root.
3. The site goes live at `https://<user>.github.io/<repo>/`.

**Netlify Drop:** drag this folder onto https://app.netlify.com/drop.

## Code map
| File | Role |
|---|---|
| `js/quran-api.js` | Surah list, verse text and translation, reciter list, audio fetch |
| `js/timeline.js` | Joins the ayah audio and builds the on-screen timing (extend here for word-by-word) |
| `js/renderer.js` | Draws one frame: background, overlay, text layout and paging, header and footer |
| `js/exporter.js` | WebCodecs H.264/AAC → MP4, with a MediaRecorder fallback |
| `js/backgrounds.js` | Clip upload and Pexels search |
| `js/app.js` | UI wiring, preview playback |
