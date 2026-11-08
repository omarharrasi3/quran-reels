// MP4 export: WebCodecs (H.264 + AAC) muxed with mp4-muxer, faster than real time.
// Falls back to real-time MediaRecorder capture when WebCodecs/AAC isn't available.

import { drawFrame, W, H } from './renderer.js';
import { SAMPLE_RATE } from './timeline.js';

const VIDEO_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'];
const AAC = { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 160_000 };

export async function webCodecsSupport() {
  if (!('VideoEncoder' in window) || !('AudioEncoder' in window) || !window.Mp4Muxer) return null;
  let video = null;
  for (const codec of VIDEO_CODECS) {
    const cfg = { codec, width: W, height: H, bitrate: 10_000_000, framerate: 30, avc: { format: 'avc' } };
    try {
      if ((await VideoEncoder.isConfigSupported(cfg)).supported) { video = cfg; break; }
    } catch { /* try next */ }
  }
  if (!video) return null;
  try {
    if (!(await AudioEncoder.isConfigSupported(AAC)).supported) return null;
  } catch { return null; }
  return { video, audio: AAC };
}

function seek(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001) return resolve();
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = time;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Keeps the background clip near a target time by *playing* it (fast) instead of seeking every frame
 * (seeking costs ~50 ms per frame). The drawn frame stays within ~0.1 s of the ideal one.
 */
class BackgroundDriver {
  constructor(video) {
    this.v = video;
    this.last = 0;
  }
  async start() {
    this.v.loop = false;
    this.v.playbackRate = 2;
    await seek(this.v, 0);
    await this.v.play().catch(() => {});
  }
  async goto(target) {
    const v = this.v;
    if (target < this.last) {
      // reel time wrapped past the end of the clip: restart it
      v.pause();
      await seek(v, 0);
      await v.play().catch(() => {});
    }
    this.last = target;
    for (let guard = 0; guard < 500; guard++) {
      const cur = v.currentTime;
      if (cur > target + 0.1) { if (!v.paused) v.pause(); return; } // ahead: wait for the encoder
      if (cur >= target - 0.02 || v.ended) return;
      if (v.paused) await v.play().catch(() => {});
      if (target - cur > 1) { await seek(v, target); continue; } // far behind (slow decoder): jump
      await sleep(4);
    }
  }
  async stop() {
    this.v.pause();
    this.v.playbackRate = 1;
    this.v.loop = true;
  }
}

/** Video bitrate that keeps the whole file under maxBytes (with ~12% safety margin for container + VBR swings). */
export function bitrateForSize(maxBytes, duration, audioBitrate = AAC.bitrate) {
  const total = (maxBytes * 8 * 0.88) / Math.max(1, duration);
  return Math.max(800_000, Math.min(10_000_000, Math.round(total - audioBitrate)));
}

export async function exportWebCodecs(reel, opts, { fps = 30, onProgress = () => {}, signal, maxBytes } = {}) {
  const support = await webCodecsSupport();
  if (!support) throw new Error('WebCodecs H.264/AAC encoding is not available in this browser.');
  if (maxBytes) support.video.bitrate = bitrateForSize(maxBytes, reel.duration);

  const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: SAMPLE_RATE },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encErr = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encErr = e; },
  });
  videoEncoder.configure({ ...support.video, framerate: fps });
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { encErr = e; },
  });
  audioEncoder.configure(support.audio);

  // --- audio: feed the whole joined track in 1024-frame blocks
  const { audio } = reel;
  const L = audio.getChannelData(0);
  const R = audio.getChannelData(1);
  const BLOCK = 1024;
  for (let i = 0; i < audio.length; i += BLOCK) {
    const n = Math.min(BLOCK, audio.length - i);
    const data = new Float32Array(n * 2);
    data.set(L.subarray(i, i + n), 0);
    data.set(R.subarray(i, i + n), n);
    const ad = new AudioData({
      format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2,
      timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data,
    });
    audioEncoder.encode(ad);
    ad.close();
  }

  // --- video: render each frame deterministically
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const video = opts.video;
  const wasPaused = video ? video.paused : true;
  const bg = video && video.duration ? new BackgroundDriver(video) : null;
  if (video) video.pause();
  if (bg) await bg.start();

  const total = Math.ceil(reel.duration * fps);
  const frameDur = 1e6 / fps;
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (encErr) throw encErr;
      const t = i / fps;
      if (bg) await bg.goto(t % video.duration);
      drawFrame(ctx, reel, t, opts);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (videoEncoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      if (i % 5 === 0) onProgress(i / total);
    }
    await videoEncoder.flush();
    await audioEncoder.flush();
    if (encErr) throw encErr;
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    if (audioEncoder.state !== 'closed') audioEncoder.close();
    if (bg) await bg.stop();
    if (video && !wasPaused) video.play().catch(() => {});
  }
  muxer.finalize();
  onProgress(1);
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

/** Real-time fallback using MediaRecorder. Produces MP4 where supported, otherwise WebM. */
export async function exportRealtime(reel, opts, { fps = 30, onProgress = () => {}, signal, maxBytes } = {}) {
  const types = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error('This browser cannot record video. Please use a recent Chrome or Safari.');

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const ac = new AudioContext({ sampleRate: SAMPLE_RATE });
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource();
  src.buffer = reel.audio;
  src.connect(dest);

  const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const videoBitsPerSecond = maxBytes ? bitrateForSize(maxBytes, reel.duration) : 10_000_000;
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));

  const video = opts.video;
  if (video) { video.currentTime = 0; video.loop = true; await video.play().catch(() => {}); }
  drawFrame(ctx, reel, 0, opts);
  rec.start(1000);
  const t0 = ac.currentTime;
  src.start();
  let raf;
  const tick = () => {
    const t = ac.currentTime - t0;
    drawFrame(ctx, reel, Math.min(t, reel.duration - 0.001), opts);
    onProgress(Math.min(1, t / reel.duration));
    if (signal?.aborted) { src.stop(); return; }
    raf = requestAnimationFrame(tick);
  };
  tick();
  await new Promise((r) => (src.onended = r));
  cancelAnimationFrame(raf);
  rec.stop();
  await stopped;
  ac.close();
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  return new Blob(chunks, { type: mimeType.split(';')[0] });
}
