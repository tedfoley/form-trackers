# Form Tracker Firmware

Arduino firmware for the **Seeed XIAO nRF52840 Sense** that streams running form metrics over BLE.

Currently sends **mock data** — real IMU integration comes later.

## Prerequisites

- [Arduino IDE 2.x](https://www.arduino.cc/en/software) (or Arduino CLI)
- Seeed nRF52840 board package
- ArduinoBLE library

## Board Setup (one-time)

1. Open Arduino IDE → **Settings** → **Additional Board Manager URLs**, add:
   ```
   https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json
   ```
2. **Tools → Board → Board Manager** → search `Seeed nRF52 mbed` → install **Seeed nRF52 mbed-enabled Boards**.
3. **Tools → Board** → select **Seeed XIAO nRF52840 Sense**.

## Library Setup (one-time)

1. **Tools → Manage Libraries** → search `ArduinoBLE` → install (v1.3.x+).

## Flash the Firmware

1. Connect the XIAO to your Mac/PC via USB-C.
2. **Tools → Port** → select the XIAO serial port (e.g. `/dev/cu.usbmodem*` on macOS).
3. Open `firmware/form-tracker/form-tracker.ino` in Arduino IDE.
4. Click **Upload** (→ arrow button).
5. Open **Serial Monitor** (115200 baud) to see debug output.

### If the board doesn't appear as a port

Double-tap the tiny **Reset** button on the XIAO. It enters bootloader mode and should appear as a USB drive. Then retry upload.

## What It Does

- Advertises as `FormTracker-XXXX` (last 4 hex of MAC address)
- Exposes the Form Tracker BLE service (`a0e50001-...`)
- Waits for a central device to connect and write `0x01` to the Config characteristic to start streaming
- Streams 12-byte feature packets at 10 Hz via BLE notifications
- Prints every packet to Serial for debugging

### Quick Test with nRF Connect

1. Install [nRF Connect](https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-mobile) on your phone.
2. Scan → find `FormTracker-XXXX` → connect.
3. Expand the service `a0e50001-...`.
4. Tap the **subscribe** (↓) icon on the Feature Stream characteristic (`a0e50003-...`).
5. Write `0x01` (hex) to the Config characteristic (`a0e50002-...`) to start streaming.
6. You should see 12-byte notifications arriving at 10 Hz.
7. Write `0x02` to stop.

## Mock Data

The firmware generates realistic running data with no sensor hardware needed:

| Metric | Range | Pattern |
|---|---|---|
| Cadence | 156–164 spm | 30s sine wave |
| Ground contact time | 235–265 ms | Inverse to cadence |
| Vertical oscillation | 75–95 mm | In phase with GCT |
| Battery | 100% → 15% | Linear drain over 10 min of streaming |

See `docs/ble-protocol.md` for the full protocol specification.

## Project Structure

```
firmware/
├── README.md               ← you are here
└── form-tracker/
    └── form-tracker.ino     ← Arduino sketch
```

## Next Steps

- [ ] Integrate LSM6DS3 IMU for real accelerometer/gyro data
- [ ] Implement step detection algorithm
- [ ] Add onboard LED status indicators
- [ ] Flash storage for offline logging
