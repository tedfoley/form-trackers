# BLE Protocol Specification — Form Tracker

**Version:** 1.1.0
**Last Updated:** 2026-02-07
**Hardware:** Seeed XIAO nRF52840 Sense
**Status:** Draft

---

## 1. Overview

This document defines the BLE communication protocol between the Form Tracker wearable (firmware) and the companion React Native mobile app. The wearable streams real-time running form metrics at ~10 Hz over BLE notifications.

Both firmware and app teams should treat this spec as the contract — changes require a version bump and agreement from both sides.

---

## 2. BLE Service Definition

### 2.1 Form Tracker Service

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| Service UUID | `a0e50001-0000-1000-8000-00805f9b34fb` |
| Service Type | Primary                                |

> UUID base: `a0e5XXXX-0000-1000-8000-00805f9b34fb`
> Characteristic short IDs occupy the `XXXX` portion.

### 2.2 Characteristics

| Characteristic      | UUID         | Properties     | Description                          |
| ------------------- | ------------ | -------------- | ------------------------------------ |
| Configuration       | `a0e50002-…` | Write          | App writes session config to device  |
| Feature Stream      | `a0e50003-…` | Notify         | Device streams running metrics       |
| Battery Level       | `a0e50004-…` | Read           | Current battery percentage           |
| Log Download        | `a0e50005-…` | Read, Notify   | Reserved for future offline log sync |
| Device Name         | `a0e50006-…` | Read           | Human-readable device identifier     |

Full UUIDs (for copy-paste into code):

```
SERVICE_UUID          = "a0e50001-0000-1000-8000-00805f9b34fb"
CHAR_CONFIG_UUID      = "a0e50002-0000-1000-8000-00805f9b34fb"
CHAR_FEATURE_UUID     = "a0e50003-0000-1000-8000-00805f9b34fb"
CHAR_BATTERY_UUID     = "a0e50004-0000-1000-8000-00805f9b34fb"
CHAR_LOG_UUID         = "a0e50005-0000-1000-8000-00805f9b34fb"
CHAR_DEVICE_NAME_UUID = "a0e50006-0000-1000-8000-00805f9b34fb"
```

---

## 3. Characteristic Details

### 3.1 Configuration (Write) — `0x0002`

The app writes a configuration packet to start/stop streaming and set parameters.

**Packet format (variable length, 1–9 bytes):**

```
Byte 0:    Command
             0x01 = Start streaming
             0x02 = Stop streaming
             0x03 = Request battery level update
             0x04 = Time sync
Byte 1:    Stream rate (Hz), default 10 — used with 0x01 only
             Valid range: 1–20
Bytes 1–8: uint64_t Unix epoch milliseconds (LE) — used with 0x04 only
```

**Behavior:**
- On `0x01`: firmware begins sending Feature Stream notifications at the requested rate. Byte 1 sets the rate (1–20 Hz, default 10).
- On `0x02`: firmware stops notifications. The device remains connected.
- On `0x03`: firmware updates the Battery Level characteristic and sends a read response.
- On `0x04`: firmware records the phone's epoch timestamp alongside its own `millis()` value. All subsequent Feature Stream timestamps are adjusted: `timestamp = phone_epoch_ms + (millis() - millis_at_sync)`. This allows the app to correlate data from multiple devices using wall-clock time. The sync is reset on disconnect. Total write length for this command is 9 bytes.
- Writing an invalid command returns ATT error `0x80` (Application Error).

### 3.2 Feature Stream (Notify) — `0x0003`

The primary data channel. The device sends one packet per sample at the configured rate (~10 Hz default).

**Packet format (12 bytes):**

```
Offset  Size     Type       Field                  Unit         Range
------  ----     ----       -----                  ----         -----
0       4        uint32_t   timestamp              ms           Device uptime (wraps at ~49.7 days)
4       2        uint16_t   cadence                steps/min    0–300
6       2        uint16_t   ground_contact_time    ms           0–500
8       2        uint16_t   vertical_oscillation   mm (0.1 cm)  0–200 (0.0–20.0 cm)
10      1        uint8_t    stride_phase           enum         0=unknown, 1=stance, 2=flight
11      1        uint8_t    flags                  bitfield     See below
```

**Total: 12 bytes per packet** (well within the BLE 4.2 default ATT MTU of 23 bytes / 20 byte payload).

**Byte order:** Little-endian (matches ARM Cortex-M4 native order on nRF52840).

**Field notes:**

- **timestamp**: Milliseconds since device boot by default. If time sync has been performed (command `0x04`), this becomes **Unix epoch milliseconds (lower 32 bits)** — i.e. `(phone_epoch_ms + elapsed) & 0xFFFFFFFF`. The app can detect whether sync is active via the `time_synced` flag (bit 3). Rolls over at `0xFFFFFFFF`; the app should detect rollover by checking if the new timestamp is less than the previous.
- **cadence**: Instantaneous cadence in steps per minute. Computed from the IMU step detection interval. `0` means no steps detected in the current window.
- **ground_contact_time**: Duration in milliseconds the foot is on the ground per stride. Derived from accelerometer impact detection. `0` means not computed.
- **vertical_oscillation**: Vertical bounce in **millimeters** (divide by 10 for cm on display). Using mm avoids floating point on firmware. Value `85` = 8.5 cm.
- **stride_phase**: Current phase of the gait cycle. Useful for real-time visualization.
- **flags (bitfield)**:

