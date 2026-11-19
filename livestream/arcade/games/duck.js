// Duck!: beams swing toward your head — duck under each one, then stand back up.
// Uses the body part (webcam). Keyboard fallback: hold Space or ↓.
const DURATION = 30;
const GRACE = 0.2; // seconds: a duck just before arrival still counts

// Beam speed multiplier (1 = original pace). Default 0.85 = 15% slower.
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

function spawn(state, ctx) {
  const p = ctx.progress();
  state.beams.push({
    t: 0,
    travel: (1.8 - p * 0.6) / speed,    // seconds from horizon to you
    color: `hsl(${ctx.rand(0, 360)}, 85%, 60%)`,
    sawStanding: false,
    done: false,
  });
}

function judge(state, ctx, beam) {
  const recentlyDucked = ctx.run.phaseT - state.lastDuckT <= GRACE;
  const ducked = ctx.body.ducking || recentlyDucked;
  const { W, H } = ctx;
  if (ducked && beam.sawStanding) {
    state.combo += 1;
    state.dodges += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const points = state.combo >= 10 ? 3 : state.combo >= 5 ? 2 : 1;
    ctx.addScore(points, W / 2, H * 0.3, points > 1 ? '#06d6a0' : '#fff');
    ctx.fx.burst(W / 2, H * 0.25, beam.color, 24, 420);
    ctx.sfx.whoosh();
    state.message = { text: state.combo >= 5 ? `${state.combo} COMBO!` : 'Nice duck!', color: '#06d6a0', t: 0.8 };
  } else {
    state.combo = 0;
    state.hits += 1;
    state.shake = 0.35;
    state.redFlash = 1;
    ctx.sfx.hit();
    state.message = ducked
      ? { text: 'Stand up between beams!', color: '#ffdc5d', t: 1.2 }
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

function drawPlayer(g, W, H, amount) {
  const d = Math.min(1.3, amount);
  const x = W / 2;
  const feet = H - 20;
  const height = H * 0.26 * (1 - d * 0.38);
  const headR = H * 0.03;
  const hip = feet - H * 0.1 * (1 - d * 0.3);
  const shoulder = feet - height + headR * 2.2;
  g.strokeStyle = '#ffffffdd';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 30, feet); g.lineTo(x - 10 - d * 15, hip + (feet - hip) * 0.5); g.lineTo(x, hip);
  g.lineTo(x + 10 + d * 15, hip + (feet - hip) * 0.5); g.lineTo(x + 30, feet);
  g.moveTo(x, hip); g.lineTo(x, shoulder);
  g.moveTo(x - 35, shoulder + 25 + d * 10); g.lineTo(x, shoulder); g.lineTo(x + 35, shoulder + 25 + d * 10);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, shoulder - headR * 1.2, headR, 0, Math.PI * 2);
  g.fill();
}

function drawDuckMeter(g, W, H, amount) {
  const x = W - 40;
  const top = H * 0.3;
  const h = H * 0.4;
  g.fillStyle = '#0006';
  g.fillRect(x - 10, top, 20, h);
  const fill = Math.min(1.5, amount) / 1.5;
  g.fillStyle = amount >= 1 ? '#06d6a0' : '#ffdc5d';
  g.fillRect(x - 10, top, 20, h * fill);
  const lineY = top + h / 1.5;
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 16, lineY); g.lineTo(x + 16, lineY); g.stroke();
  g.fillStyle = '#fff';
  g.font = '600 12px system-ui';
  g.textAlign = 'center';
  g.fillText('DUCK', x, top - 10);
}

export default {
  id: 'duck',
  title: 'Duck!',
  blurb: `Duck under the beams, then stand back up. ${DURATION} seconds.`,
  duration: DURATION,
  needs: ['body'],

  init() {
    return { beams: [], spawnIn: 0.5, combo: 0, bestCombo: 0, dodges: 0, hits: 0, lastDuckT: -9, shake: 0, redFlash: 0, message: null };
  },

  update(state, ctx, dt) {
    const ducking = ctx.body.ducking;
    if (ducking) state.lastDuckT = ctx.run.phaseT;
    if (ctx.run.phase === 'play') {
      state.spawnIn -= dt;
      if (state.spawnIn <= 0) {
        spawn(state, ctx);
        state.spawnIn = ((2.2 - ctx.progress() * 0.9) / speed) * ctx.rand(0.85, 1.15);
      }
    }
    for (const beam of state.beams) {
      beam.t += dt / beam.travel;
      if (!ducking && beam.t < 0.85) beam.sawStanding = true;
      if (!beam.done && beam.t >= 1) {
        beam.done = true;
        if (ctx.run.phase === 'play') judge(state, ctx, beam);
      }
    }
    state.beams = state.beams.filter(b => b.t < 1.25);
    state.shake = Math.max(0, state.shake - dt);
    state.redFlash = Math.max(0, state.redFlash - dt * 3);
    if (state.message && (state.message.t -= dt) <= 0) state.message = null;
  },

  draw(state, ctx) {
    const { g, W, H, body } = ctx;
    const vpY = H * 0.38;
    g.save();
    if (state?.shake) g.translate(ctx.rand(-12, 12) * state.shake * 3, ctx.rand(-12, 12) * state.shake * 3);
    drawCorridor(g, W, H, vpY);

    // Beams: from the horizon to head height, growing as they approach.
    for (const beam of [...(state?.beams ?? [])].sort((a, b) => a.t - b.t)) {
      const e = Math.min(1.25, beam.t) ** 2;
      const y = vpY + (H * 0.3 - vpY) * e;
      const width = W * (0.06 + 1.3 * e);
      const height = H * (0.01 + 0.09 * e);
      g.globalAlpha = beam.t > 1 ? Math.max(0, 1 - (beam.t - 1) * 4) : 1;
      g.fillStyle = beam.color;
      g.shadowColor = beam.color;
      g.shadowBlur = 30 * e;
      g.fillRect(W / 2 - width / 2, y - height / 2, width, height);
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      if (beam.t > 0.55 && beam.t < 1 && Math.floor(beam.t * 12) % 2 === 0) {
        g.fillStyle = '#ff5d8f';
        g.font = `900 ${Math.min(W, H) * 0.09}px system-ui`;
        g.textAlign = 'center';
        g.fillText('DUCK!', W / 2, H * 0.55);
      }
    }

    drawPlayer(g, W, H, body.keyDuck ? 1.2 : body.duckAmount);
    g.restore();

    drawDuckMeter(g, W, H, body.keyDuck ? 1.2 : body.duckAmount);
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
      g.fillText(state.message.text, W / 2, H * 0.68);
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
      g.fillText(`Beam speed ${Math.round(speed * 100)}%  ·  [ slower   ] faster`, W / 2, H * 0.9);
    }
    // Body status (calibration / step into view) unless happily tracking.
    if (!body.ready || !body.tracking) {
      g.fillStyle = '#ffdc5d';
      g.font = '700 20px system-ui';
      g.fillText(`${body.status} · R recalibrates · Space = duck (keyboard)`, W / 2, H - 24);
    }
  },

  summary(state) {
    return `${state.dodges} ducked · ${state.hits} bonked · best combo ${state.bestCombo}`;
  },
};
