// Balloon Pop: targets move across the screen; point and press A to pop them.
// What the targets ARE and HOW they move comes from the current theme:
//   theme.sprite  emoji (null = classic balloon)
//   theme.motion  rise | fall | fly | scurry
//   theme.scene   background (see lib/scenes.js)
import { drawScene } from '../../lib/scenes.js';
import { spriteImage } from '../../lib/sprites.js';

const COLORS = ['#ff4d6d', '#ff9f1c', '#3a86ff', '#8338ec', '#06d6a0', '#fb5607', '#f72585'];
const GOLD = '#ffd60a';
const DURATION = 15;

// Movement styles. spawn() places a target, update() moves it, gone() culls it.
const MOTIONS = {
  // Float up from the bottom with a gentle sway (balloons).
  rise: {
    spawn(b, { W, H, rand }, p) {
      Object.assign(b, { x0: rand(W * 0.08, W * 0.92), y: H + b.r * 1.6, vy: -H * rand(0.17, 0.27) * (1 + p * 0.6), sway: rand(10, 40) });
    },
    update(b, dt) { b.y += b.vy * dt; b.x = b.x0 + Math.sin(b.phase + b.t * b.swayF) * b.sway; },
    gone(b) { return b.y < -b.r * 4; },
  },
  // Drop from the top, spinning (pizza slices).
  fall: {
    spawn(b, { W, H, rand }, p) {
      Object.assign(b, { x0: rand(W * 0.08, W * 0.92), y: -b.r * 2, vy: H * rand(0.16, 0.26) * (1 + p * 0.6), sway: rand(5, 25), spin: rand(-2.5, 2.5) });
    },
    update(b, dt) { b.y += b.vy * dt; b.x = b.x0 + Math.sin(b.phase + b.t * b.swayF) * b.sway; b.angle = b.t * b.spin; },
    gone(b, { H }) { return b.y > H + b.r * 3; },
  },
  // Fly across the sky in a flapping wave (ducks).
  fly: {
    spawn(b, { W, H, rand }, p) {
      const fromLeft = Math.random() < 0.5;
      Object.assign(b, {
        x: fromLeft ? -b.r * 2 : W + b.r * 2, y0: H * rand(0.12, 0.55),
        vx: (fromLeft ? 1 : -1) * W * rand(0.16, 0.26) * (1 + p * 0.5), bob: rand(H * 0.03, H * 0.08), swayF: rand(2, 3.5),
      });
    },
    update(b, dt) { b.x += b.vx * dt; b.y = b.y0 + Math.sin(b.phase + b.t * b.swayF) * b.bob; b.flip = b.vx > 0; b.angle = Math.cos(b.phase + b.t * b.swayF) * 0.2; },
    gone(b, { W }) { return b.x < -b.r * 4 || b.x > W + b.r * 4; },
  },
  // Dart along the ground, pausing now and then (rats).
  scurry: {
    spawn(b, { W, H, rand }, p) {
      const fromLeft = Math.random() < 0.5;
      Object.assign(b, {
        x: fromLeft ? -b.r * 2 : W + b.r * 2, y: H * rand(0.8, 0.9),
        dir: fromLeft ? 1 : -1, speed: W * rand(0.3, 0.45) * (1 + p * 0.4), r: b.r * 1.5,
      });
    },
    update(b, dt) {
      // Bursts of speed with short freezes: 0..1 envelope from a sine.
      const gait = Math.max(0, Math.sin(b.phase + b.t * 2.6)) ** 0.4;
      b.x += b.dir * b.speed * gait * dt;
      b.flip = b.dir > 0;
      b.angle = Math.sin(b.t * 30) * 0.06 * gait;
    },
    gone(b, { W }) { return b.x < -b.r * 4 || b.x > W + b.r * 4; },
  },
};

function spawn(state, ctx) {
  const { W, H, rand } = ctx;
  const theme = ctx.theme ?? {};
  const motion = MOTIONS[theme.motion] ? theme.motion : 'rise';
  const gold = Math.random() < 0.08;
  const b = {
    motion,
    r: Math.min(W, H) * rand(0.045, 0.065) * (gold ? 0.8 : 1),
    x: 0, y: 0, x0: 0, angle: 0, flip: false,
    swayF: rand(0.8, 1.8),
    phase: rand(0, Math.PI * 2),
    color: gold ? GOLD : COLORS[Math.floor(Math.random() * COLORS.length)],
    gold,
    t: 0,
  };
  MOTIONS[motion].spawn(b, ctx, ctx.progress());
  if (gold) { b.vy = (b.vy ?? 0) * 1.4; b.vx = (b.vx ?? 0) * 1.4; b.speed = (b.speed ?? 0) * 1.3; }
  state.balloons.push(b);
}

