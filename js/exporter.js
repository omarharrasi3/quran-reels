// MP4 export: WebCodecs (H.264 + AAC) muxed with mp4-muxer, faster than real time.
// Falls back to real-time MediaRecorder capture when WebCodecs/AAC isn't available.

import { drawFrame, W, H } from './renderer.js';
import { SAMPLE_RATE } from './timeline.js';

const VIDEO_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'];
const MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.61.6/dist/bundles/mediabunny.min.mjs';
const MAX_QUEUE = 8; // frames waiting for the encoder
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

// Browsers slow timers to about once a second in a tab you're not looking at. Message events and the
// encoder's own "dequeue" event aren't slowed, so the export keeps its speed if you switch tabs.
function nextTask() {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => { port1.close(); resolve(); };
    port2.postMessage(0);
  });
}

function encoderHasRoom(encoder) {
  return new Promise((resolve) => {
    const done = () => { encoder.removeEventListener('dequeue', done); clearTimeout(backstop); resolve(); };
    const backstop = setTimeout(done, 100); // browsers without the dequeue event, or a failed encoder
    encoder.addEventListener('dequeue', done);
  });
}

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
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
      const cur = v.currentTime;
      if (cur > target + 0.1) { if (!v.paused) v.pause(); return; } // ahead: wait for the encoder
      if (cur >= target - 0.02 || v.ended) return;
      if (v.paused) await v.play().catch(() => {});
      if (target - cur > 1) { await seek(v, target); continue; } // far behind (slow decoder): jump
      await (document.hidden ? nextTask() : sleep(2));
    }
  }
  async stop() {
    this.v.pause();
    this.v.playbackRate = 1;
    this.v.loop = true;
  }
}

/**
 * Reads the clip's frames straight from the file, as fast as the computer can decode them and with
 * exact timing. Playing the clip (BackgroundDriver) can't go past about double speed without
 * skipping frames, so it stays only as the fallback for files this can't read.
 */
class ClipFrames {
  static async open(video) {
    const { Input, ALL_FORMATS, BlobSource, VideoSampleSink } = await import(MEDIABUNNY);
    const blob = await (await fetch(video.src)).blob();
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    return new ClipFrames(new VideoSampleSink(track));
  }
  constructor(sink) {
    this.sink = sink;
    this.current = null;
    this.next = null;
    this.iter = null;
    this.last = Infinity;
  }
  async pull() {
    const { value, done } = await this.iter.next();
    return done ? null : value;
  }
  async restart() {
    this.close();
    this.iter = this.sink.samples();
    this.current = await this.pull();
    this.next = this.current ? await this.pull() : null;
    if (!this.current) throw new Error('The clip has no readable frames.');
  }
  /** Moves `current` to the frame showing at time t (t only goes back when the clip loops). */
  async seek(t) {
    if (t < this.last) await this.restart();
    this.last = t;
    while (this.next && this.next.timestamp <= t) {
      this.current.close();
      this.current = this.next;
      this.next = await this.pull();
    }
  }
  close() {
    this.current?.close();
    this.next?.close();
    this.current = this.next = null;
    this.iter?.return();
    this.iter = null;
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
  const hasClip = video && video.duration;
  let clip = null;
  if (hasClip) {
    try { clip = await ClipFrames.open(video); } catch (e) { console.warn('Using the slower clip path:', e); }
  }
  let bg = hasClip && !clip ? new BackgroundDriver(video) : null;
  if (video) video.pause();
  if (bg) await bg.start();

  const total = Math.ceil(reel.duration * fps);
  const frameDur = 1e6 / fps;
  let lastBreath = performance.now();
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (encErr) throw encErr;
      const t = i / fps;
      if (clip) {
        try {
          await clip.seek(t % video.duration);
        } catch (e) {
          console.warn('Switching to the slower clip path:', e);
          clip.close();
          clip = null;
          bg = new BackgroundDriver(video);
          await bg.start();
        }
      }
      if (bg) await bg.goto(t % video.duration);
      drawFrame(ctx, reel, t, clip ? { ...opts, video: null, frame: clip.current } : opts);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (videoEncoder.encodeQueueSize > MAX_QUEUE && !encErr) await encoderHasRoom(videoEncoder);
      if (performance.now() - lastBreath > 250) {
        // A few times a second: update the progress bar and let Cancel respond.
        onProgress(i / total, canvas);
        await nextTask();
        lastBreath = performance.now();
      }
    }
    await videoEncoder.flush();
    await audioEncoder.flush();
    if (encErr) throw encErr;
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    if (audioEncoder.state !== 'closed') audioEncoder.close();
    clip?.close();
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
