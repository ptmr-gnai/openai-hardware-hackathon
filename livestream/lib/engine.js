// Minigame engine part: canvas, round lifecycle, HUD, reticle, best scores.
//
// A minigame is a plain object:
//   { id, title, blurb, duration,          // seconds per round
//     init(ctx) -> state,                  // fresh state for a round
//     update(state, ctx, dt),              // ctx.run.phase tells you intro/countdown/play/results
//     draw(state, ctx),                    // state may be null on the intro screen
//     shoot(state, ctx, x, y) -> boolean,  // optional; pixel coords; return true on a hit
//     needs: ['body'],                     // optional; parts the game uses (ctx.body)
//     summary(state, run) -> string,       // optional; results-screen stat line
//     formatScore(score) -> string,        // optional; e.g. dollars
//     themed: true }                       // optional; listen for voice themes
//
// Lifecycle: intro --shoot--> countdown (3 s) --> play (duration) --> results --shoot--> countdown ...
//
// Run mode (several games back to back): pass `stage: { index, total }` to label
// the intro, `next: { label, go() }` so results advance to the next game instead
// of replaying, and `onFinish(result)` to collect { score, display, stars, summary }.
// Games may declare `stars: [one, two, three]` score thresholds for the summary.
import { createFx } from './fx.js';
import { sfx } from './sound.js';
import { theme } from './theme.js';

const COUNTDOWN = 3;

function loadBest(id) {
  try { return Number(localStorage.getItem(`arcade.best.${id}`)) || 0; } catch { return 0; }
}
function saveBest(id, score) {
  try { localStorage.setItem(`arcade.best.${id}`, String(score)); } catch {}
}

