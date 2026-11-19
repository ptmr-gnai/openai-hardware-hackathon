# Codex Arcade SDK

Build short motion games on top of the StickS3 wand, a webcam and the mic.
Plain ES modules served from `livestream/` — no build step, no npm.

```js
import { defineGame, mountGame, balloonLayer, drawScene } from '/sdk/index.js';
```

## Quick start

```sh
./scripts/serve-livestream.sh                      # page server on :8765 (no-cache)
work/platformio-venv/bin/python pointer/pointer_bridge.py   # wand bridge (USB or BLE)
./scripts/setup-vision.sh                           # once: offline pose model for body games
./scripts/new-game.sh squat-pop                     # scaffold a game from the template
open "http://127.0.0.1:8765/sdk/playground.html?src=/sdk/games/squat-pop.js"
```

The playground runs any game module directly. To ship it in the arcade, import it
in `livestream/arcade/games/index.js` and add it to `games` (and `RUN_ORDER` for
Play all). Without the wand, the mouse aims and clicks; without a camera,
`Space`/`↓` duck and `←`/`→` dodge.

## The game contract

A game is a plain object. `defineGame()` validates it and fills defaults.

| Field | Required | Meaning |
|---|---|---|
| `id`, `title` | ✓ | Unique id (also the best-score key) and display name |
| `duration` | ✓ | Seconds per round |
| `init(ctx)` | ✓ | Returns fresh state for a round |
| `update(state, ctx, dt)` | ✓ | Every frame; `ctx.run.phase` is `intro` / `countdown` / `play` / `results` |
| `draw(state, ctx)` | ✓ | Every frame; `state` is `null` on the intro. HUD, reticle and fx are drawn on top |
| `shoot(state, ctx, x, y)` | | Wand A / mouse click in pixels; return `true` on a hit |
| `summary(state, run)` | | Results-screen line |
| `formatScore(score)` | | e.g. dollars |
| `inputs` | | `['wand' \| 'body' \| 'voice']`; `body` starts the webcam tracker, `voice` listens for themes |
| `stars` | | `[one, two, three]` score thresholds for run summaries |
| `blurb`, `tagline`, `icon` | | Intro text, home-card line, icon |

Lifecycle: `intro → countdown (3 s) → play (duration) → results`. A press of A,
a click or `Enter` starts / replays; `Esc` returns to the menu.

### `ctx`

| Field | |
|---|---|
| `g`, `W`, `H` | 2D context and canvas size (CSS px; DPR handled) |
| `run` | `{ phase, phaseT, score, shots, hits, best }` |
| `progress()` | 0→1 through the round (ramp difficulty with it) |
| `addScore(points, x, y, color)` | Adds score and a floating `+n` |
| `fx` | `burst(x, y, color, n, speed)`, `puff(x, y)`, `text(label, x, y, color)` |
| `sfx` | `pop shoot bonus whoosh hit scratch reveal win jackpot tick go end` |
| `wand` | See below |
| `body` | See below (only when `inputs` has `body`) |
| `voice` | See below (only when `inputs` has `voice`) |
| `theme` | Current theme `{ name, sprite, motion, scene, sky, burst }` |
| `rand(a, b)` | Random float |

## Parts

### Wand — `createWand()`  (`ctx.wand`)
`state`: `x, y` (0–1, calibrated + 1€-filtered), `connected`, `source` (`wand`/`mouse`),
`calibrated`, `speed` (screens/s), `shake` (0–1), `held` (A or mouse button),
`distanceMm` (ToF, smoothed; `null` when out of range), `distanceScale`, `distanceAuto`.
Events: `shoot` (A, using the aim from ~120 ms before the press), `recenter` (B),
`reanchor` (bridge restarted), `connect` / `disconnect`.
Calibration: `runCalibration(wand)` (5 targets; `C` in any game).

### Body — `createBody()`  (`ctx.body`)
Local MediaPipe pose. `ready`, `tracking`, `ducking` / `duckAmount` (≥1 = ducked),
`dodgeSide` (−1/0/1) / `dodgeAmount`, `lean`, `head`, `hands[]` (mirrored 0–1),
`status`, `calibrate()` (`R`), `drawPreview(g, x, y, w, h)`.

### Voice — `createVoice()`  (`ctx.voice`)
Always-on Chrome speech recognition. `on('command', text => …)`, `enabled`,
`interim`, `error`; `M` mutes. Pair with `resolveTheme(text)` → theme or `null`,
and `theme.set(next)`.

### Drawing
`drawScene(name, g, W, H, t, sky)` — `sky`, `nyc`, `subway`, `pond`, `bodega`, `timesSquare`
(static parts cached). `spriteImage(emoji, radius, look)` — cached emoji sprites
(`plain`, `gold`, `runner`, `goldRunner`); draw with
`g.drawImage(img, x - img.css / 2, y - img.css / 2, img.css, img.css)`.

### Layers (compose games)
- `balloonLayer` — rising/falling/flying/scurrying targets driven by the theme:
  `init`, `update(state, ctx, dt, { rate })`, `shoot`, `draw`; `state.popped`.
- `dodgeLayer` — duck/weave obstacle course: `init`, `update`,
  `drawWorld(state, ctx, { scene })`, `drawOverlay`; `state.dodges`, `state.hits`.

Gauntlet is ~50 lines: `dodgeLayer` + `balloonLayer` on the `timesSquare` scene.

### Hosting
`mountGame(game, { canvas, wand?, onExit?, stage?, next?, onFinish? })` wires the
canvas, wand, camera, mic and themes, and returns `{ engine, wand, body, voice }`.
The arcade's game pages use it.

## Device data (`/pointer.json`, written by the bridge)

`connected, timestamp, transport (usb|ble), session, mode (ahrs),
rawHeading {x,y,z}, rawPitch {x,y,z}` (degrees per body axis — the stick's
orientation, computed on-device), `rawYaw`, `pressHeading/pressPitch` (aim just
before the last A press), `triggerCount`, `recenterCount`, `trigger`, `still`,
`distanceMm`, `ms`, `raw` (accel g + gyro °/s, USB only).

Heart rate (`/hr.json`, from `tools/h10_stream.swift`): `connected, bpm, rrMs, batteryPercent, timestamp`.

## Roadmap (post-demo, toward fitness)

1. Web Bluetooth / Web Serial adapters so the browser talks to the wand and H10
   directly (no bridge); the stick already does its own orientation math.
2. `heart` part: live BPM, zones, session avg/peak, time in zone (display only —
   never a target or difficulty driver; not a medical device).
3. Movement detectors as events: `body.on('squat' | 'jack' | 'lunge')`,
   `wand.on('punch' | 'swing')` with speed.
4. Sessions: warm-up → games → cool-down, active minutes, history.
5. Packaging: `core` / `inputs` / `devices` / `tools`, types, sensor trace
   record & replay for hardware-free tests, two-player support.
