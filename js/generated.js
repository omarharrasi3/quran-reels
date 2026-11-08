// Animated backgrounds drawn in code: no downloads, any length, and the same frame for preview and export.
// Each style is draw(ctx, t, W, H). Expensive static parts are cached per canvas size.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function stars(seed, n, W, H, maxY) {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({
    x: r() * W, y: r() * maxY, s: 0.8 + r() * 2.4, p: r() * 6.28, f: 0.6 + r() * 1.8,
  }));
}

function drawStars(ctx, list, t, base = 0.35) {
  ctx.fillStyle = '#fff';
  for (const s of list) {
    ctx.globalAlpha = base + (1 - base) * (0.5 + 0.5 * Math.sin(t * s.f + s.p));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.s, 0, 6.283);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- styles

function night(ctx, t, W, H) {
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, '#030817'], [0.55, '#0e1c3d'], [0.85, '#2c2a55'], [1, '#3b2d4f']]);
  ctx.fillRect(0, 0, W, H);
  drawStars(ctx, cached(`night-stars-${W}`, () => stars(7, 320, W, H, H * 0.8)), t);

  // crescent moon
  const moon = cached(`moon-${W}`, () => {
    const c = offscreen(320, 320);
    const m = c.getContext('2d');
    m.fillStyle = '#f6efd6';
    m.beginPath(); m.arc(160, 160, 78, 0, 6.283); m.fill();
    m.globalCompositeOperation = 'destination-out';
    m.beginPath(); m.arc(198, 140, 70, 0, 6.283); m.fill();
    return c;
  });
  glow(ctx, W * 0.74, H * 0.2, 260, 'rgba(246,239,214,0.35)');
  ctx.drawImage(moon, W * 0.74 - 160, H * 0.2 - 160);

  // shooting star every 9 s
  const k = t % 9;
  if (k < 1.1) {
    const p = k / 1.1;
    const x = W * (0.15 + 0.5 * p), y = H * (0.08 + 0.12 * p);
    const g = ctx.createLinearGradient(x, y, x - 220, y - 55);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - p)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 220, y - 55); ctx.stroke();
  }

  // hills
  const hills = (base, amp, f, ph, color) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.3 + ph * 2) * amp * 0.4);
    ctx.lineTo(W, H); ctx.fill();
  };
  hills(H * 0.86, 40, 0.004, 1, '#141a33');
  hills(H * 0.91, 30, 0.006, 3, '#0a0e1f');
}

