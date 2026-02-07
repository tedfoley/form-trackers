// Form Tracker — BLE Running Form Peripheral
// Target: Seeed XIAO nRF52840 Sense
// Protocol: docs/ble-protocol.md v1.1.0
//
// Streams mock running biomechanics data over BLE at 10 Hz.
// Real IMU integration will replace the mock data generator later.

#include <ArduinoBLE.h>

// ---------------------------------------------------------------------------
// BLE UUIDs (from ble-protocol.md)
// ---------------------------------------------------------------------------
#define SERVICE_UUID        "a0e50001-0000-1000-8000-00805f9b34fb"
#define CHAR_CONFIG_UUID    "a0e50002-0000-1000-8000-00805f9b34fb"
#define CHAR_FEATURE_UUID   "a0e50003-0000-1000-8000-00805f9b34fb"
#define CHAR_BATTERY_UUID   "a0e50004-0000-1000-8000-00805f9b34fb"
#define CHAR_LOG_UUID       "a0e50005-0000-1000-8000-00805f9b34fb"
#define CHAR_DEVNAME_UUID   "a0e50006-0000-1000-8000-00805f9b34fb"

// ---------------------------------------------------------------------------
// Feature packet (12 bytes, packed, little-endian on ARM)
// ---------------------------------------------------------------------------
#pragma pack(push, 1)
typedef struct {
    uint32_t timestamp;             // ms since boot
    uint16_t cadence;               // steps/min
    uint16_t ground_contact_time;   // ms
    uint16_t vertical_oscillation;  // mm (divide by 10 for cm)
    uint8_t  stride_phase;          // 0=unknown, 1=stance, 2=flight
    uint8_t  flags;                 // bit 0: data_valid, bit 1: low_battery, bit 2: imu_error
} feature_packet_t;
#pragma pack(pop)

static_assert(sizeof(feature_packet_t) == 12, "Feature packet must be 12 bytes");

// ---------------------------------------------------------------------------
// Config command bytes
// ---------------------------------------------------------------------------
#define CMD_START_STREAMING  0x01
#define CMD_STOP_STREAMING   0x02
#define CMD_REQUEST_BATTERY  0x03
#define CMD_TIME_SYNC        0x04

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
#define DEFAULT_STREAM_HZ       10
#define BATTERY_UPDATE_INTERVAL 30000   // ms — update battery every 30 s
#define MOCK_BATTERY_DRAIN_MS   600000  // 10 minutes from 100 → 15%

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

// BLE objects
BLEService formService(SERVICE_UUID);

BLECharacteristic configChar(CHAR_CONFIG_UUID,
                             BLEWrite, 9);  // up to 9 bytes (time sync cmd)

BLECharacteristic featureChar(CHAR_FEATURE_UUID,
                              BLENotify, sizeof(feature_packet_t));

BLECharacteristic batteryChar(CHAR_BATTERY_UUID,
                              BLERead, 1);

BLECharacteristic logChar(CHAR_LOG_UUID,
                           BLERead | BLENotify, 20);  // reserved, empty

BLECharacteristic devNameChar(CHAR_DEVNAME_UUID,
                              BLERead, 20);  // device name string

// State
bool     streaming        = false;
uint8_t  streamHz         = DEFAULT_STREAM_HZ;
uint32_t lastStreamMs     = 0;
uint32_t lastBatteryMs    = 0;
uint32_t streamStartMs    = 0;
uint32_t mockTick         = 0;

// Time sync state
bool     timeSynced       = false;
uint64_t syncEpochMs      = 0;   // phone's epoch ms at sync time
uint32_t syncLocalMs      = 0;   // millis() at sync time

// Device name (built from MAC, stored globally for characteristic)
char     deviceName[24]   = "FormTracker";

// ---------------------------------------------------------------------------
// Device name from MAC
// ---------------------------------------------------------------------------
void buildDeviceName(char* buf, size_t len) {
    // BLE.address() returns "aa:bb:cc:dd:ee:ff"
    String addr = BLE.address();
    // Last 4 hex digits = chars at positions 12,13,15,16 (skipping ':')
    String suffix = "";
    suffix += addr.charAt(12);
    suffix += addr.charAt(13);
    suffix += addr.charAt(15);
    suffix += addr.charAt(16);
    suffix.toUpperCase();
    snprintf(buf, len, "FormTracker-%s", suffix.c_str());
}

