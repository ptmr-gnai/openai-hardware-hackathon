# hardware-hack

A local workspace for hardware experiments, notes, firmware, and supporting tools.

## Getting started

Add project-specific setup and usage instructions here as the project takes shape.

## Hardware baseline

- [Hardware profile](docs/hardware-profile.md)
- Run the native camera/microphone capability probe with:

  ```sh
  swift tools/av_probe.swift
  ```

## Local camera livestream

Start the local preview server:

```sh
./scripts/serve-livestream.sh
```

Then open <http://127.0.0.1:8765>. The page requests the built-in camera and
microphone directly from the browser; media stays on the Mac and is not uploaded.

## Polar H10

Wake the sensor by wetting the strap electrodes, snapping on the pod, and wearing
the strap. See the [H10 connection notes](docs/polar-h10.md). Test detection:

```sh
swift tools/h10_stream.swift --scan-only
```

Subscribe to its standard BLE heart-rate stream:

```sh
swift tools/h10_stream.swift
```

Run the camera preview and publish the H10 reading into its overlay:

```sh
./scripts/run-live-demo.sh
```

## StickS3 pointer

The first pointer slice uses the StickS3 BMI270 IMU over USB. Build and upload:

```sh
work/platformio-venv/bin/pio run -d pointer/firmware
work/platformio-venv/bin/pio run -d pointer/firmware -t upload
```

The firmware tracks orientation on the stick (Mahony AHRS on every ~190 Hz gyro
sample, gravity correction only while not accelerating, on-device gyro bias
learning) and reports each body axis's heading and elevation at ~100 Hz.

Measure pointing quality (drift, jitter, return-to-centre, flick shift, link
timing) with the guided page <http://127.0.0.1:8765/arcade/measure.html>.
Baseline vs AHRS (USB): flick shift 62° → 6.8°, return-to-centre 6.8° → 2.6°.

Optional **ToF Distance HAT** (VL53L0X) on the StickS3 header measures the distance
to whatever the wand points at (~30 Hz, up to ~2 m), published as `distanceMm`.
StickC HATs sit on the odd column of the 16-pin Hat2 header: ToF SDA = GPIO8,
SCL = GPIO0, powered by the PM1 3.3 V LDO (off by default; firmware enables it).
It must use Arduino `Wire`: M5Unified's internal bus owns I2C controller 1 (`Wire1`).
In the arcade, calibration records your distance to the screen; the pointer gain
then scales with distance / calibrated distance (×0.5–×2), since the "laser" hit
point moves ∝ distance × tan(angle). A HUD chip shows `📏` distance and gain;
`T` toggles auto-distance.

The firmware streams over USB and Bluetooth LE (`StickS3-Wand`) at the same time.
The bridge picks USB when plugged in and Bluetooth otherwise, switching and
reconnecting automatically (`--transport usb|ble` forces one). The first Bluetooth
run asks for macOS Bluetooth permission for the terminal app.

Bridge its tilt and buttons into the frontend reticle:

```sh
work/platformio-venv/bin/python pointer/pointer_bridge.py
```

The bridge defaults to gyro air-mouse mode (`--mode tilt` for the old accelerometer
mapping). Calibrate in the page: click **Calibrate wand** (or press `c`), then aim the
stick's tip at each of the 5 pink dots and press A. The fit (axis direction, gain, and
which end is "front") is saved in the browser. Set the stick down still for a second
to refresh gyro bias.

Button A is the trigger; Button B recenters the pointer. For frontend-only testing:

```sh
work/platformio-venv/bin/python pointer/pointer_bridge.py --simulate
```

## Codex Arcade (minigames)

The home page lists the four games and a **Play all** run (Balloon Pop → Bob & Weave →
Bodega Bucks → Gauntlet) that ends on a summary with 1–3 stars per game (thresholds
are each game's `stars`). Keys: `1`–`4` open a game, `Enter` plays all, `Esc` returns
to the menu.

With the server and pointer bridge running, open <http://127.0.0.1:8765/arcade/>.
Press `C` once to calibrate the wand for the full-screen arcade surface.

Games are built from shared parts in `livestream/lib/`:

| Part | Role |
|---|---|
| `wand.js` | Bridge → calibrated pointer, `shoot` (A) / `recenter` (B) events, `speed`/`shake`/`held`, mouse fallback |
| `calibrate.js` | 5-target calibration overlay |
| `engine.js` | Canvas, intro → countdown → play → results lifecycle, HUD, reticle, best scores |
| `fx.js` | Particle bursts and floating score text |
| `sound.js` | Synthesized sound effects (no assets) |
| `filters.js` | 1€ smoothing filter |
| `voice.js` | Always-on speech → `command` events (Web Speech API), auto-restart, `M` mutes |
| `theme.js` | Current theme (sprite, motion, scene, colors) + `resolveTheme(text)` |
| `scenes.js` | Procedural backgrounds: sky, NYC skyline, subway, pond |
| `sprites.js` | Shared emoji sprite cache (rendered once, stamped per frame) |
| `body.js` | Webcam pose tracking (MediaPipe, local): `duck`, `duckAmount`, `side`, `sideAmount`, `lean`, `hands`, camera preview |

Camera games need the pose model once (downloads into git-ignored `livestream/vendor/`):

```sh
./scripts/setup-vision.sh
```

**Bob & Weave** (15 s) — high beams: duck; side blocks: move your head the other
way; return to center between obstacles. `R` recalibrates standing position,
`Space`/`↓` ducks and `←`/`→` dodge from the keyboard, `[` / `]` adjust speed
(default 85%, or `?speed=0.7`).

**Bodega Bucks** (20 s) — scratch-off tickets at the corner bodega: point at the
ticket and shake the wand left-right to scratch (or hold A). Match 3 symbols to win;
about 1 in 14 tickets is a 💎💎💎 $1,000,000 jackpot. `J` rigs a jackpot for demos.
(Fictional game, not a real lottery's branding.)

**Gauntlet** (15 s) — Bob & Weave and Balloon Pop at once: dodge with your body,
pop balloons with the wand.

**Voice themes** — the mic is always listening (Chrome Web Speech, needs internet;
`M` mutes). Say a theme and the targets change mid-round: NYC pack "pizza" (falling
over a skyline), "rats" (scurrying in a subway), "ducks" (flying over a pond), plus
"pigeons", "taxi", "bagels", "teddy bears", "cats", "unicorns"… "balloons" resets.
Themes (`lib/theme.js`) carry `sprite`, `motion`, `scene`, `sky`, `burst` — the same
JSON a future OpenAI resolver will return. Backgrounds live in `lib/scenes.js`.

The page server (`tools/dev_server.py`, used by both scripts) sends `no-store` so
code edits always show up on reload.

Games also export reusable layers: `balloonLayer` (balloons.js) and `dodgeLayer`
(duck.js, drawn as `drawWorld` + `drawOverlay`). `gauntlet.js` composes both.

A minigame is one file in `livestream/arcade/games/` exporting
`{ id, title, blurb, duration, init, update, draw }` plus optional `shoot`, `needs: ['body']` and `summary`, registered in
`games/index.js`. See `balloons.js` (Balloon Pop: 15 s, gold balloons = 3 pts).
