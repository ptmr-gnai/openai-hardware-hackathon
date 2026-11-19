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

// ---- Times Square: a night street in one-point perspective -----------------
// Vanishing point matches the Bob & Weave / Gauntlet corridor (W/2, 0.38 H),
// so obstacles fly straight down the street. All signage is made up.
const TS_VP_Y = 0.38;
const lerp = (a, b, t) => a + (b - a) * t;

// Point on a wall: side -1 = left, +1 = right; z 0 = near, 1 = far; v 0 = top, 1 = bottom.
function wallPoint(W, H, side, z, v) {
  const vpX = W / 2;
  const vpY = H * TS_VP_Y;
  const nearX = side < 0 ? 0 : W;
  const farX = vpX + side * W * 0.07;
  const x = lerp(nearX, farX, z);
  const top = lerp(-H * 0.15, vpY - H * 0.2, z);
  const bottom = lerp(H * 0.8, vpY + H * 0.06, z);
  return [x, lerp(top, bottom, v)];
}

function quad(g, pts) {
  g.beginPath();
  g.moveTo(...pts[0]);
  for (const p of pts.slice(1)) g.lineTo(...p);
  g.closePath();
}

// A billboard on a wall between depths z0..z1 and heights v0..v1.
function wallRect(W, H, side, z0, z1, v0, v1) {
  return [wallPoint(W, H, side, z0, v0), wallPoint(W, H, side, z1, v0), wallPoint(W, H, side, z1, v1), wallPoint(W, H, side, z0, v1)];
}