// ---------------------------------------------------------------------------
// Timestamp: returns synced epoch ms (lower 32 bits) or raw millis()
// ---------------------------------------------------------------------------
uint32_t getTimestamp() {
    if (timeSynced) {
        uint64_t epoch = syncEpochMs + (uint64_t)(millis() - syncLocalMs);
        return (uint32_t)(epoch & 0xFFFFFFFF);
    }
    return millis();
}

// ---------------------------------------------------------------------------
// Mock data generation (per ble-protocol.md §6)
// ---------------------------------------------------------------------------
void generateMockPacket(feature_packet_t* pkt) {
    pkt->timestamp = getTimestamp();

    // 30-second sine wave at 10 Hz → period = 10 * 30 = 300 ticks
    float phase = sin(2.0f * PI * (float)mockTick / 300.0f);

    // Cadence: 160 +/- 4 spm
    pkt->cadence = (uint16_t)(160 + (int16_t)(4.0f * phase));

    // GCT: 250 +/- 15 ms, inverse to cadence
    pkt->ground_contact_time = (uint16_t)(250 - (int16_t)(15.0f * phase));

    // Vertical oscillation: 85 +/- 10 mm, in phase with GCT (inverse to cadence)
    pkt->vertical_oscillation = (uint16_t)(85 - (int16_t)(10.0f * phase));

    // Stride phase: stance vs flight based on gait timing (use raw millis for local timing)
    uint32_t stridePeriodMs = 60000 / pkt->cadence;   // ~375 ms at 160 spm
    uint32_t stanceMs       = stridePeriodMs * 2 / 3;  // ~250 ms stance
    uint32_t phaseMs        = millis() % stridePeriodMs;
    pkt->stride_phase       = (phaseMs < stanceMs) ? 1 : 2;

    // Flags: bit 0 = 0 (mock data), bit 1 = low_battery, bit 3 = time_synced
    pkt->flags = 0x00;
    if (getMockBatteryLevel() <= 15) {
        pkt->flags |= 0x02;  // low_battery
    }
    if (timeSynced) {
        pkt->flags |= 0x08;  // time_synced
    }

    mockTick++;
}

// ---------------------------------------------------------------------------
// Mock battery: drain 100 → 15 over 10 min of streaming, then hold at 15
// ---------------------------------------------------------------------------
uint8_t getMockBatteryLevel() {
    if (!streaming) return 85;  // idle default

    uint32_t elapsedMs = millis() - streamStartMs;
    if (elapsedMs >= MOCK_BATTERY_DRAIN_MS) return 15;

    // Linear interpolation: 100 → 15 over MOCK_BATTERY_DRAIN_MS
    float pct = 100.0f - (85.0f * (float)elapsedMs / (float)MOCK_BATTERY_DRAIN_MS);
    return (uint8_t)pct;
}

// ---------------------------------------------------------------------------
// BLE event: config characteristic written
// ---------------------------------------------------------------------------
void onConfigWritten(BLEDevice central, BLECharacteristic characteristic) {
    const uint8_t* data = characteristic.value();
    int len = characteristic.valueLength();
    if (len < 1) return;

    uint8_t cmd = data[0];

    switch (cmd) {
        case CMD_START_STREAMING: {
            uint8_t hz = (len >= 2 && data[1] >= 1 && data[1] <= 20) ? data[1] : DEFAULT_STREAM_HZ;
            streamHz     = hz;
            streaming    = true;
            streamStartMs = millis();
            mockTick     = 0;
            Serial.print("[BLE] Start streaming at ");
            Serial.print(streamHz);
            Serial.println(" Hz");
            break;
        }
        case CMD_STOP_STREAMING:
            streaming = false;
            Serial.println("[BLE] Stop streaming");
            break;
        case CMD_REQUEST_BATTERY: {
            uint8_t level = getMockBatteryLevel();
            batteryChar.writeValue(level);
            Serial.print("[BLE] Battery request → ");
            Serial.print(level);
            Serial.println("%");
            break;
        }
        case CMD_TIME_SYNC: {
            if (len < 9) {
                Serial.println("[BLE] Time sync: need 9 bytes (cmd + uint64)");
                break;
            }
            // Read uint64 little-endian from bytes 1–8
            syncEpochMs = 0;
            for (int i = 0; i < 8; i++) {
                syncEpochMs |= ((uint64_t)data[1 + i]) << (i * 8);
            }
            syncLocalMs = millis();
            timeSynced = true;
            Serial.print("[BLE] Time sync: epoch=");
            // Print high and low 32 bits since Serial doesn't support uint64
            Serial.print((uint32_t)(syncEpochMs >> 32));
            Serial.print(":");
            Serial.print((uint32_t)(syncEpochMs & 0xFFFFFFFF));
            Serial.print(" local=");
            Serial.println(syncLocalMs);
            break;
        }
        default:
            Serial.print("[BLE] Unknown command: 0x");
            Serial.println(cmd, HEX);
            break;
    }
}

