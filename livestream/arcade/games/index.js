// Minigame registry. Add a game: create games/<id>.js and list it here.
import balloons from './balloons.js';
import duck from './duck.js';
import gauntlet from './gauntlet.js';
import scratch from './scratch.js';

export const games = [balloons, duck, scratch, gauntlet];

// "Play all" order: warm up with the wand, then the body, then both at once.
export const RUN_ORDER = ['balloons', 'duck', 'scratch', 'gauntlet'];