function drawSprite(g, b, sprite) {
  if (b.motion === 'scurry') {
    // Ground shadow so runners pop off the floor.
    g.fillStyle = '#00000040';
    g.beginPath();
    g.ellipse(b.x, b.y + b.r * 0.95, b.r * 1.1, b.r * 0.25, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.save();
  g.translate(b.x, b.y);
  g.rotate(b.angle || Math.sin(b.t * b.swayF + b.phase) * 0.15);
  // Apple's animal emoji face left; mirror when moving right.
  if (b.flip) g.scale(-1, 1);
  const runner = b.motion === 'scurry';
  const look = b.gold ? (runner ? 'goldRunner' : 'gold') : runner ? 'runner' : 'plain';
  const img = spriteImage(sprite, b.r, look);
  g.drawImage(img, -img.css / 2, -img.css / 2, img.css, img.css);
  g.restore();
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

function burstColors(ctx, b) {
  const palette = ctx.theme?.burst;
  return palette?.length ? palette : [b.color];
}

// Reusable layer: targets moving + shooting them. Other games compose this.
//   rate: spawn-rate multiplier (e.g. 0.5 when the player is busy dodging)
export const balloonLayer = {
  init(ctx) {
    return { balloons: [], spawnIn: 0, popped: 0, themeName: ctx?.theme?.name };
  },

  update(state, ctx, dt, { rate = 1 } = {}) {
    // Theme changed (voice): old targets burst into confetti, a fresh wave arrives.
    const themeName = ctx.theme?.name;
    if (themeName !== state.themeName) {
      state.themeName = themeName;
      for (const b of state.balloons) burstColors(ctx, b).forEach(c => ctx.fx.burst(b.x, b.y, c, 6, 260));
      state.balloons = [];
      if (ctx.run.phase === 'play') for (let i = 0; i < 3; i++) spawn(state, ctx);
    }
    if (ctx.run.phase === 'play') {
      state.spawnIn -= dt;
      if (state.spawnIn <= 0) {
        spawn(state, ctx);
        state.spawnIn = ((0.7 - ctx.progress() * 0.35) / rate) * ctx.rand(0.7, 1.3);
      }
    }
    for (const b of state.balloons) {
      b.t += dt;
      MOTIONS[b.motion].update(b, dt);
    }
    state.balloons = state.balloons.filter(b => !MOTIONS[b.motion].gone(b, ctx));
  },

  shoot(state, ctx, x, y) {
    // Slightly generous hitbox; pick the closest target under the shot.
    let best = null;
    let bestD = Infinity;
    for (const b of state.balloons) {
      const d = ((x - b.x) / (b.r * 1.2)) ** 2 + ((y - b.y) / (b.r * 1.4)) ** 2;
      if (d <= 1 && d < bestD) { best = b; bestD = d; }
    }
    if (!best) return false;
    state.balloons.splice(state.balloons.indexOf(best), 1);
    state.popped += 1;
    const colors = burstColors(ctx, best);
    colors.forEach(c => ctx.fx.burst(best.x, best.y, c, Math.ceil((best.gold ? 30 : 18) / colors.length)));
    ctx.addScore(best.gold ? 3 : 1, best.x, best.y - best.r, best.gold ? GOLD : '#fff');
    best.gold ? ctx.sfx.bonus() : ctx.sfx.pop();
    return true;
  },

  draw(state, ctx) {
    const sprite = ctx.theme?.sprite;
    for (const b of state?.balloons ?? []) sprite ? drawSprite(ctx.g, b, sprite) : drawBalloon(ctx.g, b);
  },
};

let sceneTime = 0;
export default {
  id: 'balloons',
  title: 'Balloon Pop',
  blurb: `Pop as many as you can in ${DURATION} seconds. Gold = 3 points. Say a theme to change them!`,
  duration: DURATION,
  themed: true,
  init: balloonLayer.init,
  update: balloonLayer.update,
  shoot: balloonLayer.shoot,
  draw(state, ctx) {
    sceneTime += 1 / 60;
    drawScene(ctx.theme?.scene ?? 'sky', ctx.g, ctx.W, ctx.H, sceneTime, ctx.theme?.sky);
    balloonLayer.draw(state, ctx);
  },
};
