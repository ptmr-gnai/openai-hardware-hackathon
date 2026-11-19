// Starter game for the Codex Arcade SDK. Copy it with:
//   ./scripts/new-game.sh my-game
// then open http://127.0.0.1:8765/sdk/playground.html?src=/sdk/games/my-game.js
//
// This example: "Squat Pop" — balloons rise; pop them with the wand, and every
// squat (a duck below your standing height) scores a point. Shows how to read inputs,
// reuse a layer, draw a scene, and score.
import { defineGame, balloonLayer, drawScene } from '/sdk/index.js';

export default defineGame({
  id: 'my-game',                 // unique; also the key for best scores
  title: 'Squat Pop',
  tagline: 'Squat for points, pop balloons with the wand.',
  blurb: 'Every squat scores. Pop balloons with the wand too. 30 s.',
  duration: 30,                  // seconds per round
  inputs: ['wand', 'body'],      // 'wand' | 'body' | 'voice' — 'body' turns on the webcam tracker
  stars: [10, 20, 30],           // score thresholds for ★ ★★ ★★★ in run summaries

  // Fresh state at the start of each round. ctx.W / ctx.H are the canvas size.
  init(ctx) {
    return { pop: balloonLayer.init(ctx), squats: 0, wasDown: false };
  },

  // Every frame. ctx.run.phase is 'intro' | 'countdown' | 'play' | 'results'.
  update(state, ctx, dt) {
    balloonLayer.update(state.pop, ctx, dt, { rate: 0.5 });
    // ctx.body: ducking, duckAmount, dodgeSide, lean, head, hands, ready …
    const down = ctx.body?.ducking ?? false;
    if (ctx.run.phase === 'play' && down && !state.wasDown) {
      state.squats += 1;
      ctx.addScore(1, ctx.W / 2, ctx.H * 0.8, '#06d6a0');
      ctx.sfx.whoosh();
    }
    state.wasDown = down;
  },

  // Wand A press / mouse click, in pixels. Return true on a hit.
  shoot(state, ctx, x, y) {
    return balloonLayer.shoot(state.pop, ctx, x, y);
  },

  // Draw everything (the engine adds HUD, reticle and effects on top).
  // state is null on the intro screen.
  draw(state, ctx) {
    drawScene('nyc', ctx.g, ctx.W, ctx.H, performance.now() / 1000, ['#ff7b54', '#ffd56b']);
    balloonLayer.draw(state?.pop, ctx);
    ctx.body?.drawPreview(ctx.g, 16, ctx.H - 196, 240, 180);
  },

  // Results-screen line.
  summary(state) {
    return `${state.squats} squats · ${state.pop.popped} popped`;
  },
});
