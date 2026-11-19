// Balloon Pop: balloons float up and away; point and press A to pop them.
const COLORS = ['#ff4d6d', '#ff9f1c', '#3a86ff', '#8338ec', '#06d6a0', '#fb5607', '#f72585'];
const GOLD = '#ffd60a';
const DURATION = 15;

function spawn(state, ctx) {
  const { W, H, rand } = ctx;
  const p = ctx.progress();
  const gold = Math.random() < 0.08;
  const r = Math.min(W, H) * rand(0.045, 0.065) * (gold ? 0.8 : 1);
  state.balloons.push({
    x0: rand(W * 0.08, W * 0.92),
    x: 0,
    y: H + r * 1.6,
    r,
    vy: H * rand(0.17, 0.27) * (1 + p * 0.6) * (gold ? 1.5 : 1),
    sway: rand(10, 40),
    swayF: rand(0.8, 1.8),
    phase: rand(0, Math.PI * 2),
    color: gold ? GOLD : COLORS[Math.floor(Math.random() * COLORS.length)],
    gold,
    t: 0,
  });
}

function drawBalloon(g, b) {
  const { x, y, r } = b;
  // string
  g.strokeStyle = '#ffffffaa';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x, y + r * 1.25);
  g.quadraticCurveTo(x + Math.sin(b.t * 3 + b.phase) * r * 0.5, y + r * 2, x, y + r * 2.8);
  g.stroke();
  // knot
  g.fillStyle = b.color;
  g.beginPath();
  g.moveTo(x, y + r * 1.15);
  g.lineTo(x - r * 0.15, y + r * 1.35);
  g.lineTo(x + r * 0.15, y + r * 1.35);
  g.fill();
  // body
  if (b.gold) { g.shadowColor = GOLD; g.shadowBlur = 25; }
  g.beginPath();
  g.ellipse(x, y, r, r * 1.2, 0, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  // highlight
  g.fillStyle = '#ffffff66';
  g.beginPath();
  g.ellipse(x - r * 0.35, y - r * 0.45, r * 0.22, r * 0.35, -0.5, 0, Math.PI * 2);
  g.fill();
}

function drawSky(g, ctx, clouds, t) {
  const { W, H } = ctx;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2b6cb0');
  sky.addColorStop(1, '#90cdf4');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffffb0';
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

const clouds = Array.from({ length: 6 }, () => ({
  x: Math.random(), y: 0.1 + Math.random() * 0.6, size: 30 + Math.random() * 40, speed: 8 + Math.random() * 18,
}));
let skyTime = 0;

// Reusable layer: balloons rising + shooting them. Other games compose this.
//   rate: spawn-rate multiplier (e.g. 0.5 when the player is busy dodging)
export const balloonLayer = {
  init() {
    return { balloons: [], spawnIn: 0, popped: 0 };
  },

  update(state, ctx, dt, { rate = 1 } = {}) {
    if (ctx.run.phase === 'play') {
      state.spawnIn -= dt;
      if (state.spawnIn <= 0) {
        spawn(state, ctx);
        state.spawnIn = ((0.7 - ctx.progress() * 0.35) / rate) * ctx.rand(0.7, 1.3);
      }
    }
    for (const b of state.balloons) {
      b.t += dt;
      b.y -= b.vy * dt;
      b.x = b.x0 + Math.sin(b.phase + b.t * b.swayF) * b.sway;
    }
    state.balloons = state.balloons.filter(b => b.y > -b.r * 4);
  },

  shoot(state, ctx, x, y) {
    // Slightly generous hitbox; pick the closest balloon under the shot.
    let best = null;
    let bestD = Infinity;
    for (const b of state.balloons) {
      const d = ((x - b.x) / (b.r * 1.2)) ** 2 + ((y - b.y) / (b.r * 1.4)) ** 2;
      if (d <= 1 && d < bestD) { best = b; bestD = d; }
    }
    if (!best) return false;
    state.balloons.splice(state.balloons.indexOf(best), 1);
    state.popped += 1;
    ctx.fx.burst(best.x, best.y, best.color, best.gold ? 30 : 18);
    ctx.addScore(best.gold ? 3 : 1, best.x, best.y - best.r, best.gold ? GOLD : '#fff');
    best.gold ? ctx.sfx.bonus() : ctx.sfx.pop();
    return true;
  },

  draw(state, ctx) {
    for (const b of state?.balloons ?? []) drawBalloon(ctx.g, b);
  },
};

export default {
  id: 'balloons',
  title: 'Balloon Pop',
  blurb: `Pop as many balloons as you can in ${DURATION} seconds. Gold = 3 points.`,
  duration: DURATION,
  init: balloonLayer.init,
  update: balloonLayer.update,
  shoot: balloonLayer.shoot,
  draw(state, ctx) {
    skyTime += 1 / 60;
    drawSky(ctx.g, ctx, clouds, skyTime);
    balloonLayer.draw(state, ctx);
  },
};
