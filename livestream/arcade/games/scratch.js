// Bodega Bucks: scratch-off tickets at the corner bodega. Point the wand at the
// ticket and SHAKE it left-right to scratch (or hold A). Match 3 symbols to win
// that prize. Every so often: 💎💎💎 JACKPOT. Press J to rig a jackpot (demo): the
// current ticket if you haven't started scratching it, otherwise the next one.
// Fictional game and ticket design — not any real lottery's branding.
import { drawScene } from '../../lib/scenes.js';
import { spriteImage } from '../../lib/sprites.js';

const DURATION = 20;
const JACKPOT_CHANCE = 0.07;
const SYMBOLS = [
  { s: '🍀', prize: 2 },
  { s: '🐈', prize: 5 },
  { s: '🍕', prize: 10 },
  { s: '💵', prize: 50 },
  { s: '🗽', prize: 500 },
  { s: '💎', prize: 1_000_000, jackpot: true },
];
const CELLS = 8;               // per-panel coverage grid (CELLS × CELLS)
const PANEL_DONE = 0.55;       // fraction scratched before a panel pops open
const SCRATCH_SHAKE = 0.18;    // wand shake level that counts as scratching

let rigNext = false;
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'j') rigNext = true; });

const money = n => `$${n.toLocaleString('en-US')}`;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Decide the ticket's outcome first, then lay out 6 symbols that produce it.
function makeOutcome() {
  const r = Math.random();
  let win = null;
  if (rigNext || r < JACKPOT_CHANCE) win = SYMBOLS[5];
  else if (r < 0.15) win = SYMBOLS[3 + Math.floor(Math.random() * 2)];
  else if (r < 0.5) win = SYMBOLS[Math.floor(Math.random() * 3)];
  rigNext = false;
  const counts = new Map();
  const symbols = [];
  if (win) { symbols.push(win, win, win); counts.set(win, 3); }
  // Fill the rest with at most two of any symbol (no accidental second win).
  // Losing tickets often tease two 💎.
  if (!win && Math.random() < 0.35) { symbols.push(SYMBOLS[5], SYMBOLS[5]); counts.set(SYMBOLS[5], 2); }
  while (symbols.length < 6) {
    const pick = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    if (pick === win || (counts.get(pick) ?? 0) >= 2) continue;
    counts.set(pick, (counts.get(pick) ?? 0) + 1);
    symbols.push(pick);
  }
  return { win, symbols: shuffle(symbols) };
}

// Ticket geometry (CSS px), centred on screen.
function layout(W, H) {
  const h = Math.min(H * 0.78, W * 0.9 / 0.68);
  const w = h * 0.68;
  const x = W / 2 - w / 2;
  const y = H * 0.1;
  const pad = w * 0.06;
  const gridTop = h * 0.3;
  const gridH = h * 0.5;
  const cellW = (w - pad * 2 - pad) / 3;
  const cellH = (gridH - pad) / 2;
  const panels = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      panels.push({ x: pad + col * (cellW + pad / 2), y: gridTop + row * (cellH + pad), w: cellW, h: cellH });
    }
  }
  return { x, y, w, h, panels, brush: w * 0.07 };
}

function makeTicket(ctx) {
  const L = layout(ctx.W, ctx.H);
  const outcome = makeOutcome();
  // Scratch layer: silver foil over each panel, erased with destination-out.
  const mask = document.createElement('canvas');
  const dpr = devicePixelRatio || 1;
  mask.width = Math.ceil(L.w * dpr);
  mask.height = Math.ceil(L.h * dpr);
  const m = mask.getContext('2d');
  m.scale(dpr, dpr);
  for (const p of L.panels) {
    const foil = m.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    foil.addColorStop(0, '#c0c0c0');
    foil.addColorStop(0.5, '#eeeeee');
    foil.addColorStop(1, '#9e9e9e');
    m.fillStyle = foil;
    m.beginPath();
    m.roundRect(p.x, p.y, p.w, p.h, 8);
    m.fill();
    m.strokeStyle = '#ffffff66';
    m.lineWidth = 2;
    for (let i = -p.h; i < p.w; i += 14) { m.beginPath(); m.moveTo(p.x + i, p.y + p.h); m.lineTo(p.x + i + p.h, p.y); m.stroke(); }
    m.fillStyle = '#7a7a7a';
    m.font = `800 ${p.h * 0.18}px system-ui`;
    m.textAlign = 'center';
    m.textBaseline = 'middle';
    m.fillText('SCRATCH', p.x + p.w / 2, p.y + p.h / 2);
  }
  m.globalCompositeOperation = 'destination-out';
  return {
    L, outcome, mask, m,
    panels: L.panels.map((rect, i) => ({ rect, sym: outcome.symbols[i], cells: new Uint8Array(CELLS * CELLS), revealed: 0, open: false })),
    slide: 0, resolved: false, resultT: 0, leaving: 0,
  };
}