```
Bit 0:  data_valid      1 = metrics are computed from real sensor data
                        0 = mock/interpolated data
Bit 1:  low_battery     1 = battery < 15%
Bit 2:  imu_error       1 = IMU read failure (data may be stale)
Bit 3:  time_synced     1 = timestamp is synced to phone epoch
                        0 = timestamp is millis() since boot
Bits 4–7: Reserved (0)
```

### 3.3 Battery Level (Read) — `0x0004`

**Packet format (1 byte):**

```
Byte 0:    uint8_t    battery_percent    0–100
```

The firmware updates this value every 30 seconds internally. The app can read it at any time. A value of `0xFF` (255) indicates "charging / unknown".

### 3.4 Device Name (Read) — `0x0006`

**Packet format (variable length, up to 20 bytes):**

```
Bytes 0–N:  UTF-8 string    Device name (e.g. "FormTracker-1A2B")
```

Returns the same name used in BLE advertising. The app can read this after connection to identify which device it is connected to, useful when multiple Form Trackers are in range.

### 3.5 Log Download (Read/Notify) — `0x0005`

**Reserved for future use.** This characteristic will support downloading stored session data when the device logs locally to flash.

Planned format (not yet finalized):

```
Byte 0:      uint8_t   chunk_sequence     0–255 (wraps)
Byte 1:      uint8_t   total_chunks       total expected
Bytes 2–19:  uint8_t[] payload            up to 18 bytes of log data
```

Firmware should register this characteristic but return empty data for now. The app should not subscribe to it until v2.

---

## 4. Bandwidth Calculation

### 4.1 Per-Packet

| Item                  | Value    |
| --------------------- | -------- |
| Feature packet        | 12 bytes |
| ATT notification hdr  | 3 bytes  |
| L2CAP header          | 4 bytes  |
| **Total over-the-air** | **19 bytes** |

### 4.2 At 10 Hz Streaming

| Metric               | Value              |
| -------------------- | ------------------ |
| Packets/sec          | 10                 |
| Payload bytes/sec    | 120 B/s            |
| Over-the-air bytes/s | 190 B/s            |
| BLE 4.2 max payload  | ~256 kbps          |
| **Utilization**      | **< 0.1%**         |

This leaves substantial headroom for:
- Connection interval negotiation (even at a slow 50 ms CI, we get 20 slots/sec — plenty for 10 packets)
- Future addition of more characteristics or higher stream rates
- Retransmissions on noisy RF channels

### 4.3 MTU Considerations

The default ATT MTU is 23 bytes (20 byte payload). Our 12-byte feature packet fits in a single ATT notification with no fragmentation. No MTU negotiation is required, though requesting MTU 64+ is recommended for the future Log Download feature.

---

## 5. Connection Parameters

Firmware should request the following connection parameters after pairing:

| Parameter             | Value     | Notes                              |
| --------------------- | --------- | ---------------------------------- |
| Connection Interval   | 15–30 ms  | Low latency for 10 Hz streaming    |
| Slave Latency         | 0         | Device must respond every interval  |
| Supervision Timeout   | 4000 ms   | 4 seconds before disconnect        |
| MTU                   | 23+ (default OK) | 12-byte packets fit default MTU |

---

## 6. Mock Data Specification

During development, firmware should send realistic mock data so the app team can build and test independently.

### 6.1 Mock Mode Activation

Mock mode is active when the IMU is unavailable or when a compile flag is set:

```cpp
#define MOCK_DATA_ENABLED 1  // Set to 0 for real sensor data
```

When mock mode is active, the `flags` byte bit 0 (`data_valid`) must be `0`.

### 6.2 Mock Data Profiles

**Profile: Steady Easy Run (~160 spm)**

| Field                | Base Value | Variation    | Pattern                |
| -------------------- | ---------- | ------------ | ---------------------- |
| cadence              | 160 spm    | +/- 4 spm    | Sine wave, 30s period  |
| ground_contact_time  | 250 ms     | +/- 15 ms    | Sine wave, 30s period, inverse to cadence |
| vertical_oscillation | 85 mm      | +/- 10 mm    | Sine wave, 30s period, in phase with GCT |
| stride_phase         | —          | —            | Alternates: 150ms stance, 50ms flight at 160 spm |

**Profile: Tempo Run (~175 spm)**

