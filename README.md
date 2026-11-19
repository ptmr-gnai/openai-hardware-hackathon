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
