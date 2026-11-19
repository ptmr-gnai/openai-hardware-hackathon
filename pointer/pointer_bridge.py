#!/usr/bin/env python3
"""Bridge StickS3 newline-delimited IMU JSON into a frontend snapshot."""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import signal
import sys
import tempfile
import time
from pathlib import Path


def find_serial_port() -> str | None:
    patterns = (
        "/dev/cu.usbmodem*",
        "/dev/cu.usbserial*",
        "/dev/cu.wchusbserial*",
        "/dev/cu.SLAB_USBtoUART*",
    )
    matches = sorted(path for pattern in patterns for path in glob.glob(pattern))
    return matches[0] if matches else None


def write_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as output:
            json.dump(payload, output, separators=(",", ":"))
            output.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class PointerMapper:
    def __init__(self, sensitivity_degrees: float, smoothing: float) -> None:
        self.sensitivity = sensitivity_degrees
        self.smoothing = smoothing
        self.center_pitch: float | None = None
        self.center_roll: float | None = None
        self.x = 0.5
        self.y = 0.5

    def map(self, reading: dict) -> dict:
        pitch = float(reading["pitch"])
        roll = float(reading["roll"])
        recentered = bool(reading.get("recenter"))
        if self.center_pitch is None or self.center_roll is None or recentered:
            self.center_pitch = pitch
            self.center_roll = roll

        target_x = 0.5 + (roll - self.center_roll) / (2 * self.sensitivity)
        target_y = 0.5 + (pitch - self.center_pitch) / (2 * self.sensitivity)
        target_x = min(1.0, max(0.0, target_x))
        target_y = min(1.0, max(0.0, target_y))
        self.x += (target_x - self.x) * self.smoothing
        self.y += (target_y - self.y) * self.smoothing

        return {
            "connected": True,
            "timestamp": time.time(),
            "x": round(self.x, 5),
            "y": round(self.y, 5),
            "trigger": bool(reading.get("trigger")),
            "recentered": recentered,
            "pitch": round(pitch, 3),
            "roll": round(roll, 3),
            "transport": "usb",
        }


def run_simulation(output: Path, stop: list[bool]) -> None:
    started = time.monotonic()
    while not stop[0]:
        elapsed = time.monotonic() - started
        write_atomic(
            output,
            {
                "connected": True,
                "timestamp": time.time(),
                "x": round(0.5 + math.sin(elapsed * 0.8) * 0.32, 5),
                "y": round(0.5 + math.cos(elapsed * 1.1) * 0.25, 5),
                "trigger": int(elapsed) % 5 == 0,
                "recentered": False,
                "pitch": 0,
                "roll": 0,
                "transport": "simulation",
            },
        )
        time.sleep(1 / 30)


def run_serial(args: argparse.Namespace, output: Path, stop: list[bool]) -> None:
    try:
        import serial
    except ImportError:
        raise SystemExit("pyserial is required; use work/platformio-venv/bin/python")

    port = args.port or find_serial_port()
    if not port:
        raise SystemExit("No StickS3 serial port found. Connect it with a USB-C data cable.")

    print(f"Reading StickS3 from {port} at {args.baud} baud")
    mapper = PointerMapper(args.sensitivity, args.smoothing)
    try:
        with serial.Serial(port, args.baud, timeout=1) as connection:
            while not stop[0]:
                line = connection.readline()
                if not line:
                    continue
                try:
                    reading = json.loads(line)
                except (UnicodeDecodeError, json.JSONDecodeError):
                    continue
                if reading.get("type") != "imu":
                    continue
                write_atomic(output, mapper.map(reading))
    finally:
        write_atomic(output, {"connected": False, "timestamp": time.time()})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", help="serial port; auto-detected when omitted")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--output", type=Path, default=Path("livestream/pointer.json"))
    parser.add_argument("--sensitivity", type=float, default=35.0)
    parser.add_argument("--smoothing", type=float, default=0.28)
    parser.add_argument("--simulate", action="store_true")
    args = parser.parse_args()

    stop = [False]
    signal.signal(signal.SIGINT, lambda *_: stop.__setitem__(0, True))
    signal.signal(signal.SIGTERM, lambda *_: stop.__setitem__(0, True))

    if args.simulate:
        print(f"Simulating pointer into {args.output}")
        run_simulation(args.output, stop)
    else:
        run_serial(args, args.output, stop)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