function scratchAt(state, ctx, ticket, px, py) {
  const { L, m } = ticket;
  const lx = px - L.x - (1 - ease(ticket.slide)) * ctx.W;
  const ly = py - L.y;
  if (lx < -L.brush || ly < -L.brush || lx > L.w + L.brush || ly > L.h + L.brush) return false;
  m.beginPath();
  m.arc(lx, ly, L.brush, 0, Math.PI * 2);
  m.fill();
  let hit = false;
  for (const panel of ticket.panels) {
    if (panel.open) continue;
    const { x, y, w, h } = panel.rect;
    if (lx < x - L.brush || lx > x + w + L.brush || ly < y - L.brush || ly > y + h + L.brush) continue;
    hit = true;
    let marked = 0;
    for (let cy = 0; cy < CELLS; cy++) {
      for (let cx = 0; cx < CELLS; cx++) {
        const i = cy * CELLS + cx;
        if (!panel.cells[i]) {
          const ccx = x + (cx + 0.5) * (w / CELLS);
          const ccy = y + (cy + 0.5) * (h / CELLS);
          if ((ccx - lx) ** 2 + (ccy - ly) ** 2 <= L.brush ** 2) panel.cells[i] = 1;
        }
        marked += panel.cells[i];
      }
    }
    panel.revealed = marked / (CELLS * CELLS);
    if (panel.revealed >= PANEL_DONE) {
      panel.open = true;
      m.fillRect(x - 2, y - 2, w + 4, h + 4); // clear the rest of this panel's foil
      ctx.sfx.reveal();
      ctx.fx.burst(L.x + x + w / 2, L.y + y + h / 2, '#dddddd', 10, 220);
    }
  }
  return hit;
}

function resolve(state, ctx, ticket) {
  ticket.resolved = true;
  ticket.resultT = 0;
  state.tickets += 1;
  const win = ticket.outcome.win;
  const { L } = ticket;
  if (!win) {
    ctx.sfx.hit();
    return;
  }
  state.biggest = Math.max(state.biggest, win.prize);
  ctx.addScore(win.prize, ctx.W / 2, L.y + L.h * 0.2, win.jackpot ? '#ffd60a' : '#06d6a0');
  if (win.jackpot) {
    state.jackpots += 1;
    state.flash = 1;
    ctx.sfx.jackpot();
    for (let i = 0; i < 80; i++) {
      state.rain.push({ x: Math.random() * ctx.W, y: -Math.random() * ctx.H * 0.8, vy: ctx.H * (0.3 + Math.random() * 0.4), spin: (Math.random() - 0.5) * 6, a: 0, s: Math.random() < 0.6 ? '💵' : '💎' });
    }
    for (let i = 0; i < 6; i++) ctx.fx.burst(Math.random() * ctx.W, Math.random() * ctx.H * 0.6, '#ffd60a', 30, 500);
  } else {
    ctx.sfx.win();
    ctx.fx.burst(ctx.W / 2, L.y + L.h * 0.5, '#06d6a0', 30, 400);
  }
}

const ease = t => 1 - (1 - Math.min(1, t)) ** 3;

