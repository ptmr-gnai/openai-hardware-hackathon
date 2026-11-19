# Pulse Play

A portable, local-first movement arcade prototype. First mini-game: **Reach & duck**. Collect seeds with either hand, duck under waves, play a 60-second round. Heart rate is displayed, never used as a target or difficulty multiplier.

## Run on a laptop

Install Node.js 22.12+ (or 24), then:

```sh
git clone https://github.com/ptmr-gnai/openai-hardware-hackathon.git
cd openai-hardware-hackathon
```

Install and start:

```sh
npm ci
npm run dev
```

Open **http://localhost:5173** in desktop Chrome or Edge. This works without laptop Wi-Fi after dependencies are installed: Polar connects over Bluetooth and the optional wand over USB. Pose model and WASM are bundled in `public/`; only optional Google Fonts use the internet (system fonts work offline). No API key, account, backend, or OpenAI call is needed for the control loop.

Installation downloads and verifies the pose model and copies MediaPipe WASM into `public/`. Those generated assets are ignored by Git. After `npm run build`, you can serve the prebuilt app without npm or internet:

```sh
python3 -m http.server 5173 --directory dist
```

Then open http://localhost:5173.

## Play

- Mouse: hover over a glowing seed. Hold Space to duck; release to stand. Escape pauses.
- Webcam: click Enable webcam, grant access, stand upright with head and both hands in view. Calibration averages 45 detected frames. Either wrist collects targets; lowering your head relative to the standing position ducks. Keep laptop/camera fixed. Recalibrate if you move it. This is a prototype heuristic, not exercise-form assessment.
- Pause on screen anytime. Losing tab focus pauses automatically.
- Polar H10: wear the strap with moistened electrodes, click Connect Polar H10, select the sensor. Standard BLE Heart Rate Service (0x180D), notifications on Heart Rate Measurement (0x2A37); supports 8/16-bit BPM. If occupied by other apps, disconnect them or enable H10's two-Bluetooth-device setting in Polar Flow. No ECG, pairing PIN, custom Polar SDK, or ANT+ adapter required for BPM.
- Web Bluetooth support varies by browser/OS. Desktop Chrome/Edge on macOS/Windows is the intended hardware target; Linux Bluetooth may require extra setup. Safari/Firefox are not the Bluetooth target. Use a top-level localhost tab (or HTTPS); embedded previews may block device permissions. The cloud computer cannot access a Bluetooth sensor beside your laptop.
- Simulated heart rate is explicitly labeled. Missing or stale (>10 seconds) heart rate displays a dash; play still works.
- Optional StickS3: flash `firmware/PulseWand/PulseWand.ino`, close Arduino Serial Monitor, click Connect USB wand. USB avoids venue Wi-Fi. It is a tilt cursor, not a Wii-style absolute pointer. Hold A to duck, B to center. Axis signs may need adjustment for your grip. No firmware has been flashed or hardware-tested in this cloud session.

Camera video stays in the browser. No recording, analytics, sensor storage, or network uploads. Heart-rate samples exist only in memory for the current round average. Clear the page to discard them.

## Checks

```sh
npm test
npm run build
npm run dev
# another terminal; install a test browser if no system Chromium is available
npx playwright install chromium
npm run test:browser
npm run test:devices
```

Tests target port 5173 by default; set `BASE_URL` to test another running instance.

Set `CHROMIUM_PATH` to use a specific Chrome/Chromium executable; tests otherwise use system Chromium on Linux or Playwright’s installed Chromium.

Browser checks exercise seed collection, pause/resume, duck input, simulated heart-rate toggle, full round, replay and mobile overflow. Hardware validation still needs the laptop: real webcam tracking/lighting/latency, H10 pairing/notifications/reconnect and StickS3 compile/flash/axis mapping.

## Project map

- `src/engine.js`: deterministic game state and sensor parsers
- `src/main.js`: canvas rendering, UI, Bluetooth and serial adapters
- `src/camera.js`: MediaPipe pose tracking and standing calibration
- `firmware/PulseWand/`: optional Arduino starter
- `RESEARCH.md`: kit map, evidence and next steps

Next: test the round with your body, tune the reach area and duck threshold, then try the wand. Camera + wand fusion and additional mini-games can follow once the basic movement feels good.

## License

Project code is covered by the repository’s MIT [license](LICENSE). MediaPipe runtime/model assets are third-party components; see [third-party notices](THIRD_PARTY_NOTICES.md).
