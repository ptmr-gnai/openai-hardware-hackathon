import { drawScene } from '../../lib/scenes.js';

// Bob & Weave: obstacles fly at your head. High beams → duck (bob).
// Side blocks → move your head the other way (weave). Return to center between.
// Uses the body part (webcam). Keyboard fallback: Space/↓ ducks, ←/→ dodge.
const DURATION = 15;
const GRACE = 0.2; // seconds: a dodge just before arrival still counts

// Obstacle speed multiplier (1 = original pace). Default 0.85 = 15% slower.
// Tweak live with [ and ] (±5%), or ?speed=0.7 in the URL. Remembered per browser.
const DEFAULT_SPEED = 0.85;
let speed = (() => {
  const fromUrl = Number(new URLSearchParams(location.search).get('speed'));
  if (fromUrl > 0) return fromUrl;
  try { return Number(localStorage.getItem('arcade.duck.speed')) || DEFAULT_SPEED; } catch { return DEFAULT_SPEED; }
})();
let speedShownUntil = 0;
addEventListener('keydown', e => {
  if (e.key !== '[' && e.key !== ']') return;
  speed = Math.round(Math.min(2, Math.max(0.3, speed + (e.key === ']' ? 0.05 : -0.05))) * 100) / 100;
  speedShownUntil = performance.now() + 1500;
  try { localStorage.setItem('arcade.duck.speed', String(speed)); } catch {}
});

// Each obstacle kind: what keeps you safe, and what counts as "back to neutral".
// Screen sides match the mirrored camera: a block on the screen's left is on YOUR left.
const KINDS = {
  high:  { safe: b => b.ducking,          cue: 'DUCK!',          praise: 'Nice duck!' },
  left:  { safe: b => b.dodgeSide === 1,  cue: 'DODGE RIGHT →',  praise: 'Nice weave!' },
  right: { safe: b => b.dodgeSide === -1, cue: '← DODGE LEFT',   praise: 'Nice weave!' },
};

function pickKind(state, ctx) {
  // Ease in: the first two are always ducks, then mix. Avoid 3 of a kind in a row.
  if (state.spawned < 2) return 'high';
  let kind;
  do {
    const r = Math.random();
    kind = r < 0.4 ? 'high' : r < 0.7 ? 'left' : 'right';
  } while (state.recentKinds.length >= 2 && state.recentKinds.every(k => k === kind));
  return kind;
}

function spawn(state, ctx) {
  const p = ctx.progress();
  const kind = pickKind(state, ctx);
  state.spawned += 1;
  state.recentKinds = [...state.recentKinds.slice(-1), kind];
  state.obstacles.push({
    kind,
    t: 0,
    travel: (1.8 - p * 0.6) / speed,    // seconds from horizon to you
    color: kind === 'high' ? `hsl(${ctx.rand(160, 330)}, 85%, 60%)` : `hsl(${ctx.rand(20, 50)}, 95%, 58%)`,
    sawNeutral: false,
    done: false,
  });
}

function judge(state, ctx, ob) {
  const kind = KINDS[ob.kind];
  const recent = ctx.run.phaseT - state.lastSafeT[ob.kind] <= GRACE;
  const safe = kind.safe(ctx.body) || recent;
  const { W, H } = ctx;
  const fxX = ob.kind === 'left' ? W * 0.3 : ob.kind === 'right' ? W * 0.7 : W / 2;
  if (safe && ob.sawNeutral) {
    state.combo += 1;
    state.dodges += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const points = state.combo >= 10 ? 3 : state.combo >= 5 ? 2 : 1;
    ctx.addScore(points, fxX, H * 0.3, points > 1 ? '#06d6a0' : '#fff');
    ctx.fx.burst(fxX, H * 0.3, ob.color, 24, 420);
    ctx.sfx.whoosh();
    state.message = { text: state.combo >= 5 ? `${state.combo} COMBO!` : kind.praise, color: '#06d6a0', t: 0.8 };
  } else {
    state.combo = 0;
    state.hits += 1;
    state.shake = 0.35;
    state.redFlash = 1;
    ctx.sfx.hit();
    state.message = safe
      ? { text: 'Back to center between dodges!', color: '#ffdc5d', t: 1.2 }
      : { text: 'BONK!', color: '#ff5d8f', t: 0.8 };
  }
}

function drawCorridor(g, W, H, vpY) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#120a2a');
  bg.addColorStop(1, '#2a1650');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#7b5cff44';
  g.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * W;
    g.beginPath();
    g.moveTo(W / 2, vpY);
    g.lineTo(x, H);
    g.moveTo(W / 2, vpY);
    g.lineTo(x, 0);
    g.stroke();
  }
}