function drawTicket(g, ctx, ticket) {
  const { L } = ticket;
  const ox = L.x + (1 - ease(ticket.slide)) * ctx.W - ticket.leaving * ctx.W * 1.2;
  g.save();
  g.translate(ox, L.y);
  g.rotate(-0.02 + ticket.leaving * -0.2);
  // card
  g.shadowColor = '#0008';
  g.shadowBlur = 24;
  const card = g.createLinearGradient(0, 0, 0, L.h);
  card.addColorStop(0, '#5f0f40');
  card.addColorStop(1, '#9a031e');
  g.fillStyle = card;
  g.beginPath();
  g.roundRect(0, 0, L.w, L.h, 16);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = '#ffd60a';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(8, 8, L.w - 16, L.h - 16, 12);
  g.stroke();
  // header
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd60a';
  g.font = `900 ${L.w * 0.12}px system-ui`;
  g.fillText('BODEGA BUCKS', L.w / 2, L.h * 0.1);
  g.fillStyle = '#fff';
  g.font = `700 ${L.w * 0.045}px system-ui`;
  g.fillText('MATCH 3 SYMBOLS · WIN THAT PRIZE', L.w / 2, L.h * 0.19);
  g.font = `800 ${L.w * 0.05}px system-ui`;
  g.fillStyle = '#ffd60a';
  g.fillText('TOP PRIZE $1,000,000', L.w / 2, L.h * 0.25);
  // panels (under the foil)
  for (const panel of ticket.panels) {
    const { x, y, w, h } = panel.rect;
    const winner = ticket.resolved && ticket.outcome.win === panel.sym;
    g.fillStyle = winner ? '#fff3b0' : '#fffaf0';
    g.beginPath();
    g.roundRect(x, y, w, h, 8);
    g.fill();
    const img = spriteImage(panel.sym.s, h * 0.24, panel.sym.jackpot && winner ? 'gold' : 'plain');
    g.drawImage(img, x + w / 2 - img.css / 2, y + h * 0.42 - img.css / 2, img.css, img.css);
    g.fillStyle = '#333';
    g.font = `800 ${h * 0.14}px system-ui`;
    g.fillText(panel.sym.jackpot ? 'JACKPOT' : money(panel.sym.prize), x + w / 2, y + h * 0.84);
  }
  g.drawImage(ticket.mask, 0, 0, L.w, L.h);
  // legend
  g.font = `600 ${L.w * 0.038}px system-ui`;
  g.fillStyle = '#ffffffcc';
  g.fillText('🍀$2  🐈$5  🍕$10  💵$50  🗽$500  💎JACKPOT', L.w / 2, L.h * 0.9);
  // result stamp
  if (ticket.resolved) {
    const win = ticket.outcome.win;
    const scale = Math.min(1, ticket.resultT * 4);
    g.save();
    g.translate(L.w / 2, L.h * 0.55);
    g.rotate(-0.15);
    g.scale(scale, scale);
    g.fillStyle = win ? (win.jackpot ? '#ffd60a' : '#06d6a0') : '#ffffffdd';
    g.strokeStyle = '#000';
    g.lineWidth = 6;
    g.font = `900 ${L.w * (win?.jackpot ? 0.13 : 0.11)}px system-ui`;
    const text = win ? (win.jackpot ? 'JACKPOT!' : `WIN ${money(win.prize)}`) : 'NOT A WINNER';
    g.lineJoin = 'round';
    g.strokeText(text, 0, 0);
    g.fillText(text, 0, 0);
    if (win?.jackpot) {
      g.font = `900 ${L.w * 0.09}px system-ui`;
      g.strokeText(money(win.prize), 0, L.w * 0.13);
      g.fillText(money(win.prize), 0, L.w * 0.13);
    }
    g.restore();
  }
  g.restore();
}

