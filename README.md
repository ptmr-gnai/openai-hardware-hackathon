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

## Wand Arcade (minigames)

With the server and pointer bridge running, open <http://127.0.0.1:8765/arcade/>.
Press `C` once to calibrate the wand for the full-screen arcade surface.

Games are built from shared parts in `livestream/lib/`:

| Part | Role |
|---|---|
| `wand.js` | Bridge → calibrated pointer, `shoot` (A) / `recenter` (B) events, mouse fallback |
| `calibrate.js` | 5-target calibration overlay |
| `engine.js` | Canvas, intro → countdown → play → results lifecycle, HUD, reticle, best scores |
| `fx.js` | Particle bursts and floating score text |
| `sound.js` | Synthesized sound effects (no assets) |
| `filters.js` | 1€ smoothing filter |

A minigame is one file in `livestream/arcade/games/` exporting
`{ id, title, blurb, duration, init, update, draw, shoot }`, registered in
`games/index.js`. See `balloons.js` (Balloon Pop: 15 s, gold balloons = 3 pts).
