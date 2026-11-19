// Scenes part: themed backgrounds any game can paint. drawScene(name, g, W, H, t, sky).
// All procedural (no image assets) so they work offline and scale to any screen.

const rand = seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function gradient(g, W, H, [top, bottom]) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

const clouds = Array.from({ length: 6 }, (_, i) => ({
  x: (i * 0.37) % 1, y: 0.1 + ((i * 0.23) % 0.6), size: 30 + ((i * 17) % 40), speed: 8 + ((i * 7) % 18),
}));
function drawClouds(g, W, H, t, color = '#ffffffb0') {
  g.fillStyle = color;
  for (const c of clouds) {
    const x = ((c.x * W + t * c.speed) % (W + 300)) - 150;
    const y = c.y * H;
    for (const [dx, dy, rr] of [[0, 0, 1], [0.9, 0.15, 0.75], [-0.9, 0.2, 0.7], [0.4, -0.35, 0.7]]) {
      g.beginPath();
      g.arc(x + dx * c.size, y + dy * c.size, rr * c.size, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// NYC skyline at dusk: layered buildings with lit windows, a couple of spires.
let skyline = null;
function buildSkyline(W, H) {
  const r = rand(42);
  const layers = [0.55, 0.7].map((depth, li) => {
    const buildings = [];
    let x = -20;
    while (x < W + 20) {
      const w = 40 + r() * 90;
      const h = H * (0.18 + r() * 0.32) * (li ? 0.85 : 1);
      const spire = r() < 0.12;
      const windows = [];
      for (let wy = H - h + 12; wy < H - 10; wy += 14) {
        for (let wx = x + 6; wx < x + w - 8; wx += 11) if (r() < 0.35) windows.push([wx, wy]);
      }
      buildings.push({ x, w, h, spire, windows });
      x += w + 2 + r() * 6;
    }
    return { depth, buildings, color: li ? '#14112b' : '#241d45' };
  });
  return { W, H, layers };
}
function drawSkyline(g, W, H) {
  if (!skyline || skyline.W !== W || skyline.H !== H) skyline = buildSkyline(W, H);
  for (const layer of skyline.layers) {
    for (const b of layer.buildings) {
      g.fillStyle = layer.color;
      g.fillRect(b.x, H - b.h, b.w, b.h);
      if (b.spire) {
        g.beginPath();
        g.moveTo(b.x + b.w * 0.3, H - b.h);
        g.lineTo(b.x + b.w / 2, H - b.h - b.w * 1.2);
        g.lineTo(b.x + b.w * 0.7, H - b.h);
        g.fill();
      }
      g.fillStyle = '#ffd97a';
      for (const [wx, wy] of b.windows) g.fillRect(wx, wy, 5, 7);
    }
  }
}

// Static scenes are painted once per screen size into an offscreen canvas and
// stamped each frame (thousands of skyline windows / tile lines per frame lag).
const staticCache = new Map();
function cachedStatic(name, W, H, sky, paint) {
  const dpr = devicePixelRatio || 1;
  const key = `${name}|${W}|${H}|${dpr}|${sky.join()}`;
  let img = staticCache.get(key);
  if (!img) {
    img = document.createElement('canvas');
    img.width = Math.ceil(W * dpr);
    img.height = Math.ceil(H * dpr);
    const g = img.getContext('2d');
    g.scale(dpr, dpr);
    paint(g, W, H, sky);
    if (staticCache.size > 8) staticCache.clear();
    staticCache.set(key, img);
  }
  return img;
}


function paintNyc(g, W, H, sky) {
  gradient(g, W, H, sky);
  // low sun glow
  const sun = g.createRadialGradient(W * 0.75, H * 0.62, 10, W * 0.75, H * 0.62, H * 0.5);
  sun.addColorStop(0, '#ffd16688');
  sun.addColorStop(1, '#ffd16600');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);
  drawSkyline(g, W, H);
}

function paintSubway(g, W, H, sky) {
  gradient(g, W, H, sky);
  // white tile wall
  const tileW = 46;
  const tileH = 23;
  g.fillStyle = '#e9ecef';
  g.fillRect(0, 0, W, H * 0.72);
  g.strokeStyle = '#adb5bd';
  g.lineWidth = 1;
  g.beginPath();
  for (let y = 0; y < H * 0.72; y += tileH) {
    g.moveTo(0, y); g.lineTo(W, y);
    const offset = (y / tileH) % 2 ? tileW / 2 : 0;
    for (let x = offset; x < W; x += tileW) { g.moveTo(x, y); g.lineTo(x, y + tileH); }
  }
  g.stroke();
  // mosaic band + station sign
  g.fillStyle = '#7b2d26';
  g.fillRect(0, H * 0.18, W, H * 0.06);
  g.fillStyle = '#111';
  const signW = Math.min(420, W * 0.4);
  g.fillRect(W / 2 - signW / 2, H * 0.3, signW, H * 0.09);
  g.fillStyle = '#fff';
  g.font = `700 ${H * 0.045}px Helvetica, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('14 St', W / 2, H * 0.345);
  // platform + yellow safety edge.
  // Light concrete platform: runners are drawn dark + outlined (balloons.js) to pop.
  g.fillStyle = '#cfc8bb';
  g.fillRect(0, H * 0.72, W, H * 0.28);
  g.fillStyle = '#ffd60a';
  g.fillRect(0, H * 0.72, W, H * 0.02);
  g.fillStyle = '#0000000f';
  for (let x = 0; x < W; x += 60) g.fillRect(x, H * 0.74, 2, H * 0.26);
}

// Bodega: back shelves stocked with colourful products, neon signs, wooden counter.
function paintBodega(g, W, H, sky) {
  gradient(g, W, H, sky);
  const r = rand(11);
  const shelfTop = H * 0.08;
  const shelfBottom = H * 0.66;
  const rows = 4;
  const rowH = (shelfBottom - shelfTop) / rows;
  const palette = ['#e63946', '#ffd60a', '#06d6a0', '#118ab2', '#f77f00', '#ef476f', '#8338ec', '#ffffff', '#2a9d8f', '#e9c46a'];
  for (let row = 0; row < rows; row++) {
    const base = shelfTop + (row + 1) * rowH;
    let x = 10;
    while (x < W - 10) {
      const kind = r();
      const w = kind < 0.4 ? 18 + r() * 10 : 26 + r() * 30;     // cans vs boxes
      const h = kind < 0.4 ? rowH * (0.35 + r() * 0.15) : rowH * (0.5 + r() * 0.35);
      const color = palette[Math.floor(r() * palette.length)];
      g.fillStyle = color;
      if (kind < 0.4) {
        g.beginPath();
        g.roundRect(x, base - h - 6, w, h, 4);
        g.fill();
        g.fillStyle = '#ffffff55';
        g.fillRect(x + 2, base - h, w - 4, h * 0.25);
      } else {
        g.fillRect(x, base - h - 6, w, h);
        g.fillStyle = '#00000033';
        g.fillRect(x + w * 0.15, base - h * 0.7, w * 0.7, h * 0.25);
      }
      x += w + 3 + r() * 5;
    }
    // shelf plank
    g.fillStyle = '#d9d2c3';
    g.fillRect(0, base - 6, W, 8);
    g.fillStyle = '#00000040';
    g.fillRect(0, base + 2, W, 4);
  }
  // neon signs
  const neon = (text, x, y, size, color) => {
    g.font = `800 ${size}px "Arial Rounded MT Bold", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 24;
    g.fillStyle = color;
    g.fillText(text, x, y);
    g.shadowBlur = 8;
    g.fillStyle = '#ffffff';
    g.fillText(text, x, y);
    g.shadowBlur = 0;
  };
  g.fillStyle = '#000000aa';
  g.fillRect(W * 0.04, H * 0.02, W * 0.22, H * 0.09);
  neon('OPEN 24 HRS', W * 0.15, H * 0.065, H * 0.042, '#ff3864');
  g.fillStyle = '#000000aa';
  g.fillRect(W * 0.76, H * 0.02, W * 0.2, H * 0.09);
  neon('LOTTO', W * 0.86, H * 0.065, H * 0.05, '#2de2e6');
  // counter
  const top = H * 0.7;
  g.fillStyle = '#8b5a2b';
  g.fillRect(0, top, W, H - top);
  g.fillStyle = '#a47148';
  g.fillRect(0, top, W, H * 0.025);
  g.strokeStyle = '#00000030';
  g.lineWidth = 2;
  for (let x = 0; x < W; x += 90) { g.beginPath(); g.moveTo(x, top + H * 0.03); g.lineTo(x, H); g.stroke(); }
  // bodega cat on the counter
  g.font = `${H * 0.12}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillText('🐈', W * 0.1, top + H * 0.02);
}

const SCENES = {
  sky(g, W, H, t, sky) {
    gradient(g, W, H, sky);
    drawClouds(g, W, H, t);
  },

  nyc(g, W, H, t, sky) {
    g.drawImage(cachedStatic('nyc', W, H, sky, paintNyc), 0, 0, W, H);
  },

  subway(g, W, H, t, sky) {
    g.drawImage(cachedStatic('subway', W, H, sky, paintSubway), 0, 0, W, H);
  },

  bodega(g, W, H, t, sky) {
    g.drawImage(cachedStatic('bodega', W, H, sky, paintBodega), 0, 0, W, H);
  },

  pond(g, W, H, t, sky) {
    gradient(g, W, H, sky);
    drawClouds(g, W, H, t, '#ffffffcc');
    // tree line
    g.fillStyle = '#2d6a4f';
    const r = rand(7);
    g.beginPath();
    g.moveTo(0, H * 0.72);
    for (let x = 0; x <= W; x += 30) g.lineTo(x, H * (0.6 + r() * 0.06));
    g.lineTo(W, H * 0.72);
    g.fill();
    // water
    g.fillStyle = '#4ea8de';
    g.fillRect(0, H * 0.72, W, H * 0.12);
    g.strokeStyle = '#ffffff55';
    g.beginPath();
    for (let x = (t * 25) % 80; x < W; x += 80) { g.moveTo(x, H * 0.77); g.lineTo(x + 30, H * 0.77); }
    g.stroke();
    // grass + reeds
    g.fillStyle = '#74c69d';
    g.fillRect(0, H * 0.84, W, H * 0.16);
    g.strokeStyle = '#40916c';
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 10; x < W; x += 24) {
      const sway = Math.sin(t * 1.5 + x) * 4;
      g.moveTo(x, H); g.lineTo(x + sway, H * 0.8);
    }
    g.stroke();
  },
};

export function drawScene(name, g, W, H, t, sky = ['#2b6cb0', '#90cdf4']) {
  (SCENES[name] ?? SCENES.sky)(g, W, H, t, sky);
}
