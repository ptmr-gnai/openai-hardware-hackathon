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

Button A is the trigger; Button B recenters the pointer. For frontend-only testing:

```sh
work/platformio-venv/bin/python pointer/pointer_bridge.py --simulate
```
