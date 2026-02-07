import type {Device} from 'react-native-ble-plx';

export interface FeaturePacket {
  timestamp: number;
  cadence: number;
  groundContactTime: number;
  verticalOscillation: number;
  stridePhase: 'unknown' | 'stance' | 'flight';
  flags: {
    dataValid: boolean;
    lowBattery: boolean;
    imuError: boolean;
  };
}

export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface ScannedDevice {
  id: string;
  name: string;
  rssi: number | null;
  device: Device;
}

export interface BLEState {
  connectionState: ConnectionState;
  scannedDevices: ScannedDevice[];
  connectedDevice: Device | null;
  latestPacket: FeaturePacket | null;
  batteryLevel: number | null;
  error: string | null;
}

export type BLEAction =
  | {type: 'SET_CONNECTION_STATE'; payload: ConnectionState}
  | {type: 'ADD_SCANNED_DEVICE'; payload: ScannedDevice}
  | {type: 'CLEAR_SCANNED_DEVICES'}
  | {type: 'SET_CONNECTED_DEVICE'; payload: Device | null}
  | {type: 'SET_LATEST_PACKET'; payload: FeaturePacket}
  | {type: 'SET_BATTERY_LEVEL'; payload: number}
  | {type: 'SET_ERROR'; payload: string | null}
  | {type: 'RESET'};
