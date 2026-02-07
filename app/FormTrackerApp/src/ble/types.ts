import type {Device} from 'react-native-ble-plx';

export type BodyLocation =
  | 'left_foot'
  | 'right_foot'
  | 'waist'
  | 'chest'
  | 'left_wrist'
  | 'right_wrist';

export const BODY_LOCATION_LABELS: Record<BodyLocation, string> = {
  left_foot: 'Left Foot',
  right_foot: 'Right Foot',
  waist: 'Waist',
  chest: 'Chest',
  left_wrist: 'Left Wrist',
  right_wrist: 'Right Wrist',
};

export const ALL_BODY_LOCATIONS: BodyLocation[] = [
  'left_foot',
  'right_foot',
  'waist',
  'chest',
  'left_wrist',
  'right_wrist',
];

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
    timeSynced: boolean;
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

export interface PodState {
  deviceId: string;
  deviceName: string;
  device: Device | null;
  connectionState: ConnectionState;
  latestPacket: FeaturePacket | null;
  batteryLevel: number | null;
  bodyLocation: BodyLocation | null;
  timeSynced: boolean;
}

export interface PodAssignment {
  deviceId: string;
  deviceName: string;
  bodyLocation: BodyLocation;
}

export interface BLEState {
  scanState: 'idle' | 'scanning';
  scannedDevices: ScannedDevice[];
  pods: Record<string, PodState>;
  selectedPodId: string | null;
  savedAssignments: PodAssignment[];
  demoMode: boolean;
  error: string | null;
}

export type BLEAction =
  | {type: 'SET_SCAN_STATE'; payload: 'idle' | 'scanning'}
  | {type: 'ADD_SCANNED_DEVICE'; payload: ScannedDevice}
  | {type: 'CLEAR_SCANNED_DEVICES'}
  | {type: 'ADD_POD'; payload: PodState}
  | {type: 'REMOVE_POD'; payload: string}
  | {type: 'SET_POD_CONNECTION_STATE'; payload: {deviceId: string; state: ConnectionState}}
  | {type: 'SET_POD_PACKET'; payload: {deviceId: string; packet: FeaturePacket}}
  | {type: 'SET_POD_BATTERY'; payload: {deviceId: string; level: number}}
  | {type: 'SET_POD_LOCATION'; payload: {deviceId: string; location: BodyLocation | null}}
  | {type: 'SET_POD_TIME_SYNCED'; payload: {deviceId: string; synced: boolean}}
  | {type: 'SET_SELECTED_POD'; payload: string | null}
  | {type: 'LOAD_SAVED_ASSIGNMENTS'; payload: PodAssignment[]}
  | {type: 'SET_DEMO_MODE'; payload: boolean}
  | {type: 'SET_ERROR'; payload: string | null}
  | {type: 'RESET'};
