#!/usr/bin/env python3
"""Bridge StickS3 newline-delimited IMU JSON into a frontend snapshot."""

from __future__ import annotations

import argparse
import asyncio
import collections
import glob
import json
import math
import os
import signal
import struct
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
            "transport": getattr(self, "transport", "usb"),
        }


AXES = {"x": 0, "y": 1, "z": 2}
# Identifies this bridge run. rawYaw restarts from 0 with every run, so the
# browser uses this to know when a saved yaw center is no longer valid.
SESSION = f"{int(time.time())}-{os.getpid()}"


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _norm(v):
    length = math.sqrt(_dot(v, v)) or 1.0
    return (v[0] / length, v[1] / length, v[2] / length)


class GyroPointerMapper:
    """Air-mouse mapping: yaw around gravity -> x, pitch of the forward axis -> y.

    Gyro bias is learned automatically whenever the stick is held still, so
    drift stays low. Button B snaps the reticle back to the center.
    """

    def __init__(self, args: argparse.Namespace) -> None:
        self.span = args.span  # degrees of rotation from center to screen edge
        self.smoothing = args.smoothing
        self.forward_index = AXES[args.forward_axis.lstrip("-")]
        self.forward_sign = -1.0 if args.forward_axis.startswith("-") else 1.0
        self.sign_x = -1.0 if args.invert_x else 1.0
        self.sign_y = -1.0 if args.invert_y else 1.0
        self.bias = (0.0, 0.0, 0.0)
        self.still_samples = 0
        self.gravity = (0.0, 0.0, 1.0)
        self.last_ms = None
        self.yaw = 0.0
        self.pitch = 0.0
        self.x = 0.5
        self.y = 0.5
        # Unclamped, never-reset angles for the browser-side calibration.
        self.raw_yaw = 0.0
        self.raw_pitch = {"x": 0.0, "y": 0.0, "z": 0.0}
        self.trigger_count = 0
        self.recenter_count = 0
        self.last_trigger = False
        self.pitch_ready = False
        self.history = collections.deque(maxlen=30)  # ~0.6 s of (ms, yaw, pitch)
        self.press_yaw = 0.0
        self.press_pitch = dict(self.raw_pitch)

    def _update_bias(self, gyro, accel_mag) -> bool:
        # "Still" = raw rate is tiny and only gravity is acting. Judge on the raw
        # rate (not rate minus bias) so a bad bias can never lock itself in.
        rate = math.sqrt(sum(g * g for g in gyro))
        still = rate < 3.0 and abs(accel_mag - 1.0) < 0.05
        self.still_samples = self.still_samples + 1 if still else 0
        if self.still_samples > 25:  # ~0.5 s at 50 Hz
            self.bias = tuple(b + (g - b) * 0.02 for g, b in zip(gyro, self.bias))
        return self.still_samples > 25

    def map(self, reading: dict) -> dict:
        accel = (float(reading["ax"]), float(reading["ay"]), float(reading["az"]))
        gyro = (float(reading["gx"]), float(reading["gy"]), float(reading["gz"]))
        ms = int(reading["ms"])
        dt = 0.02 if self.last_ms is None else max(0.0, min(0.1, (ms - self.last_ms) / 1000))
        self.last_ms = ms
        recentered = bool(reading.get("recenter"))

        accel_mag = math.sqrt(_dot(accel, accel))
        still = self._update_bias(gyro, accel_mag)
        # Low-pass gravity (accelerometer reads +1 g "up" in the sensor frame).
        g_new = _norm(accel)
        self.gravity = _norm(tuple(o + (n - o) * 0.1 for o, n in zip(self.gravity, g_new)))
        up = self.gravity

        omega = tuple(g - b for g, b in zip(gyro, self.bias))
        if math.sqrt(_dot(omega, omega)) < 0.6:  # dead zone, deg/s
            omega = (0.0, 0.0, 0.0)

        forward = [0.0, 0.0, 0.0]
        forward[self.forward_index] = self.forward_sign
        # Project forward onto the horizontal plane to get a stable pitch axis.
        f_h = tuple(f - _dot(forward, up) * u for f, u in zip(forward, up))
        pitch_axis = _norm(_cross(up, f_h))

        yaw_rate = _dot(omega, up)  # + = counter-clockwise seen from above = left
        pitch_rate = _dot(omega, pitch_axis)

        self.raw_yaw += yaw_rate * dt
        # Absolute pitch (elevation above the horizon, degrees) as it would be if
        # each device axis were the "front" of the wand. Complementary filter:
        # gyro for fast response, accelerometer (gravity) to remove drift.
        # Calibration picks whichever axis actually responded to up/down aiming.
        motion_trust = 0.02 if abs(accel_mag - 1.0) < 0.15 else 0.0
        for name, index in AXES.items():
            axis = [0.0, 0.0, 0.0]
            axis[index] = 1.0
            elevation = math.degrees(math.asin(max(-1.0, min(1.0, _dot(axis, g_new)))))
            if not self.pitch_ready:
                self.raw_pitch[name] = elevation
                continue
            a_h = tuple(f - _dot(axis, up) * u for f, u in zip(axis, up))
            rate = -_dot(omega, _norm(_cross(up, a_h))) if _dot(a_h, a_h) > 0.05 else 0.0
            predicted = self.raw_pitch[name] + rate * dt
            self.raw_pitch[name] = predicted + (elevation - predicted) * motion_trust
        self.pitch_ready = True

        # Pressing A jolts the stick, so report where it pointed just before.
        self.history.append((ms, self.raw_yaw, dict(self.raw_pitch)))
        trigger = bool(reading.get("trigger"))
        if trigger and not self.last_trigger:
            self.trigger_count += 1
            before = [h for h in self.history if h[0] <= ms - 120]
            _, self.press_yaw, self.press_pitch = before[-1] if before else self.history[0]
        self.last_trigger = trigger
        if recentered:
            self.recenter_count += 1

        if recentered:
            self.yaw = self.pitch = 0.0
        else:
            self.yaw = max(-self.span, min(self.span, self.yaw + yaw_rate * dt))
            self.pitch = max(-self.span, min(self.span, self.pitch + pitch_rate * dt))

        target_x = 0.5 - self.sign_x * self.yaw / (2 * self.span)
        target_y = 0.5 - self.sign_y * self.pitch / (2 * self.span)
        if recentered:
            self.x, self.y = target_x, target_y
        self.x += (target_x - self.x) * self.smoothing
        self.y += (target_y - self.y) * self.smoothing

        return {
            "connected": True,
            "timestamp": time.time(),
            "x": round(self.x, 5),
            "y": round(self.y, 5),
            "trigger": bool(reading.get("trigger")),
            "recentered": recentered,
            "yaw": round(self.yaw, 2),
            "pitch": round(self.pitch, 2),
            "still": still,
            "bias": [round(b, 3) for b in self.bias],
            "rawYaw": round(self.raw_yaw, 3),
            "rawPitch": {k: round(v, 3) for k, v in self.raw_pitch.items()},
            "triggerCount": self.trigger_count,
            "pressYaw": round(self.press_yaw, 3),
            "pressPitch": {k: round(v, 3) for k, v in self.press_pitch.items()},
            "recenterCount": self.recenter_count,
            "session": SESSION,
            # Raw sensor sample + device clock, for diagnostics (arcade/measure.html).
            "ms": ms,
            "raw": [round(v, 4) for v in (*accel, *gyro)],
            "mode": "gyro",
            "transport": getattr(self, "transport", "usb"),
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


BLE_NAME = "StickS3-Wand"
BLE_SERVICE_UUID = "6e9b0001-5a1d-4c8e-9b1a-57a9c4e5a301"
BLE_IMU_UUID = "6e9b0002-5a1d-4c8e-9b1a-57a9c4e5a301"
BLE_PACKET = struct.Struct("<H3h3hBB")  # see WandPacket in firmware/src/main.cpp


class BlePacketDecoder:
    """Turns 16-byte BLE notifications into the same dicts the USB JSON gives."""

    def __init__(self) -> None:
        self.ms = 0
        self.last_raw_ms = None
        self.last_recenter = None

    def decode(self, data: bytes) -> dict | None:
        if len(data) != BLE_PACKET.size:
            return None
        raw_ms, ax, ay, az, gx, gy, gz, buttons, recenter_count = BLE_PACKET.unpack(data)
        if self.last_raw_ms is not None:
            self.ms += (raw_ms - self.last_raw_ms) & 0xFFFF  # 16-bit wraparound
        self.last_raw_ms = raw_ms
        recenter = self.last_recenter is not None and recenter_count != self.last_recenter
        self.last_recenter = recenter_count
        ax, ay, az = ax / 4096, ay / 4096, az / 4096
        return {
            "type": "imu",
            "ms": self.ms,
            "ax": ax, "ay": ay, "az": az,
            "gx": gx / 16, "gy": gy / 16, "gz": gz / 16,
            "pitch": math.degrees(math.atan2(-ax, math.sqrt(ay * ay + az * az))),
            "roll": math.degrees(math.atan2(ay, az)),
            "trigger": bool(buttons & 1),
            "recenter": recenter,
        }


BLE_ORI_UUID = "6e9b0003-5a1d-4c8e-9b1a-57a9c4e5a301"  # AHRS firmware (OriPacket)


class OriPacketDecoder:
    """16-byte AHRS notifications → the same dicts the USB {"type":"ori"} JSON gives."""

    def __init__(self) -> None:
        self.ms = 0
        self.last_raw_ms = None

    def decode(self, data: bytes) -> dict | None:
        # 16 bytes = AHRS; 18 bytes = AHRS + ToF distance (uint16 mm).
        if len(data) not in (BLE_PACKET.size, BLE_PACKET.size + 2):
            return None
        raw_ms, hx, hy, hz, ex, ey, ez, buttons, recenter_count = BLE_PACKET.unpack(data[: BLE_PACKET.size])
        distance = struct.unpack("<H", data[BLE_PACKET.size :])[0] if len(data) > BLE_PACKET.size else None
        if self.last_raw_ms is not None:
            self.ms += (raw_ms - self.last_raw_ms) & 0xFFFF  # 16-bit wraparound
        self.last_raw_ms = raw_ms
        return {
            "type": "ori",
            "ms": self.ms,
            "h": [hx / 100, hy / 100, hz / 100],
            "e": [ex / 100, ey / 100, ez / 100],
            "trigger": bool(buttons & 1),
            "still": bool(buttons & 2),
            "rc": recenter_count,
            "d": distance,
        }


class OrientationMapper:
    """Maps on-device AHRS output (per-axis heading + elevation) to pointer.json.

    Headings are unwrapped into continuous angles so crossing ±180° never jumps.
    Output keeps the GyroPointerMapper fields the frontend uses (rawYaw, rawPitch,
    triggerCount, recenterCount, pressYaw/pressPitch) and adds per-axis
    rawHeading / pressHeading so calibration can pick the stick's forward axis.
    """

    def __init__(self) -> None:
        self.transport = "usb"
        self.last_ms = None
        self.unwrapped = None
        self.last_heading = None
        self.trigger_count = 0
        self.recenter_count = 0
        self.last_trigger = False
        self.last_rc = None
        self.history = collections.deque(maxlen=80)  # ~0.8 s at 100 Hz
        self.press = None
        self.center = None

    def map(self, reading: dict) -> dict:
        h = [float(v) for v in reading["h"]]
        e = [float(v) for v in reading["e"]]
        ms = int(reading["ms"])
        if self.unwrapped is None:
            self.unwrapped = list(h)
        else:
            for i in range(3):
                self.unwrapped[i] += ((h[i] - self.last_heading[i] + 180) % 360) - 180
        self.last_heading = h
        heading = {name: round(self.unwrapped[i], 3) for name, i in AXES.items()}
        pitch = {name: round(e[i], 3) for name, i in AXES.items()}

        rc = reading.get("rc")
        recentered = self.last_rc is not None and rc != self.last_rc
        self.last_rc = rc
        if recentered:
            self.recenter_count += 1

        # Pressing A jolts the stick, so report where it pointed just before.
        self.history.append((ms, heading, pitch))
        trigger = bool(reading.get("trigger"))
        if trigger and not self.last_trigger:
            self.trigger_count += 1
            before = [item for item in self.history if item[0] <= ms - 120]
            self.press = before[-1] if before else self.history[0]
        self.last_trigger = trigger
        press = self.press or (ms, heading, pitch)

        # Legacy x/y (uncalibrated fallback): forward = body y, ±25° to the edges.
        if self.center is None or recentered:
            self.center = (heading["y"], pitch["y"])
        x = min(1.0, max(0.0, 0.5 - (heading["y"] - self.center[0]) / 50))
        y = min(1.0, max(0.0, 0.5 - (pitch["y"] - self.center[1]) / 50))
        return {
            "connected": True,
            "timestamp": time.time(),
            "x": round(x, 5),
            "y": round(y, 5),
            "trigger": trigger,
            "recentered": recentered,
            "rawYaw": heading["y"],
            "rawHeading": heading,
            "rawPitch": pitch,
            "triggerCount": self.trigger_count,
            "pressYaw": press[1]["y"],
            "pressHeading": press[1],
            "pressPitch": press[2],
            "recenterCount": self.recenter_count,
            "still": bool(reading.get("still")),
            "session": SESSION,
            "ms": ms,
            "raw": reading.get("raw"),
            # ToF distance to whatever the wand points at (mm); None = no sensor / out of range.
            "distanceMm": reading.get("d") or None,
            "mode": "ahrs",
            "transport": self.transport,
        }


class WandMapper:
    """Routes each reading to the right mapper: AHRS firmware ('ori') or legacy raw IMU ('imu')."""

    def __init__(self, legacy) -> None:
        self.ori = OrientationMapper()
        self.legacy = legacy

    def set_transport(self, transport: str) -> None:
        for mapper in (self.ori, self.legacy):
            mapper.transport = transport
            mapper.last_ms = None

    def map(self, reading: dict) -> dict:
        return (self.ori if reading.get("type") == "ori" else self.legacy).map(reading)


def run_serial_once(port: str, args: argparse.Namespace, mapper, output: Path, stop: list[bool]) -> None:
    """Stream from USB until unplugged or stopped."""
    import serial

    print(f"USB: reading StickS3 from {port}", flush=True)
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
                if reading.get("type") not in ("imu", "ori"):
                    continue
                write_atomic(output, mapper.map(reading))
    except (serial.SerialException, OSError) as error:
        print(f"USB: disconnected ({error})", flush=True)


async def run_ble_once(args: argparse.Namespace, mapper, output: Path, stop: list[bool]) -> None:
    """Find the wand over Bluetooth and stream until it drops, USB appears, or stop."""
    from bleak import BleakClient, BleakScanner

    print("BLE: scanning for StickS3-Wand…", flush=True)
    device = await BleakScanner.find_device_by_filter(
        lambda d, ad: d.name == BLE_NAME or BLE_SERVICE_UUID in (ad.service_uuids or []),
        timeout=5.0,
    )
    if device is None or stop[0]:
        return
    disconnected = asyncio.Event()

    async with BleakClient(device, disconnected_callback=lambda _c: disconnected.set()) as client:
        # AHRS firmware exposes the orientation characteristic; older firmware raw IMU.
        has_ori = client.services.get_characteristic(BLE_ORI_UUID) is not None
        decoder = OriPacketDecoder() if has_ori else BlePacketDecoder()

        def on_packet(_sender, data: bytearray) -> None:
            reading = decoder.decode(bytes(data))
            if reading is not None:
                write_atomic(output, mapper.map(reading))

        print(f"BLE: connected to {device.name or device.address} ({'ahrs' if has_ori else 'raw imu'})", flush=True)
        await client.start_notify(BLE_ORI_UUID if has_ori else BLE_IMU_UUID, on_packet)
        while not stop[0] and not disconnected.is_set():
            # In auto mode, prefer the cable as soon as it is plugged in.
            if args.transport == "auto" and not args.port and find_serial_port():
                print("BLE: USB detected, switching to cable", flush=True)
                break
            await asyncio.sleep(0.5)
    print("BLE: disconnected", flush=True)


def run_device(args: argparse.Namespace, output: Path, stop: list[bool]) -> None:
    """Keep the wand connected: USB when plugged in, otherwise Bluetooth. Reconnects forever."""
    legacy = GyroPointerMapper(args) if args.mode == "gyro" else PointerMapper(args.sensitivity, args.smoothing)
    mapper = WandMapper(legacy)
    transport = "?"
    waiting_reported = False
    # One event loop for the bridge's whole life. CoreBluetooth keeps delivering
    # callbacks (e.g. when macOS restarts bluetoothd) to the loop a manager was
    # created on; a fresh asyncio.run() per reconnect left closed loops behind and
    # crashed the process with "Event loop is closed".
    ble_loop = asyncio.new_event_loop()
    while not stop[0]:
        port = None
        if args.transport in ("auto", "usb"):
            port = args.port or find_serial_port()
        try:
            if port:
                transport = "usb"
                mapper.set_transport(transport)
                run_serial_once(port, args, mapper, output, stop)
            elif args.transport in ("auto", "ble"):
                transport = "ble"
                mapper.set_transport(transport)
                ble_loop.run_until_complete(run_ble_once(args, mapper, output, stop))
            elif not waiting_reported:
                print("USB: waiting for StickS3…", flush=True)
                waiting_reported = True
        except Exception as error:  # keep the bridge alive through radio hiccups
            print(f"{transport.upper()}: error {error!r}", flush=True)
        write_atomic(output, {"connected": False, "timestamp": time.time()})
        if not stop[0]:
            time.sleep(1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", help="serial port; auto-detected when omitted")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--output", type=Path, default=Path("livestream/pointer.json"))
    parser.add_argument("--sensitivity", type=float, default=35.0)
    parser.add_argument("--smoothing", type=float, default=0.35)
    parser.add_argument("--mode", choices=("gyro", "tilt"), default="gyro")
    parser.add_argument("--span", type=float, default=25.0,
                        help="gyro mode: degrees of turn from center to screen edge")
    parser.add_argument("--forward-axis", default="y",
                        help="gyro mode: device axis that points at the screen (x, y, z, -x, -y, -z)")
    parser.add_argument("--invert-x", action="store_true")
    parser.add_argument("--invert-y", action="store_true")
    parser.add_argument("--transport", choices=("auto", "usb", "ble"), default="auto",
                        help="auto = USB when plugged in, otherwise Bluetooth")
    parser.add_argument("--simulate", action="store_true")
    args = parser.parse_args()

    stop = [False]
    signal.signal(signal.SIGINT, lambda *_: stop.__setitem__(0, True))
    signal.signal(signal.SIGTERM, lambda *_: stop.__setitem__(0, True))

    if args.simulate:
        print(f"Simulating pointer into {args.output}")
        run_simulation(args.output, stop)
    else:
        run_device(args, args.output, stop)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