| Field                | Base Value | Variation    | Pattern                |
| -------------------- | ---------- | ------------ | ---------------------- |
| cadence              | 175 spm    | +/- 3 spm    | Sine wave, 20s period  |
| ground_contact_time  | 220 ms     | +/- 10 ms    | Sine wave, inverse     |
| vertical_oscillation | 70 mm      | +/- 8 mm     | Sine wave, in phase with GCT |
| stride_phase         | —          | —            | Alternates: 130ms stance, 55ms flight |

### 6.3 Mock Data Generation (Pseudocode)

```cpp
uint32_t mock_tick = 0;  // incremented each sample

void generate_mock_packet(feature_packet_t* pkt) {
    pkt->timestamp = millis();

    float phase = sin(2.0 * PI * mock_tick / (10.0 * 30.0));  // 30s period at 10Hz

    pkt->cadence              = 160 + (int16_t)(4.0 * phase);
    pkt->ground_contact_time  = 250 - (int16_t)(15.0 * phase);
    pkt->vertical_oscillation = 85  - (int16_t)(10.0 * phase);

    // Stride phase: simple toggle based on timing
    uint32_t stride_period_ms = 60000 / pkt->cadence;  // ~375ms at 160spm
    uint32_t stance_ms = stride_period_ms * 2 / 3;     // ~250ms stance
    uint32_t phase_ms = pkt->timestamp % stride_period_ms;
    pkt->stride_phase = (phase_ms < stance_ms) ? 1 : 2;

    pkt->flags = 0x00;  // bit 0 = 0 → mock data

    mock_tick++;
}
```

### 6.4 Mock Battery

Battery should drain from `100` to `15` linearly over 10 minutes of streaming, then hold at `15` with the `low_battery` flag set. This lets the app team test the low-battery UI.

---

## 7. Advertising

### 7.1 Device Name

BLE advertised name: `FormTracker-XXXX` where `XXXX` is the last 4 hex digits of the device MAC address.

### 7.2 Advertising Data

| Field              | Value                                    |
| ------------------ | ---------------------------------------- |
| Flags              | `0x06` (General Discoverable, BR/EDR not supported) |
| Complete Local Name | `FormTracker-XXXX`                      |
| 128-bit Service UUID | `a0e50001-0000-1000-8000-00805f9b34fb` |
| TX Power Level     | 0 dBm                                   |
| Advertising Interval | 100–200 ms (fast) / 1000 ms (slow after 30s) |

---

## 8. Error Handling

| Scenario               | Firmware Behavior                           | App Behavior                     |
| ---------------------- | ------------------------------------------- | -------------------------------- |
| IMU read failure       | Set `imu_error` flag, send last valid data  | Show warning indicator           |
| BLE disconnect         | Stop streaming, resume advertising          | Auto-reconnect with backoff      |
| Invalid config write   | Return ATT error `0x80`                     | Log error, do not retry blindly  |
| Buffer overflow        | Drop oldest packet                          | Detect via timestamp gap         |

---

## 9. App-Side Parsing Reference (TypeScript)

```typescript
interface FeaturePacket {
  timestamp: number;          // ms, uint32
  cadence: number;            // steps/min, uint16
  groundContactTime: number;  // ms, uint16
  verticalOscillation: number; // mm, uint16 (divide by 10 for cm)
  stridePhase: 'unknown' | 'stance' | 'flight';
  flags: {
    dataValid: boolean;
    lowBattery: boolean;
    imuError: boolean;
  };
}

function parseFeaturePacket(data: DataView): FeaturePacket {
  return {
    timestamp: data.getUint32(0, true),           // little-endian
    cadence: data.getUint16(4, true),
    groundContactTime: data.getUint16(6, true),
    verticalOscillation: data.getUint16(8, true),
    stridePhase: ['unknown', 'stance', 'flight'][data.getUint8(10)] ?? 'unknown',
    flags: {
      dataValid:  !!(data.getUint8(11) & 0x01),
      lowBattery: !!(data.getUint8(11) & 0x02),
      imuError:   !!(data.getUint8(11) & 0x04),
    },
  };
}
```

---

## 10. Firmware-Side Struct Reference (C/C++)

```cpp
#pragma pack(push, 1)
typedef struct {
    uint32_t timestamp;             // ms since boot
    uint16_t cadence;               // steps/min
    uint16_t ground_contact_time;   // ms
    uint16_t vertical_oscillation;  // mm (0.1 cm resolution)
    uint8_t  stride_phase;          // 0=unknown, 1=stance, 2=flight
    uint8_t  flags;                 // bit 0: data_valid, bit 1: low_battery, bit 2: imu_error
} feature_packet_t;
#pragma pack(pop)

// Verify at compile time
static_assert(sizeof(feature_packet_t) == 12, "Feature packet must be 12 bytes");
```

---

## Appendix A: Revision History

| Version | Date       | Author | Changes           |
| ------- | ---------- | ------ | ----------------- |
| 1.1.0   | 2026-02-07 | —      | Add time sync command (0x04), Device Name characteristic (0x0006), time_synced flag (bit 3) |
| 1.0.0   | 2026-02-07 | —      | Initial draft     |