// Geometry of an obstacle at progress e (0 = horizon, 1 = at your head).
function obstacleRect(ob, W, H, vpY, e) {
  if (ob.kind === 'high') {
    const width = W * (0.06 + 1.3 * e);
    const height = H * (0.01 + 0.09 * e);
    return { x: W / 2 - width / 2, y: vpY + (H * 0.3 - vpY) * e - height / 2, width, height };
  }
  const dir = ob.kind === 'left' ? -1 : 1;
  const width = W * (0.02 + 0.42 * e);
  const height = H * (0.02 + 0.42 * e);
  const cx = W / 2 + dir * W * 0.22 * e;
  const cy = vpY + (H * 0.42 - vpY) * e;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

function drawPlayer(g, W, H, duck, side) {
  const d = Math.min(1.3, duck);
  const shift = Math.max(-1.4, Math.min(1.4, side)) * W * 0.07;
  const x = W / 2;
  const feet = H - 20;
  const height = H * 0.26 * (1 - d * 0.38);
  const headR = H * 0.03;
  const hip = feet - H * 0.1 * (1 - d * 0.3);
  const shoulder = feet - height + headR * 2.2;
  const sx = x + shift * 0.6;
  g.strokeStyle = '#ffffffdd';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 30, feet); g.lineTo(x - 10 - d * 15, hip + (feet - hip) * 0.5); g.lineTo(x, hip);
  g.lineTo(x + 10 + d * 15, hip + (feet - hip) * 0.5); g.lineTo(x + 30, feet);
  g.moveTo(x, hip); g.lineTo(sx, shoulder);
  g.moveTo(sx - 35, shoulder + 25 + d * 10); g.lineTo(sx, shoulder); g.lineTo(sx + 35, shoulder + 25 + d * 10);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x + shift, shoulder - headR * 1.2, headR, 0, Math.PI * 2);
  g.fill();
}

function drawMeters(g, W, H, duck, side) {
  // Vertical duck meter (right edge).
  const x = W - 40;
  const top = H * 0.3;
  const h = H * 0.4;
  g.fillStyle = '#0006';
  g.fillRect(x - 10, top, 20, h);
  g.fillStyle = duck >= 1 ? '#06d6a0' : '#ffdc5d';
  g.fillRect(x - 10, top, 20, h * (Math.min(1.5, duck) / 1.5));
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 16, top + h / 1.5); g.lineTo(x + 16, top + h / 1.5); g.stroke();
  g.fillStyle = '#fff';
  g.font = '600 12px system-ui';
  g.textAlign = 'center';
  g.fillText('DUCK', x, top - 10);

  // Horizontal weave meter (under the player).
  const cx = W / 2;
  const y = H - 8;
  const half = W * 0.12;
  g.fillStyle = '#0006';
  g.fillRect(cx - half, y - 5, half * 2, 10);
  const v = Math.max(-1.5, Math.min(1.5, side)) / 1.5;
  g.fillStyle = Math.abs(side) >= 1 ? '#06d6a0' : '#ffdc5d';
  g.fillRect(Math.min(cx, cx + v * half), y - 5, Math.abs(v * half), 10);
  g.strokeStyle = '#fff';
  g.beginPath();
  for (const t of [-1, 1]) { g.moveTo(cx + (t * half) / 1.5, y - 9); g.lineTo(cx + (t * half) / 1.5, y + 5); }
  g.stroke();
}