function clouds(ctx, t, W, H) {
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, '#2f5d9c'], [0.5, '#7aa7d6'], [0.82, '#f2c79a'], [1, '#f39a72']]);
  ctx.fillRect(0, 0, W, H);
  glow(ctx, W * 0.5, H * 0.95, 900, 'rgba(255,214,160,0.55)');

  const sprites = cached('cloud-sprites', () => {
    const r = rng(11);
    return Array.from({ length: 5 }, () => {
      const c = offscreen(900, 420);
      const g = c.getContext('2d');
      for (let i = 0; i < 26; i++) {
        const x = 150 + r() * 600, y = 170 + (r() - 0.5) * 140 + Math.abs(x - 450) * 0.12;
        const rad = 70 + r() * 110;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, 'rgba(255,255,255,0.55)');
        grd.addColorStop(0.6, 'rgba(255,250,245,0.25)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      return c;
    });
  });
  const layers = cached(`cloud-layers-${W}`, () => {
    const r = rng(23);
    return Array.from({ length: 14 }, (_, i) => ({
      sprite: i % sprites.length, x0: r() * (W + 900), y: H * (0.05 + r() * 0.75),
      scale: 0.6 + r() * 1.1, speed: 12 + r() * 30, alpha: 0.55 + r() * 0.45,
    })).sort((a, b) => a.scale - b.scale);
  });
  for (const l of layers) {
    const w = 900 * l.scale, h = 420 * l.scale;
    const x = ((l.x0 + l.speed * l.scale * t) % (W + w)) - w;
    ctx.globalAlpha = l.alpha;
    ctx.drawImage(sprites[l.sprite], x, l.y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}

function ocean(ctx, t, W, H) {
  const horizon = H * 0.56;
  ctx.fillStyle = vgrad(ctx, 0, horizon, [[0, '#1d2b55'], [0.55, '#9a5a7a'], [0.85, '#f08a5d'], [1, '#ffc27a']]);
  ctx.fillRect(0, 0, W, horizon);
  const sunY = horizon - 120 + Math.sin(t * 0.05) * 10;
  glow(ctx, W / 2, sunY, 520, 'rgba(255,190,120,0.6)');
  ctx.fillStyle = '#ffe0a8';
  ctx.beginPath(); ctx.arc(W / 2, sunY, 95, 0, 6.283); ctx.fill();

  ctx.fillStyle = vgrad(ctx, horizon, H, [[0, '#3c3f6b'], [0.4, '#1d3557'], [1, '#08182d']]);
  ctx.fillRect(0, horizon, W, H - horizon);

  // sun reflection shimmer
  const r = cached('ocean-shimmer', () => { const g = rng(5); return Array.from({ length: 60 }, () => [g(), g(), g() * 6.28]); });
  ctx.fillStyle = '#ffd59a';
  for (const [a, b, p] of r) {
    const y = horizon + 8 + a * a * (H - horizon) * 0.7;
    const spread = 40 + (y - horizon) * 0.35;
    const x = W / 2 + (b - 0.5) * spread * 2;
    ctx.globalAlpha = Math.max(0, Math.sin(t * 2.2 + p)) * (1 - a) * 0.8;
    ctx.fillRect(x - 30 * (1 - a * 0.3), y, 60 * (1 - a * 0.3), 4 + a * 6);
  }
  ctx.globalAlpha = 1;

  // wave lines
  for (let i = 0; i < 16; i++) {
    const d = i / 15;
    const y0 = horizon + 20 + d * d * (H - horizon - 10);
    const amp = 3 + d * 18;
    ctx.strokeStyle = `rgba(160,190,230,${0.08 + d * 0.12})`;
    ctx.lineWidth = 1 + d * 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const y = y0 + Math.sin(x * (0.01 - d * 0.006) + t * (0.9 + d) + i) * amp;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}

function aurora(ctx, t, W, H) {
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, '#020611'], [0.6, '#06162a'], [1, '#0b2233']]);
  ctx.fillRect(0, 0, W, H);
  drawStars(ctx, cached(`aurora-stars-${W}`, () => stars(3, 220, W, H, H)), t, 0.5);

  ctx.globalCompositeOperation = 'lighter';
  const bands = [
    { y: H * 0.28, c: [60, 255, 170], s: 0.25, f: 0.004, h: 520, a: 0.35 },
    { y: H * 0.38, c: [80, 200, 255], s: -0.18, f: 0.0055, h: 420, a: 0.28 },
    { y: H * 0.22, c: [170, 110, 255], s: 0.12, f: 0.003, h: 380, a: 0.22 },
  ];
  for (const b of bands) {
    for (let x = 0; x < W; x += 4) {
      const wave = Math.sin(x * b.f + t * b.s * 3) * 90 + Math.sin(x * b.f * 2.7 - t * b.s * 2) * 40;
      const top = b.y + wave;
      const intensity = 0.6 + 0.4 * Math.sin(x * 0.007 + t * 0.9 + b.y);
      const g = ctx.createLinearGradient(0, top, 0, top + b.h);
      g.addColorStop(0, `rgba(${b.c},0)`);
      g.addColorStop(0.25, `rgba(${b.c},${b.a * intensity})`);
      g.addColorStop(1, `rgba(${b.c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, top, 5, b.h);
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = '#010309';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 30) {
    const peak = H * 0.86 - Math.abs(Math.sin(x * 0.011)) * 120 - Math.abs(Math.sin(x * 0.027 + 1)) * 60;
    ctx.lineTo(x, peak);
  }
  ctx.lineTo(W, H); ctx.fill();
}

function rain(ctx, t, W, H) {
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, '#0d1b24'], [0.6, '#16313d'], [1, '#0a1419']]);
  ctx.fillRect(0, 0, W, H);
  const bokeh = cached(`rain-bokeh-${W}`, () => {
    const r = rng(17);
    return Array.from({ length: 28 }, () => ({
      x: r() * W, y: r() * H, rad: 40 + r() * 140, p: r() * 6.28,
      c: r() < 0.5 ? '255,200,140' : '140,200,255',
    }));
  });
  for (const b of bokeh) {
    const a = 0.08 + 0.06 * Math.sin(t * 0.5 + b.p);
    glow(ctx, b.x + Math.sin(t * 0.1 + b.p) * 30, b.y, b.rad, `rgba(${b.c},${a * 3})`, 1);
  }
  const drops = cached(`rain-drops-${W}`, () => {
    const r = rng(29);
    return Array.from({ length: 260 }, () => ({ x: r() * (W + 300), y: r() * H, v: 900 + r() * 900, l: 30 + r() * 60, a: 0.1 + r() * 0.3 }));
  });
  ctx.lineWidth = 2;
  for (const d of drops) {
    const y = ((d.y + d.v * t) % (H + d.l)) - d.l;
    const x = d.x - (y / H) * 160 - 100;
    ctx.strokeStyle = `rgba(200,225,255,${d.a})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - d.l * 0.17, y + d.l); ctx.stroke();
  }
}

function golden(ctx, t, W, H) {
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, '#1d0f05'], [0.5, '#5c3511'], [1, '#c98a3c']]);
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const ang = -0.35 + i * 0.13 + Math.sin(t * 0.15 + i) * 0.03;
    ctx.save();
    ctx.translate(-120, -200);
    ctx.rotate(ang + 0.5);
    const g = ctx.createLinearGradient(0, 0, 2600, 0);
    g.addColorStop(0, 'rgba(255,210,140,0.16)');
    g.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2600, -60 - i * 10); ctx.lineTo(2600, 60 + i * 10); ctx.fill();
    ctx.restore();
  }
  const dust = cached(`dust-${W}`, () => {
    const r = rng(41);
    return Array.from({ length: 140 }, () => ({ x: r() * W, y: r() * H, v: 10 + r() * 35, s: 1 + r() * 3.5, p: r() * 6.28 }));
  });
  ctx.fillStyle = '#ffe2a8';
  for (const d of dust) {
    const y = H - ((H - d.y + d.v * t) % H);
    const x = d.x + Math.sin(t * 0.6 + d.p) * 25;
    ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.5 + d.p));
    ctx.beginPath(); ctx.arc(x, y, d.s, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function geometric(ctx, t, W, H) {
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, '#06201e'], [0.5, '#0b2f2c'], [1, '#04171a']]);
  ctx.fillRect(0, 0, W, H);
  const tile = cached('geo-tile', () => {
    const s = 220, c = offscreen(s, s), g = c.getContext('2d');
    g.strokeStyle = 'rgba(217,181,106,0.55)';
    g.lineWidth = 2;
    const star = (cx, cy, r) => {
      for (let k = 0; k < 2; k++) {
        g.save(); g.translate(cx, cy); g.rotate(k * Math.PI / 4);
        g.strokeRect(-r, -r, r * 2, r * 2);
        g.restore();
      }
      g.beginPath(); g.arc(cx, cy, r * 0.42, 0, 6.283); g.stroke();
    };
    star(s / 2, s / 2, 62);
    [[0, 0], [s, 0], [0, s], [s, s]].forEach(([x, y]) => star(x, y, 62));
    g.beginPath();
    g.moveTo(s / 2, 0); g.lineTo(s / 2, s / 2 - 62); g.moveTo(s / 2, s); g.lineTo(s / 2, s / 2 + 62);
    g.moveTo(0, s / 2); g.lineTo(s / 2 - 62, s / 2); g.moveTo(s, s / 2); g.lineTo(s / 2 + 62, s / 2);
    g.stroke();
    return c;
  });
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(t * 0.02);
  const sc = 1.15 + Math.sin(t * 0.1) * 0.05;
  ctx.scale(sc, sc);
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(-H, -H, H * 2, H * 2);
  ctx.restore();
  ctx.globalAlpha = 1;
  glow(ctx, W / 2, H / 2, 900, 'rgba(217,181,106,0.18)');
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function dunes(ctx, t, W, H) {
  ctx.fillStyle = vgrad(ctx, 0, H * 0.7, [[0, '#2b2350'], [0.45, '#b85a5a'], [0.8, '#f2a25c'], [1, '#ffd08a']]);
  ctx.fillRect(0, 0, W, H);
  const sunY = H * 0.5 + Math.sin(t * 0.04) * 20;
  glow(ctx, W * 0.35, sunY, 600, 'rgba(255,200,120,0.6)');
  ctx.fillStyle = '#ffe3b0';
  ctx.beginPath(); ctx.arc(W * 0.35, sunY, 110, 0, 6.283); ctx.fill();
  const layers = [
    [H * 0.62, 70, 0.0028, 4, '#c97b4a'],
    [H * 0.7, 80, 0.0022, 7, '#a95f37'],
    [H * 0.79, 90, 0.0018, 10, '#874726'],
    [H * 0.9, 70, 0.0025, 16, '#5f2f19'],
  ];
  layers.forEach(([base, amp, f, speed, color], i) => {
    const off = t * speed;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) {
      const u = x + off;
      ctx.lineTo(x, base - Math.abs(Math.sin(u * f + i)) * amp - Math.sin(u * f * 2.6 + i * 2) * amp * 0.3);
    }
    ctx.lineTo(W, H); ctx.fill();
  });
  const sand = cached(`sand-${W}`, () => { const r = rng(53); return Array.from({ length: 90 }, () => [r() * W, H * 0.55 + r() * H * 0.45, 20 + r() * 50, r() * 6.28]); });
  ctx.fillStyle = 'rgba(255,225,180,0.5)';
  for (const [x0, y, v, p] of sand) {
    const x = (x0 + v * t) % W;
    ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t + p);
    ctx.fillRect(x, y + Math.sin(t * 0.8 + p) * 10, 3, 3);
  }
  ctx.globalAlpha = 1;
}

export const STYLES = [
  { id: 'night', name: 'Night sky', draw: night, overlay: 0.1 },
  { id: 'clouds', name: 'Clouds', draw: clouds, overlay: 0.35 },
  { id: 'ocean', name: 'Ocean sunset', draw: ocean, overlay: 0.25 },
  { id: 'aurora', name: 'Aurora', draw: aurora, overlay: 0.1 },
  { id: 'rain', name: 'Rain', draw: rain, overlay: 0.1 },
  { id: 'golden', name: 'Golden light', draw: golden, overlay: 0.25 },
  { id: 'geometric', name: 'Geometric', draw: geometric, overlay: 0.1 },
  { id: 'dunes', name: 'Desert dunes', draw: dunes, overlay: 0.3 },
];

export function getStyle(id) {
  return STYLES.find((s) => s.id === id);
}

/** Small still preview of a style for the picker. */
export function thumbnail(style, w = 108, h = 192, t = 3) {
  const c = offscreen(w, h);
  const ctx = c.getContext('2d');
  ctx.scale(w / 1080, h / 1920);
  style.draw(ctx, t, 1080, 1920);
  return c;
}