export function drawReticle(g, x, y, { flash = 0, color = '#ffdc5d' } = {}) {
  const r = 16 + flash * 10;
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 2.5;
  g.shadowColor = '#000a';
  g.shadowBlur = 6;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.moveTo(x + dx * (r - 6), y + dy * (r - 6));
    g.lineTo(x + dx * (r + 10), y + dy * (r + 10));
  }
  g.stroke();
  if (flash > 0) {
    g.globalAlpha = flash;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function label(g, text, x, y, { size = 32, weight = 800, color = '#fff', align = 'center' } = {}) {
  g.font = `${weight} ${size}px system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, size / 8);
  g.strokeStyle = '#0009';
  // Round joins: the default miter join spikes on sharp glyph corners (y, M, V…).
  g.lineJoin = 'round';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

export function starsFor(game, score) {
  return (game.stars ?? []).filter(threshold => score >= threshold).length;
}

export function runMinigame(game, { canvas, wand, body = null, voice = null, onExit, stage = null, next = null, onFinish } = {}) {
  const g = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  function resize() {
    const dpr = devicePixelRatio || 1;
    W = innerWidth;
    H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', resize);

  const fx = createFx();
  const fmt = score => (game.formatScore ? game.formatScore(score) : `${score}`);
  const run = { phase: 'intro', phaseT: 0, score: 0, shots: 0, hits: 0, best: loadBest(game.id), newBest: false };
  const ctx = {
    g, fx, sfx, run, body, wand, voice,
    get theme() { return theme.current; },
    get W() { return W; },
    get H() { return H; },
    rand: (a, b) => a + Math.random() * (b - a),
    progress: () => Math.min(1, run.phase === 'play' ? run.phaseT / game.duration : 0),
    addScore(points, x, y, color = '#fff') {
      run.score += points;
      fx.text(`+${points}`, x, y, color);
    },
  };
  let state = null;
  let flash = 0;
  let toast = null; // { text, t }
  const showToast = text => { toast = { text, t: 2.2 }; };
  wand.on('recenter', () => showToast('Re-centered'));
  wand.on('reanchor', () => showToast('Wand restarted — point at center and press B'));
  let lastSecond = null;

  const setPhase = phase => { run.phase = phase; run.phaseT = 0; lastSecond = null; };
  function start() {
    Object.assign(run, { score: 0, shots: 0, hits: 0, newBest: false });
    state = game.init(ctx);
    fx.clear();
    setPhase('countdown');
  }
  function finish() {
    setPhase('results');
    sfx.end();
    if (run.score > run.best) {
      run.best = run.score;
      run.newBest = true;
      saveBest(game.id, run.score);
    }
    onFinish?.({
      id: game.id, title: game.title, score: run.score, display: fmt(run.score),
      stars: starsFor(game, run.score), summary: game.summary ? game.summary(state, run) : null,
    });
  }
  // From the results screen: next game in a run, otherwise play again.
  const advance = () => (next ? next.go() : start());

  wand.on('shoot', ({ x, y }) => {
    flash = 1;
    if (run.phase === 'intro') return start();
    if (run.phase === 'results' && run.phaseT > 1.2) return advance();
    if (run.phase !== 'play' || !game.shoot) return;
    run.shots += 1;
    sfx.shoot();
    if (game.shoot(state, ctx, x * W, y * H)) run.hits += 1;
    else fx.puff(x * W, y * H);
  });
  addEventListener('keydown', event => {
    if (event.key === 'Enter' && run.phase === 'intro') start();
    if (event.key === 'Enter' && run.phase === 'results' && run.phaseT > 1.2) advance();
    if (event.key === 'Escape' && !wand.capturing) onExit?.();
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    run.phaseT += dt;
    flash = Math.max(0, flash - dt * 6);
    if (toast && (toast.t -= dt) <= 0) toast = null;

    if (run.phase === 'countdown') {
      const second = Math.ceil(COUNTDOWN - run.phaseT);
      if (second !== lastSecond && second > 0) sfx.tick();
      lastSecond = second;
      if (run.phaseT >= COUNTDOWN) { setPhase('play'); sfx.go(); }
    } else if (run.phase === 'play' && run.phaseT >= game.duration) {
      finish();
    }
    if (state) game.update(state, ctx, dt);
    fx.update(dt);

    g.clearRect(0, 0, W, H);
    game.draw(state, ctx);
    fx.draw(g);
    drawHud();
    drawReticle(g, wand.state.x * W, wand.state.y * H, { flash });
    requestAnimationFrame(frame);
  }

  function drawHud() {
    const s = Math.min(W, H);
    if (run.phase === 'play' || run.phase === 'countdown') {
      const left = run.phase === 'play' ? Math.max(0, game.duration - run.phaseT) : game.duration;
      label(g, fmt(run.score), 32, 44, { size: 44, align: 'left' });
      label(g, `${left.toFixed(1)}s`, W - 32, 44, { size: 36, align: 'right', color: left < 4 ? '#ff5d8f' : '#fff' });
      g.fillStyle = '#0005';
      g.fillRect(0, 0, W, 6);
      g.fillStyle = left < 4 ? '#ff5d8f' : '#ffdc5d';
      g.fillRect(0, 0, W * (left / game.duration), 6);
    }
    if (run.phase === 'countdown') {
      const n = Math.ceil(COUNTDOWN - run.phaseT);
      label(g, `${n}`, W / 2, H / 2, { size: s * 0.25 * (1.2 - (run.phaseT % 1) * 0.3) });
    }
    if (run.phase === 'play' && run.phaseT < 0.6) label(g, 'GO!', W / 2, H / 2, { size: s * 0.2 });
    if (run.phase === 'intro') {
      if (stage) label(g, `GAME ${stage.index + 1} / ${stage.total}`, W / 2, H * 0.24, { size: s * 0.035, color: '#ffdc5d' });
      label(g, game.title, W / 2, H * 0.36, { size: s * 0.11 });
      label(g, game.blurb, W / 2, H * 0.36 + s * 0.11, { size: s * 0.035, weight: 600 });
      label(g, game.needs?.includes('body') ? 'Press A, click or Enter to start' : 'Press A (or click) to start', W / 2, H * 0.62, { size: s * 0.045, color: '#ffdc5d' });
      if (run.best) label(g, `Best: ${fmt(run.best)}`, W / 2, H * 0.62 + s * 0.08, { size: s * 0.035, weight: 600 });
    }
    if (run.phase === 'results') {
      const accuracy = run.shots ? Math.round((run.hits / run.shots) * 100) : 0;
      g.fillStyle = '#0006';
      g.fillRect(0, 0, W, H);
      label(g, "Time's up!", W / 2, H * 0.3, { size: s * 0.08 });
      label(g, fmt(run.score), W / 2, H * 0.45, { size: s * (fmt(run.score).length > 6 ? 0.11 : 0.18), color: '#ffdc5d' });
      label(g, run.newBest ? 'NEW BEST!' : `Best: ${fmt(run.best)}`, W / 2, H * 0.58, { size: s * 0.045, color: run.newBest ? '#06d6a0' : '#fff' });
      const stats = game.summary ? game.summary(state, run) : `${run.hits}/${run.shots} shots · ${accuracy}% accuracy`;
      label(g, stats, W / 2, H * 0.65, { size: s * 0.032, weight: 600 });
      const stars = starsFor(game, run.score);
      if (game.stars) label(g, '★'.repeat(stars) + '☆'.repeat(3 - stars), W / 2, H * 0.84, { size: s * 0.06, color: '#ffd60a' });
      if (run.phaseT > 1.2) {
        label(g, next ? `Press A for next: ${next.label} · Esc quits the run` : 'Press A to play again · Esc for menu',
          W / 2, H * 0.76, { size: s * 0.035, color: '#ffdc5d' });
      }
    }
    if (voice?.supported) {
      // Always-on mic: a quiet status line, plus a live caption while you talk.
      const status = voice.error
        ? `🎤 ${voice.error}`
        : voice.enabled ? '🎤 listening — say a theme (M mutes)' : '🎤 muted (M to listen)';
      label(g, status, W / 2, 30, { size: 14, weight: 600, color: voice.error ? '#ff5d8f' : '#ffffffaa' });
      if (voice.interim) label(g, `“${voice.interim}”`, W / 2, 62, { size: 22, weight: 600, color: '#ffdc5d' });
    }
    if (toast) {
      g.globalAlpha = Math.min(1, toast.t * 2);
      label(g, toast.text, W / 2, H - 60, { size: 22, weight: 700, color: '#ffdc5d' });
      g.globalAlpha = 1;
    }
    const ws = wand.state;
    if (ws.connected && (ws.distanceMm || wand.calibration?.dist0)) {
      const dist = ws.distanceMm ? `📏 ${(ws.distanceMm / 1000).toFixed(2)} m` : '📏 —';
      const auto = !ws.distanceAuto ? 'auto-distance off (T)'
        : wand.calibration?.dist0 ? `gain ×${ws.distanceScale.toFixed(2)} (T)` : 'recalibrate (C) for auto-distance';
      label(g, `${dist} · ${auto}`, W - 16, H - 38, { size: 13, weight: 700, align: 'right', color: '#ffdc5d' });
    }
    const chip = wand.state.connected
      ? (wand.state.calibrated ? 'WAND ● B recenter · C calibrate' : 'WAND ● not calibrated for this screen — press C')
      : 'WAND ○ disconnected — mouse mode';
    label(g, chip, W - 16, H - 18, { size: 12, weight: 600, align: 'right', color: wand.state.connected ? '#ffdc5d' : '#aaa' });
  }

  requestAnimationFrame(frame);
  return { run, start, toast: showToast };
}