// Reusable layer: the obstacle course. Draw in two passes so other layers
// (e.g. balloons) can go between the world and the HUD overlay.
export const dodgeLayer = {
  init() {
    return {
      obstacles: [], spawnIn: 0.5, spawned: 0, recentKinds: [],
      combo: 0, bestCombo: 0, dodges: 0, hits: 0,
      lastSafeT: { high: -9, left: -9, right: -9 },
      shake: 0, redFlash: 0, message: null,
    };
  },

  update(state, ctx, dt) {
    const { body } = ctx;
    for (const [name, kind] of Object.entries(KINDS)) {
      if (kind.safe(body)) state.lastSafeT[name] = ctx.run.phaseT;
    }
    if (ctx.run.phase === 'play') {
      state.spawnIn -= dt;
      if (state.spawnIn <= 0) {
        spawn(state, ctx);
        state.spawnIn = ((2.2 - ctx.progress() * 0.9) / speed) * ctx.rand(0.85, 1.15);
      }
    }
    for (const ob of state.obstacles) {
      ob.t += dt / ob.travel;
      // You must be out of the dodge pose at some point while it approaches.
      if (!KINDS[ob.kind].safe(body) && ob.t < 0.85) ob.sawNeutral = true;
      if (!ob.done && ob.t >= 1) {
        ob.done = true;
        if (ctx.run.phase === 'play') judge(state, ctx, ob);
      }
    }
    state.obstacles = state.obstacles.filter(o => o.t < 1.25);
    state.shake = Math.max(0, state.shake - dt);
    state.redFlash = Math.max(0, state.redFlash - dt * 3);
    if (state.message && (state.message.t -= dt) <= 0) state.message = null;
  },

  // opts.scene: draw a scene from lib/scenes.js instead of the plain corridor
  // (it must share the corridor's vanishing point, 0.38 H).
  drawWorld(state, ctx, opts = {}) {
    const { g, W, H, body } = ctx;
    const vpY = H * 0.38;
    const duck = body.keyDuck ? 1.2 : body.duckAmount;
    const side = body.dodgeAmount;
    g.save();
    if (state?.shake) g.translate(ctx.rand(-12, 12) * state.shake * 3, ctx.rand(-12, 12) * state.shake * 3);
    if (opts.scene) drawScene(opts.scene, g, W, H, performance.now() / 1000, opts.sky);
    else drawCorridor(g, W, H, vpY);

    let cue = null;
    for (const ob of [...(state?.obstacles ?? [])].sort((a, b) => a.t - b.t)) {
      const e = Math.min(1.25, ob.t) ** 2;
      const r = obstacleRect(ob, W, H, vpY, e);
      g.globalAlpha = ob.t > 1 ? Math.max(0, 1 - (ob.t - 1) * 4) : 1;
      g.fillStyle = ob.color;
      g.shadowColor = ob.color;
      g.shadowBlur = 30 * e;
      g.beginPath();
      g.roundRect(r.x, r.y, r.width, r.height, ob.kind === 'high' ? 4 : Math.min(r.width, r.height) * 0.2);
      g.fill();
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      if (ob.t > 0.5 && ob.t < 1 && (!cue || ob.t > cue.t)) cue = ob;
    }
    if (cue && Math.floor(cue.t * 12) % 2 === 0) {
      g.fillStyle = '#ff5d8f';
      g.font = `900 ${Math.min(W, H) * 0.08}px system-ui`;
      g.textAlign = 'center';
      g.fillText(KINDS[cue.kind].cue, W / 2, H * 0.58);
    }

    drawPlayer(g, W, H, duck, side);
    g.restore();
  },

  drawOverlay(state, ctx) {
    const { g, W, H, body } = ctx;
    const duck = body.keyDuck ? 1.2 : body.duckAmount;
    const side = body.dodgeAmount;
    drawMeters(g, W, H, duck, side);
    const pw = Math.min(260, W * 0.22);
    body.drawPreview(g, 16, H - pw * 0.75 - 16, pw, pw * 0.75);

    if (state?.redFlash) {
      g.fillStyle = `rgba(255, 40, 80, ${state.redFlash * 0.35})`;
      g.fillRect(0, 0, W, H);
    }
    g.textAlign = 'center';
    if (state?.message) {
      g.globalAlpha = Math.min(1, state.message.t * 3);
      g.fillStyle = state.message.color;
      g.font = `800 ${Math.min(W, H) * 0.05}px system-ui`;
      g.fillText(state.message.text, W / 2, H * 0.7);
      g.globalAlpha = 1;
    }
    if (state && state.combo >= 2) {
      g.fillStyle = '#06d6a0';
      g.font = '700 22px system-ui';
      g.fillText(`combo ×${state.combo}`, W / 2, 44);
    }
    if (!state || ctx.run.phase !== 'play' || performance.now() < speedShownUntil) {
      g.fillStyle = performance.now() < speedShownUntil ? '#ffdc5d' : '#ffffff99';
      g.font = '600 16px system-ui';
      g.fillText(`Speed ${Math.round(speed * 100)}%  ·  [ slower   ] faster`, W / 2, H * 0.9);
    }
    // Body status (calibration / step into view) unless happily tracking.
    if (!body.ready || !body.tracking) {
      g.fillStyle = '#ffdc5d';
      g.font = '700 20px system-ui';
      g.fillText(`${body.status} · R recalibrates · keys: Space duck, ←/→ dodge`, W / 2, H - 30);
    }
  },

};

export default {
  id: 'duck',
  title: 'Bob & Weave',
  tagline: 'Duck and dodge with your whole body.',
  icon: '🥊',
  inputs: ['body'],
  stars: [4, 8, 12],
  blurb: `Duck under high beams, dodge side blocks, back to center between. ${DURATION} s.`,
  duration: DURATION,
  needs: ['body'],
  init: dodgeLayer.init,
  update: dodgeLayer.update,
  draw(state, ctx) {
    dodgeLayer.drawWorld(state, ctx);
    dodgeLayer.drawOverlay(state, ctx);
  },
  summary(state) {
    return `${state.dodges} dodged · ${state.hits} bonked · best combo ${state.bestCombo}`;
  },
};