export default {
  id: 'scratch',
  title: 'Bodega Bucks',
  tagline: 'Shake the wand to scratch lotto tickets.',
  icon: '🎟️',
  inputs: ['wand'],
  stars: [10, 100, 1000],
  blurb: `Point at the ticket and SHAKE the wand to scratch. Match 3 to win. ${DURATION} s.`,
  duration: DURATION,
  formatScore: money,

  init(ctx) {
    return { ticket: makeTicket(ctx), tickets: 0, biggest: 0, jackpots: 0, rain: [], flash: 0, lastSfx: 0, last: null };
  },

  update(state, ctx, dt) {
    const t = state.ticket;
    t.slide = Math.min(1, t.slide + dt * 3);
    state.flash = Math.max(0, state.flash - dt * 1.2);
    for (const c of state.rain) { c.y += c.vy * dt; c.a += c.spin * dt; }
    state.rain = state.rain.filter(c => c.y < ctx.H + 60);

    // Demo rig: swap an untouched ticket for a jackpot one straight away.
    if (rigNext && !t.resolved && t.panels.every(p => p.revealed === 0)) {
      const rigged = makeTicket(ctx);
      rigged.slide = t.slide;
      state.ticket = rigged;
      return;
    }
    if (t.resolved) {
      t.resultT += dt;
      const hold = t.outcome.win?.jackpot ? 2.6 : 1.3;
      if (t.resultT > hold) t.leaving = Math.min(1, t.leaving + dt * 3);
      // Deal the next ticket only while the round is running.
      if (t.leaving >= 1 && ctx.run.phase === 'play') { state.ticket = makeTicket(ctx); state.last = null; }
      return;
    }
    if (ctx.run.phase !== 'play' || t.slide < 1) return;

    // Scratch while shaking (or holding A / the mouse button), along the path
    // the reticle travelled since last frame so fast shakes leave solid strokes.
    const w = ctx.wand.state;
    const scratching = w.shake > SCRATCH_SHAKE || w.held;
    const px = w.x * ctx.W;
    const py = w.y * ctx.H;
    if (scratching) {
      const from = state.last ?? { x: px, y: py };
      const dist = Math.hypot(px - from.x, py - from.y);
      const steps = Math.max(1, Math.ceil(dist / (t.L.brush * 0.4)));
      let hit = false;
      for (let i = 1; i <= steps; i++) {
        hit = scratchAt(state, ctx, t, from.x + ((px - from.x) * i) / steps, from.y + ((py - from.y) * i) / steps) || hit;
      }
      if (hit && ctx.run.phaseT - state.lastSfx > 0.06) {
        state.lastSfx = ctx.run.phaseT;
        ctx.sfx.scratch();
        ctx.fx.burst(px, py, '#cfcfcf', 3, 160);
      }
      if (t.panels.every(p => p.open)) resolve(state, ctx, t);
    }
    state.last = scratching ? { x: px, y: py } : null;
  },

  draw(state, ctx) {
    const { g, W, H } = ctx;
    drawScene('bodega', g, W, H, 0, ['#2b2118', '#4a3728']);
    if (state) drawTicket(g, ctx, state.ticket);
    // coin cursor + shake meter
    const w = ctx.wand.state;
    const coin = spriteImage('🪙', Math.min(W, H) * 0.035);
    g.save();
    g.translate(w.x * W, w.y * H);
    g.rotate(Math.sin(performance.now() / 60) * w.shake * 0.8);
    g.drawImage(coin, -coin.css / 2, -coin.css / 2, coin.css, coin.css);
    g.restore();
    const mx = W - 40, top = H * 0.3, mh = H * 0.4;
    g.fillStyle = '#0008';
    g.fillRect(mx - 10, top, 20, mh);
    g.fillStyle = w.shake > SCRATCH_SHAKE || w.held ? '#06d6a0' : '#ffdc5d';
    g.fillRect(mx - 10, top + mh * (1 - w.shake), 20, mh * w.shake);
    g.fillStyle = '#fff';
    g.font = '600 12px system-ui';
    g.textAlign = 'center';
    g.fillText('SHAKE', mx, top - 10);
    // jackpot money rain + flash
    for (const c of state?.rain ?? []) {
      const img = spriteImage(c.s, 22);
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.a);
      g.drawImage(img, -img.css / 2, -img.css / 2, img.css, img.css);
      g.restore();
    }
    if (state?.flash) {
      g.fillStyle = `rgba(255, 214, 10, ${state.flash * 0.35})`;
      g.fillRect(0, 0, W, H);
    }
    if (state && ctx.run.phase === 'play') {
      g.fillStyle = '#ffffffcc';
      g.font = '600 15px system-ui';
      g.textAlign = 'center';
      g.fillText(`${state.tickets} ticket${state.tickets === 1 ? '' : 's'} · shake to scratch (or hold A) · J = rig a jackpot`, W / 2, H - 16);
    }
  },

  summary(state) {
    return `${state.tickets} ticket${state.tickets === 1 ? '' : 's'} · biggest ${money(state.biggest)}${state.jackpots ? ` · ${state.jackpots} JACKPOT${state.jackpots > 1 ? 'S' : ''}!` : ''}`;
  },
};
