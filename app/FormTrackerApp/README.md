# Form Tracker App

React Native companion app for the Form Tracker BLE running sensor. Connects to a XIAO nRF52840 Sense device and displays real-time running form metrics.

## Prerequisites

- Node.js 18+
- React Native CLI environment ([setup guide](https://reactnative.dev/docs/set-up-your-environment))
- iOS: Xcode 15+, CocoaPods
- Android: Android Studio, SDK 31+
- A Form Tracker device running the firmware from `firmware/form-tracker/`

## Setup

```sh
cd app/FormTrackerApp
npm install
```

### iOS

```sh
bundle install
cd ios && bundle exec pod install && cd ..
npx react-native run-ios
```

> BLE does not work on iOS Simulator. Use a physical device.

### Android

```sh
npx react-native run-android
```

## Architecture

```
BLEProvider (global context, persists across navigation)
  └── NavigationContainer
        └── Stack Navigator
              ├── ScanScreen    — Scan, list devices, connect
              └── MetricsScreen — Live data tiles + cadence chart
```

### Source Structure

```
src/
  ble/
    constants.ts     — BLE UUIDs, command bytes
    types.ts         — FeaturePacket, ConnectionState, BLEState
    parser.ts        — base64 → DataView → typed packet parsing
    useBLE.ts        — Core hook: scan, connect, subscribe, reconnect
    BLEContext.tsx   — Context provider wrapping useBLE
  screens/
    ScanScreen.tsx   — Device scanning with permission handling
    MetricsScreen.tsx — Live metrics display + cadence chart
  components/
    DeviceCard.tsx   — Scanned device list item
    MetricTile.tsx   — Single metric display card
    CadenceChart.tsx — Real-time cadence line chart (2 Hz updates)
    StatusBar.tsx    — Connection status + battery indicator
  navigation/
    AppNavigator.tsx — Stack navigator (Scan → Metrics)
  App.tsx           — Root component
```

### Key Design Decisions

- **Singleton BleManager** at module scope per react-native-ble-plx docs
- **useReducer** for atomic BLE state updates across scan/connect/stream lifecycle
- **Chart throttling**: 10 Hz BLE packets update a ref; a 2 Hz timer copies to state for chart renders
- **Exponential backoff reconnection**: 1s → 2s → 4s → ... → 30s cap, resets on success
- **BLEProvider wraps NavigationContainer** so BLE connection survives screen transitions

## Testing with Firmware

1. Flash the firmware from `firmware/form-tracker/` onto a XIAO nRF52840 Sense
2. The device advertises as `FormTracker-XXXX` with mock data (160 spm steady run profile)
3. Open the app, tap "Start Scanning", then tap the device to connect
4. The app auto-navigates to the Metrics screen on successful connection
5. Mock data flag (`data_valid = false`) is shown as a "Mock data" banner

## BLE Protocol

See [`docs/ble-protocol.md`](../../docs/ble-protocol.md) for the full protocol specification.

- Service UUID: `a0e50001-0000-1000-8000-00805f9b34fb`
- Feature packets: 12 bytes at 10 Hz (cadence, GCT, vertical oscillation, stride phase, flags)
- Config writes: `0x01` start, `0x02` stop, `0x03` battery request
