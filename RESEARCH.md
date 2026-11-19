# Hackathon research · 19 November 2026

## Recommended first build

**Reach & duck** combines a laptop webcam (body control), Polar H10 (live heartbeat) and optional StickS3 (tilt wand). Start with a playable round rather than tying progress to flashing every module. Current modes are alternatives: webcam OR USB wand OR mouse. Combining camera ducking and wand aiming is a next iteration.

## What is in the photographed kit?

| Part / SKU | What it does | Fit for this game |
|---|---|---|
| CoreS3 + DinBase / K128 | ESP32-S3 controller with touchscreen, camera and other onboard peripherals; base supports mounting/power | Later scoreboard, sensor hub, or standalone launcher |
| StickS3 / K150 | Compact ESP32-S3 board with display, buttons and BMI270 6-axis IMU | Best wand candidate; USB tilt/button controller first |
| Gesture Unit / U127 | PAJ7620U2 recognizes discrete nearby gestures over I²C | Menu swipes or spell gestures; not continuous screen pointing |
| ToF Distance HAT / U072 | VL53L0X single-point optical ranging, nominally up to 2m | Later proximity/squat-distance experiment; not whole-body tracking |
| RFID2 Unit / U031-B | Reads compatible RFID tags | Tap a player token or select mini-games |
| QR Scanner 13.2 / M145 | Scans QR/barcodes | Join/unlock games; not needed for motion |
| GPS/BDS Unit v1.1 / U032-V11 | Satellite positioning | Outdoor games later; unnecessary indoors |
| ENV III HAT / U053-D | Environment sensing (temperature/humidity/pressure) | Room dashboard; unnecessary for first game |
| Polar H10 (owned separately) | Chest heart-rate sensor with standard Bluetooth HR service | Live BPM via browser Bluetooth; no need for custom ECG protocol |

SKU transcription is from the supplied photo. Detailed integration research focuses on the motion/HR components; unused accessories are summarized at the product-category level.

## Pointer reality check

StickS3's accelerometer/gyroscope can measure tilt and angular movement. It does not know what screen pixel you point at. A 6-axis IMU has no absolute heading reference, and integrated gyro yaw drifts. For the first build, map gravity-based tilt to a cursor and add a re-center button. This behaves like a tilt joystick. For a true staff/sword later: camera-track a marker on a prop and fuse that with IMU movement. StickS3 IR TX/RX is not a Wii Remote's IR camera; do not assume a Wii sensor bar creates a screen pointer. Neither the Gesture Unit nor a single ToF measurement supplies that position.

## Architecture and portability

Vite + plain JavaScript canvas; Google MediaPipe Pose Landmarker runs locally; Web Bluetooth reads standard BPM; Web Serial consumes newline-delimited JSON from StickS3. The game engine accepts normalized hand coordinates and a duck flag, independent of transport. Optional USB firmware sends `{"x":0.5,"y":0.5,"duck":false}` at approximately 50 Hz. Stale camera/wand inputs stop controlling within 600ms. No Wi-Fi needed for hardware links.

MediaPipe supplies wrist/head/shoulder landmarks, not magical gesture intent. Current duck recognition is head displacement after standing calibration; it needs real-person tuning. Inference is synchronous on the main thread in this prototype; use a worker if profiling shows frame stalls. Current round score depends only on reach/dodge events. No medical zones or HR-based intensity advice.

## Primary sources

- [StickS3 hardware, IMU and compatibility](https://docs.m5stack.com/en/core/StickS3)
- [StickS3 Arduino IMU API and required library versions](https://docs.m5stack.com/en/arduino/m5sticks3/imu): board manager >=3.2.5; M5Unified >=0.2.12; M5GFX >=0.2.18.
- [Gesture Unit U127](https://docs.m5stack.com/en/unit/Unit_Gesture): nine gesture types via I²C. CoreS3 Grove connection notes should be checked before wiring.
- [ToF HAT U072](https://docs.m5stack.com/en/hat/Hat_ToF): VL53L0X, up to 2m; read StickS3 bus connection note before connecting. Range depends on real scene conditions.
- [Polar H10 getting started](https://support.polar.com/e_manuals/h10-heart-rate-sensor/polar-h10-user-manual-english/getting-started.htm)
- [Polar H10 technical specifications](https://support.polar.com/e_manuals/h10-heart-rate-sensor/polar-h10-user-manual-english/technical-specifications.htm): standardized Bluetooth Heart Rate Service.
- [Polar sensor settings](https://support.polar.com/e_manuals/h10-heart-rate-sensor/polar-h10-user-manual-english/sensor-settings.htm): two Bluetooth devices setting.
- [Official Polar BLE SDK](https://github.com/polarofficial/polar-ble-sdk): for future native ECG/accelerometer work; not needed for standard BPM.
- [Chrome Web Bluetooth guide](https://developer.chrome.com/docs/capabilities/bluetooth): secure context, chooser from user gesture, GATT services/notifications.
- [Google Pose Landmarker web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- Bundled model: [MediaPipe pose lite float16](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task). Package `@mediapipe/tasks-vision` 0.10.32; model downloaded at install time (version 1, SHA-256 verified) for offline local inference. Preserve upstream license notices when redistributing.

## Next hardware session

1. Run on local Chrome/Edge at localhost, play with mouse first.
2. Enable webcam; check mirrored wrist alignment and calibrate while standing.
3. Pair worn H10 from the app button; verify live BPM, disconnect and reconnect.
4. Compile/upload StickS3 starter, verify USB serial output and axis orientation.
5. Choose the better feel: body-only game, wand-only spell game, or fused camera/wand.
