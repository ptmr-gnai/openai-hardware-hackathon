# Polar H10 connection notes

## Wake and detection

The H10 has no pairing button. To wake it and begin BLE advertising:

1. Wet both electrode areas on the back of the strap.
2. Snap the transmitter pod onto the strap.
3. Wear the strap snugly under the chest muscles.
4. Keep it near the receiving computer.

After use, detach the pod from the strap to stop the sensor and conserve its
CR2025 battery.

## Pairing behavior

For Polar Flow, Polar recommends pairing inside the Flow app rather than in the
phone's Bluetooth settings. For our macOS client, CoreBluetooth discovered and
connected directly to the standard BLE Heart Rate Service without a separate
System Preferences pairing step or passkey prompt.

New H10 firmware supports secure BLE connections. If protected sensor data
requires authentication, macOS may initiate secure pairing during the relevant
characteristic access. The standard live heart-rate stream worked without that
step in our test.

The H10 can normally be paired with multiple devices, but simultaneous usage is
limited. Its `2 Bluetooth devices` setting allows two concurrent BLE receivers
and is enabled by default on current firmware. This setting can be checked in
Polar Flow or Polar Beat if another watch/app occupies a connection slot.

## Verified locally

Tested on 2026-11-19 with the MacBook Pro's internal Broadcom controller:

- H10 advertisement detected at strong signal strength.
- BLE connection succeeded.
- Standard Heart Rate Measurement notifications succeeded.
- Live BPM and RR intervals were received.
- Battery Level characteristic reported 100%.
- No explicit macOS pairing dialog was needed for this channel.

The sensor-specific ID is deliberately not stored in the repository.

## Commands

Detection only:

```sh
swift tools/h10_stream.swift --scan-only
```

Continuous heart-rate and RR stream:

```sh
swift tools/h10_stream.swift
```

The stream emits timestamped lines such as:

```text
2026-11-19T19:33:00Z bpm=84 rr_ms=[791.0,837.9]
```

## Available H10 data paths

Polar's official SDK documents these H10 capabilities:

- Heart rate and RR intervals at a nominal 1 Hz update rate.
- ECG samples at 130 Hz.
- Three-axis accelerometer data at 25, 50, 100, or 200 Hz, with selectable
  2 g, 4 g, or 8 g range.
- Internal recording control and retrieval.

The checked-in tool currently uses the standard Bluetooth Heart Rate Service.
ECG and accelerometer streams use Polar's PMD protocol and are the next logical
extension.

## Official references

- [Polar H10 pairing manual](https://support.polar.com/e_manuals/h10-heart-rate-sensor/polar-h10-user-manual-english/pairing.htm)
- [Polar H10 sensor settings](https://support.polar.com/e_manuals/h10-heart-rate-sensor/polar-h10-user-manual-english/sensor-settings.htm)
- [Using H10 with several devices](https://support.polar.com/en/support/can_i_pair_h10_with_several_devices)
- [Official Polar BLE SDK](https://github.com/polarofficial/polar-ble-sdk)
- [H10 capabilities in the Polar SDK](https://github.com/polarofficial/polar-ble-sdk/blob/master/documentation/products/PolarH10.md)

