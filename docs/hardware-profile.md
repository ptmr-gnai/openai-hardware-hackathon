# Local hardware profile

Profiled on 2026-11-19. This report intentionally omits serial numbers, UUIDs,
MAC addresses, paired-device names, nearby networks, and other unique identifiers.

## Executive summary

This is the integrated-graphics configuration of the 15-inch Retina MacBook Pro
(Mid 2015 family), model identifier `MacBookPro11,4`. It remains a useful sensor
and edge-compute machine for a hackathon: four physical Intel cores/eight threads,
16 GB RAM, a 720p camera, stereo microphone input, Bluetooth with GATT/BLE support,
and 802.11ac Wi-Fi. The principal constraints are the old OS/GPU stack, fixed RAM,
limited free disk space, and a webcam that tops out at 720p30.

## Core system

| Component | Observed configuration |
|---|---|
| Model | MacBook Pro, `MacBookPro11,4` |
| CPU | Intel Core i7-4770HQ, 2.2 GHz; 4 cores / 8 threads |
| CPU features useful here | AVX2, FMA, AES, BMI1/2, SSE4.2 |
| Memory | 16 GB DDR3 1600 MHz; 2 x 8 GB; not upgradeable |
| GPU | Intel Iris Pro; 1536 MB dynamic VRAM; Metal family macOS 1 |
| Display | Built-in 15-inch Retina-class panel, 2880 x 1800 |
| Internal storage | Apple 256 GB PCIe SSD; SMART verified |
| Free data-volume space | About 67-73 GB during profiling |
| OS | macOS 12.7.6 Monterey, Darwin 21.6.0 |
| Security state | System Integrity Protection and secure virtual memory enabled |

There is no discrete GPU, Neural Engine, or modern Metal feature set. Real-time
720p classical computer vision should be practical; large local vision models or
heavy neural inference should be treated as remote/offloaded workloads or tested
carefully at reduced resolution and frame rate.

## Camera

| Property | Observed result |
|---|---|
| Device | FaceTime HD Camera |
| Connection reported by AVFoundation | PCI/internal; connected and not suspended |
| Maximum mode | 1280 x 720 at up to 30 fps |
| Other modes | 640 x 480 and 320 x 240, each up to 30 fps |
| Pixel formats | `yuvs`, `2vuy`, and `420v` |
| Focus | No continuous autofocus control exposed |
| Exposure | Continuous auto-exposure supported |
| White balance | Continuous auto white balance supported |
| Light hardware | No flash or torch |
| Permission at profiling time | Not yet determined for the Swift/terminal process |

The camera exposes nine format combinations: three resolutions times three raw
YUV formats. For low-latency visual work, start with `420v` at 1280 x 720/30 fps;
drop to 640 x 480 if CPU processing cannot remain real-time. macOS grants camera
access per application/executable context, so the first actual capture should
produce a privacy prompt. No image was captured during this inventory.

## Microphone and audio

| Property | Observed result |
|---|---|
| Input device | Built-in Microphone |
| Channels | 2 |
| Encoding | Linear PCM |
| Exposed sample rates | 44.1, 48, 88.2, and 96 kHz |
| Current system sample rate | 44.1 kHz |
| Permission at profiling time | Authorized for the Swift/terminal process |
| Output | Built-in stereo speakers, currently 44.1 kHz |

For speech, event detection, or audio/visual synchronization, 48 kHz stereo PCM
is the sensible working format. Downmix to mono in software when spatial cues are
not useful. The profiler only verifies advertised formats; a later loopback test
should measure actual noise floor, channel separation, clipping, and A/V drift.

## Bluetooth

| Property | Observed result |
|---|---|
| Controller | Broadcom `BCM_20703A1` |
| Transport | Internal USB |
| State | On; not discoverable |
| Firmware | `v169 c4825` |
| Advertised services | HFP, AVRCP, A2DP, HID, Braille, AACP, GATT, Serial |
| BLE suitability | GATT is exposed; suitable for CoreBluetooth central/peripheral experiments |

The system has paired devices, but they are intentionally excluded from this
report. The next Bluetooth test should use Apple's CoreBluetooth APIs to scan for
BLE advertisements and inspect services. Classic Bluetooth profiles such as A2DP,
HFP, HID, and serial-style services are also advertised by the controller. Expect
macOS Bluetooth privacy permission to be app-specific.

## Networking and physical I/O

- Broadcom Wi-Fi supports 802.11 a/b/g/n/ac, AirDrop, Auto Unlock, and wake on Wi-Fi.
- The active Wi-Fi link during profiling used 802.11ac at a reported 600 Mb/s PHY rate.
- Two Thunderbolt 2 ports are present, each reporting up to 20 Gb/s.
- The model family provides two USB 3 Type-A ports, HDMI, an SDXC slot, a 3.5 mm
  headphone port, and MagSafe 2 power. Physical presence/function should be checked
  before depending on every port during the hackathon.

## Power condition

| Property | Observed result |
|---|---|
| Battery cycles | 78 |
| Reported condition | Normal |
| Full-charge capacity | About 8406 mAh |
| Design capacity | 8755 mAh |
| Approximate capacity health | 96% |
| Charger | 85 W, connected and charging during profiling |

The low cycle count and capacity suggest a healthy or replaced battery. For
continuous camera plus CPU workloads, use the 85 W adapter because sustained
processing can drain an older system quickly and trigger thermal throttling.

## Local development environment

- Python 3.14.2
- Node.js 22.19.0
- Apple Clang 14 command-line tools
- Swift/AVFoundation available
- Homebrew 7.0.15

Current Homebrew warns that macOS 12 is unsupported and attempts to compile many
new formulae from source. A trial install of current `ffmpeg` was stopped after it
expanded to 24 source-built formulae and encountered a missing upstream download;
`blueutil` also requires the full Xcode application on this OS. Neither tool was
installed. Prefer native AVFoundation/CoreBluetooth code, a compatible prebuilt
binary, MacPorts, or a deliberately pinned older formula rather than an unbounded
Homebrew build during the hackathon.

## Recommended first experiments

1. Grant camera access and capture a five-second 720p30 sample while recording CPU
   load, dropped frames, and thermal behavior.
2. Record synchronized 48 kHz stereo audio and measure A/V timestamp drift over
   five minutes.
3. Run a passive CoreBluetooth scan, log advertisement rate/RSSI, and identify the
   exact target hardware's services without storing unrelated nearby device IDs.
4. Benchmark the intended visual pipeline at 720p and 480p before choosing the
   long-term processing resolution.

## Probe method

The profile was derived from `system_profiler`, `sysctl`, `ioreg`, `diskutil`,
`networksetup`, and a read-only AVFoundation enumeration. Run the checked-in probe:

```sh
swift tools/av_probe.swift
```

The probe enumerates capabilities only; it does not capture or save media.