// ---------------------------------------------------------------------------
// Serial debug: print packet contents
// ---------------------------------------------------------------------------
void printPacket(const feature_packet_t* pkt) {
    Serial.print("[TX] t=");
    Serial.print(pkt->timestamp);
    Serial.print(" cad=");
    Serial.print(pkt->cadence);
    Serial.print(" gct=");
    Serial.print(pkt->ground_contact_time);
    Serial.print(" vo=");
    Serial.print(pkt->vertical_oscillation);
    Serial.print("mm phase=");
    Serial.print(pkt->stride_phase == 1 ? "stance" : "flight");
    Serial.print(" flags=0x");
    Serial.println(pkt->flags, HEX);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    // Wait up to 2 s for serial monitor (non-blocking for headless use)
    uint32_t serialWait = millis();
    while (!Serial && (millis() - serialWait < 2000));

    Serial.println("=== Form Tracker Firmware ===");
    Serial.println("Protocol: ble-protocol.md v1.1.0");
    Serial.println("Mode: MOCK DATA");
    Serial.println();

    // --- BLE init ---
    if (!BLE.begin()) {
        Serial.println("[ERROR] BLE init failed!");
        while (1) { delay(1000); }
    }

    // Build device name from MAC
    buildDeviceName(deviceName, sizeof(deviceName));
    BLE.setLocalName(deviceName);
    Serial.print("[BLE] Device name: ");
    Serial.println(deviceName);

    // Advertise our service UUID
    BLE.setAdvertisedService(formService);

    // Add characteristics to service
    formService.addCharacteristic(configChar);
    formService.addCharacteristic(featureChar);
    formService.addCharacteristic(batteryChar);
    formService.addCharacteristic(logChar);
    formService.addCharacteristic(devNameChar);

    // Add service
    BLE.addService(formService);

    // Set initial values
    uint8_t initialBattery = 85;
    batteryChar.writeValue(initialBattery);

    uint8_t emptyLog[20] = {0};
    logChar.writeValue(emptyLog, sizeof(emptyLog));

    devNameChar.writeValue(deviceName);

    // Register config write handler
    configChar.setEventHandler(BLEWritten, onConfigWritten);

    // Start advertising
    BLE.advertise();
    Serial.println("[BLE] Advertising started");
    Serial.println("[BLE] Waiting for connection...");
    Serial.println();
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
void loop() {
    // Poll BLE events
    BLE.poll();

    BLEDevice central = BLE.central();

    if (central) {
        // Log connection once
        static bool wasConnected = false;
        if (!wasConnected) {
            Serial.print("[BLE] Connected: ");
            Serial.println(central.address());
            wasConnected = true;
        }

        // Stream feature packets
        if (streaming) {
            uint32_t now = millis();
            uint32_t intervalMs = 1000 / streamHz;

            if (now - lastStreamMs >= intervalMs) {
                lastStreamMs = now;

                feature_packet_t pkt;
                generateMockPacket(&pkt);
                featureChar.writeValue((const uint8_t*)&pkt, sizeof(pkt));

                printPacket(&pkt);
            }
        }

        // Periodic battery update
        {
            uint32_t now = millis();
            if (now - lastBatteryMs >= BATTERY_UPDATE_INTERVAL) {
                lastBatteryMs = now;
                uint8_t level = getMockBatteryLevel();
                batteryChar.writeValue(level);
                Serial.print("[BAT] ");
                Serial.print(level);
                Serial.println("%");
            }
        }

        // Detect disconnect
        if (!central.connected()) {
            streaming = false;
            timeSynced = false;
            wasConnected = false;
            Serial.println("[BLE] Disconnected (time sync reset)");
            Serial.println("[BLE] Advertising resumed");
        }
    }
}