// Draw text onto a billboard quad with an affine map (close enough for signage).
function billboardText(g, pts, text, color, weight = 900) {
  // Map left-to-right on screen, whichever wall it's on (else the right wall mirrors).
  const [nearTop, farTop, farBottom, nearBottom] = pts;
  const leftToRight = nearTop[0] < farTop[0];
  const p00 = leftToRight ? nearTop : farTop;
  const p10 = leftToRight ? farTop : nearTop;
  const p01 = leftToRight ? nearBottom : farBottom;
  g.save();
  // transform() (not setTransform) so the canvas's devicePixelRatio scale is kept.
  g.transform(
    (p10[0] - p00[0]) / 100, (p10[1] - p00[1]) / 100,
    (p01[0] - p00[0]) / 100, (p01[1] - p00[1]) / 100,
    p00[0], p00[1],
  );
  g.font = `${weight} 34px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 50, 52, 92);
  g.restore();
}

const TS_BOARDS = [
  // side, z0, z1, v0, v1, background, text, text colour
  [-1, 0.00, 0.22, 0.05, 0.30, '#e63946', 'BROADWAY', '#fff'],
  [-1, 0.00, 0.22, 0.36, 0.58, '#111', 'OPEN LATE', '#ffd60a'],
  [-1, 0.26, 0.48, 0.10, 0.42, '#3a86ff', 'NYC', '#fff'],
  [-1, 0.52, 0.70, 0.06, 0.30, '#ffd60a', 'HOT DOGS $2', '#111'],
  [-1, 0.52, 0.70, 0.36, 0.56, '#7209b7', 'CODEX', '#fff'],
  [-1, 0.74, 0.88, 0.12, 0.40, '#06d6a0', 'SHOW', '#111'],
  [1, 0.00, 0.22, 0.05, 0.34, '#ff006e', 'TONIGHT', '#fff'],
  [1, 0.00, 0.22, 0.40, 0.58, '#111', '★ ARCADE ★', '#06d6a0'],
  [1, 0.26, 0.48, 0.08, 0.30, '#ffbe0b', 'PIZZA', '#111'],
  [1, 0.26, 0.48, 0.36, 0.56, '#118ab2', '42 ST', '#fff'],
  [1, 0.52, 0.70, 0.10, 0.44, '#fb5607', 'DUCK!', '#fff'],
  [1, 0.74, 0.88, 0.06, 0.32, '#8338ec', 'LIVE', '#fff'],
];
// Boards whose colour cycles each frame (indices into TS_BOARDS).
const TS_ANIMATED = [2, 9, 11];

function paintTimesSquare(g, W, H, sky) {
  gradient(g, W, H, sky);
  const vpX = W / 2;
  const vpY = H * TS_VP_Y;
  // Far tower of stacked screens at the end of the street.
  const towerW = W * 0.1;
  const towerTop = vpY - H * 0.32;
  g.fillStyle = '#14112b';
  g.fillRect(vpX - towerW / 2, towerTop, towerW, vpY - towerTop + H * 0.05);
  ['#ff006e', '#3a86ff', '#ffd60a', '#06d6a0'].forEach((c, i) => {
    g.shadowColor = c;
    g.shadowBlur = 20;
    g.fillStyle = c;
    g.fillRect(vpX - towerW * 0.4, towerTop + H * 0.03 + i * H * 0.07, towerW * 0.8, H * 0.05);
  });
  g.shadowBlur = 0;
  // Street and sidewalks.
  const [lNearB, lFarB] = [wallPoint(W, H, -1, 0, 1), wallPoint(W, H, -1, 1, 1)];
  const [rNearB, rFarB] = [wallPoint(W, H, 1, 0, 1), wallPoint(W, H, 1, 1, 1)];
  g.fillStyle = '#1b1b24';
  quad(g, [lNearB, lFarB, rFarB, rNearB, [W, H], [0, H]]);
  g.fill();
  // Lane lines converging to the vanishing point.
  g.strokeStyle = '#ffd60a55';
  g.lineWidth = 3;
  g.setLineDash([24, 26]);
  for (const x of [-0.18, 0.18]) {
    g.beginPath();
    g.moveTo(vpX + x * W * 2.2, H);
    g.lineTo(vpX + x * W * 0.12, vpY + H * 0.08);
    g.stroke();
  }
  g.setLineDash([]);
  // Crosswalk near the viewer.
  g.fillStyle = '#ffffff30';
  for (let i = 0; i < 9; i++) {
    const x0 = W * (0.05 + i * 0.105);
    g.beginPath();
    g.moveTo(x0, H * 0.9);
    g.lineTo(x0 + W * 0.06, H * 0.9);
    g.lineTo(x0 + W * 0.065, H);
    g.lineTo(x0 - W * 0.005, H);
    g.fill();
  }
  // Building walls.
  for (const side of [-1, 1]) {
    g.fillStyle = '#0d0b1d';
    quad(g, wallRect(W, H, side, 0, 1, 0, 1));
    g.fill();
    // Floor lines for depth.
    g.strokeStyle = '#ffffff0d';
    g.lineWidth = 1;
    for (let v = 0.1; v < 1; v += 0.1) {
      g.beginPath();
      g.moveTo(...wallPoint(W, H, side, 0, v));
      g.lineTo(...wallPoint(W, H, side, 1, v));
      g.stroke();
    }
  }
  // Billboards (static ones; animated ones are redrawn every frame).
  TS_BOARDS.forEach(([side, z0, z1, v0, v1, bg, text, fg], i) => {
    const pts = wallRect(W, H, side, z0, z1, v0, v1);
    g.shadowColor = bg;
    g.shadowBlur = 24;
    g.fillStyle = bg;
    quad(g, pts);
    g.fill();
    g.shadowBlur = 0;
    if (!TS_ANIMATED.includes(i)) billboardText(g, pts, text, fg);
  });
  // Soft dim so obstacles and targets stay the brightest things on screen.
  g.fillStyle = '#05051080';
  g.fillRect(0, 0, W, H);
}

function animateTimesSquare(g, W, H, t) {
  for (const i of TS_ANIMATED) {
    const [side, z0, z1, v0, v1, , text] = TS_BOARDS[i];
    const pts = wallRect(W, H, side, z0, z1, v0, v1);
    const hue = (t * 40 + i * 70) % 360;
    g.fillStyle = `hsl(${hue}, 85%, 45%)`;
    quad(g, pts);
    g.fill();
    billboardText(g, pts, text, '#fff');
  }
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

  timesSquare(g, W, H, t, sky) {
    g.drawImage(cachedStatic('timesSquare', W, H, sky, paintTimesSquare), 0, 0, W, H);
    animateTimesSquare(g, W, H, t);
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
