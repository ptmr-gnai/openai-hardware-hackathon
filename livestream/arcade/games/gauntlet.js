// Gauntlet: Bob & Weave + Balloon Pop at once. Dodge with your body,
// pop balloons with the wand. Built entirely from the two games' layers.
import { balloonLayer } from './balloons.js';
import { dodgeLayer } from './duck.js';

const DURATION = 15;
const BALLOON_RATE = 0.55; // fewer balloons than Balloon Pop: you're busy dodging

export default {
  id: 'gauntlet',
  title: 'Gauntlet',
  tagline: 'Dodge with your body while you shoot.',
  icon: '🔥',
  inputs: ['body', 'wand', 'voice'],
  stars: [6, 12, 18],
  blurb: `Duck & dodge with your body, pop balloons with the wand. ${DURATION} s.`,
  duration: DURATION,
  needs: ['body'],
  themed: true,

  init(ctx) {
    return { dodge: dodgeLayer.init(ctx), pop: balloonLayer.init(ctx) };
  },

  update(state, ctx, dt) {
    dodgeLayer.update(state.dodge, ctx, dt);
    balloonLayer.update(state.pop, ctx, dt, { rate: BALLOON_RATE });
  },

  shoot(state, ctx, x, y) {
    return balloonLayer.shoot(state.pop, ctx, x, y);
  },

  draw(state, ctx) {
    dodgeLayer.drawWorld(state?.dodge, ctx);
    balloonLayer.draw(state?.pop, ctx);
    dodgeLayer.drawOverlay(state?.dodge, ctx);
  },

  summary(state) {
    return `${state.pop.popped} popped · ${state.dodge.dodges} dodged · ${state.dodge.hits} bonked`;
  },
};
