// Codex Arcade SDK — one import for building games on the wand / webcam / voice
// parts. See docs/SDK.md. Plain ES modules, no build step:
//
//   import { defineGame, mountGame, balloonLayer, drawScene } from '/sdk/index.js';
//
// This file only re-exports the parts in /lib and the reusable game layers, and
// adds two helpers: defineGame() (validate + defaults) and mountGame() (host a
// game on a full-screen canvas with all inputs wired up). The arcade itself uses
// mountGame, so anything that works there works here.
import { createWand } from '../lib/wand.js';
import { createBody } from '../lib/body.js';
import { createVoice } from '../lib/voice.js';
import { theme, resolveTheme } from '../lib/theme.js';
import { runCalibration } from '../lib/calibrate.js';
import { runMinigame } from '../lib/engine.js';

// ---- parts ----------------------------------------------------------------
export { createWand, solveCalibration, CAL_TARGETS } from '../lib/wand.js';
export { createBody } from '../lib/body.js';
export { createVoice } from '../lib/voice.js';
export { theme, resolveTheme, DEFAULT_THEME } from '../lib/theme.js';
export { runCalibration } from '../lib/calibrate.js';
export { runMinigame, starsFor, drawReticle } from '../lib/engine.js';
export { createFx } from '../lib/fx.js';
export { sfx } from '../lib/sound.js';
export { spriteImage } from '../lib/sprites.js';
export { drawScene } from '../lib/scenes.js';
export { oneEuro } from '../lib/filters.js';

// ---- reusable game layers (compose these into new games) -------------------
export { balloonLayer } from '../arcade/games/balloons.js';
export { dodgeLayer } from '../arcade/games/duck.js';

export const INPUTS = ['wand', 'body', 'voice'];

/**
 * Validate a game object and fill in defaults.
 *
 * Required: id, title, duration (s), init(ctx), update(state, ctx, dt), draw(state, ctx).
 * Optional: shoot(state, ctx, x, y) -> hit, summary(state, run), formatScore(score),
 *           blurb, tagline, icon, stars: [one, two, three], inputs: ['wand'|'body'|'voice'].
 * `needs` (body tracking) and `themed` (voice themes) default from `inputs`.
 */
export function defineGame(spec) {
  const problems = [];
  for (const key of ['id', 'title']) if (typeof spec[key] !== 'string' || !spec[key]) problems.push(`${key} must be a non-empty string`);
  if (!(spec.duration > 0)) problems.push('duration must be a positive number of seconds');
  for (const key of ['init', 'update', 'draw']) if (typeof spec[key] !== 'function') problems.push(`${key}() is required`);
  for (const key of ['shoot', 'summary', 'formatScore']) if (spec[key] && typeof spec[key] !== 'function') problems.push(`${key} must be a function`);
  if (spec.stars && !(Array.isArray(spec.stars) && spec.stars.length === 3)) problems.push('stars must be [one, two, three] thresholds');
  const inputs = spec.inputs ?? ['wand'];
  for (const input of inputs) if (!INPUTS.includes(input)) problems.push(`unknown input "${input}" (use ${INPUTS.join(', ')})`);
  if (problems.length) throw new Error(`defineGame(${spec.id ?? '?'}): ${problems.join('; ')}`);
  return {
    blurb: '',
    ...spec,
    inputs,
    needs: spec.needs ?? (inputs.includes('body') ? ['body'] : []),
    themed: spec.themed ?? inputs.includes('voice'),
  };
}

/**
 * Host a game full-screen with every input it asks for.
 *   canvas   — the <canvas> to draw on (sized to the window by the engine)
 *   wand     — an existing wand (else one is created on `surface`)
 *   onExit   — called on Esc (default: go to the arcade menu)
 *   stage / next / onFinish — run-mode options, passed to runMinigame
 * Returns { engine, wand, body, voice }.
 */
export function mountGame(game, { canvas, wand = null, surface = 'arcade', onExit = () => { location.href = '/arcade/'; }, ...runOptions } = {}) {
  wand ??= createWand({ surface });
  wand.attachMouse(canvas);
  canvas.hidden = false;
  addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'c' && !wand.capturing) runCalibration(wand);
  });
  const body = game.needs?.includes('body') ? createBody() : null;
  body?.start().catch(error => console.warn('Body tracking unavailable:', error));
  // Voice themes only where targets are themeable (avoids room-chatter toasts elsewhere).
  const voice = game.themed ? createVoice() : null;
  const engine = runMinigame(game, { canvas, wand, body, voice, onExit, ...runOptions });
  // Say a theme ("teddy bears") → the targets change, mid-round included.
  voice?.on('command', async text => {
    const next = await resolveTheme(text);
    if (!next) return;
    theme.set(next);
    engine.toast(next.sprite ? `${next.sprite}  ${next.name}!` : 'Back to balloons');
  });
  return { engine, wand, body, voice };
}
