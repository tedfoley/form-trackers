import {useReducer, useCallback, useRef, useEffect} from 'react';
import {Platform, PermissionsAndroid} from 'react-native';
import {BleManager, Device, type Subscription} from 'react-native-ble-plx';
import type {BLEState, BLEAction, ScannedDevice} from './types';
import {
  SERVICE_UUID,
  CHAR_CONFIG_UUID,
  CHAR_FEATURE_UUID,
  CHAR_BATTERY_UUID,
  DEVICE_NAME_PREFIX,
  CMD_START_STREAMING,
  CMD_STOP_STREAMING,
  MTU_SIZE,
} from './constants';
import {parseFeaturePacket, parseBatteryLevel, encodeConfigCommand} from './parser';

const bleManager = new BleManager();

const initialState: BLEState = {
  connectionState: 'disconnected',
  scannedDevices: [],
  connectedDevice: null,
  latestPacket: null,
  batteryLevel: null,
  error: null,
};

function bleReducer(state: BLEState, action: BLEAction): BLEState {
  switch (action.type) {
    case 'SET_CONNECTION_STATE':
      return {...state, connectionState: action.payload, error: null};
    case 'ADD_SCANNED_DEVICE': {
      const exists = state.scannedDevices.some(d => d.id === action.payload.id);
      if (exists) {
        return {
          ...state,
          scannedDevices: state.scannedDevices.map(d =>
            d.id === action.payload.id ? action.payload : d,
          ),
        };
      }
      return {
        ...state,
        scannedDevices: [...state.scannedDevices, action.payload],
      };
    }
    case 'CLEAR_SCANNED_DEVICES':
      return {...state, scannedDevices: []};
    case 'SET_CONNECTED_DEVICE':
      return {...state, connectedDevice: action.payload};
    case 'SET_LATEST_PACKET':
      return {...state, latestPacket: action.payload};
    case 'SET_BATTERY_LEVEL':
      return {...state, batteryLevel: action.payload};
    case 'SET_ERROR':
      return {...state, error: action.payload};
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function useBLE() {
  const [state, dispatch] = useReducer(bleReducer, initialState);
  const subscriptionRef = useRef<Subscription | null>(null);
  const disconnectSubRef = useRef<Subscription | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const shouldReconnectRef = useRef(false);
  const connectedDeviceRef = useRef<Device | null>(null);

  const cleanup = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      shouldReconnectRef.current = false;
    };
  }, [cleanup]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;
      if (apiLevel >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return (
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
        );
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return result === 'granted';
      }
    }
    return true;
  }, []);

  const startScan = useCallback(async () => {
    const granted = await requestPermissions();
    if (!granted) {
      dispatch({type: 'SET_ERROR', payload: 'Bluetooth permissions not granted'});
      return;
    }

    dispatch({type: 'CLEAR_SCANNED_DEVICES'});
    dispatch({type: 'SET_CONNECTION_STATE', payload: 'scanning'});

    bleManager.startDeviceScan(
      [SERVICE_UUID],
      {allowDuplicates: false},
      (error, device) => {
        if (error) {
          dispatch({type: 'SET_ERROR', payload: error.message});
          dispatch({type: 'SET_CONNECTION_STATE', payload: 'disconnected'});
          return;
        }
        if (device && device.name?.startsWith(DEVICE_NAME_PREFIX)) {
          const scanned: ScannedDevice = {
            id: device.id,
            name: device.name,
            rssi: device.rssi,
            device,
          };
          dispatch({type: 'ADD_SCANNED_DEVICE', payload: scanned});
        }
      },
    );
  }, [requestPermissions]);

  const stopScan = useCallback(() => {
    bleManager.stopDeviceScan();
    if (state.connectionState === 'scanning') {
      dispatch({type: 'SET_CONNECTION_STATE', payload: 'disconnected'});
    }
  }, [state.connectionState]);

  const subscribeToFeatures = useCallback((device: Device) => {
    subscriptionRef.current = device.monitorCharacteristicForService(
      SERVICE_UUID,
      CHAR_FEATURE_UUID,
      (error, characteristic) => {
        if (error) {
          return;
        }
        if (characteristic?.value) {
          const packet = parseFeaturePacket(characteristic.value);
          dispatch({type: 'SET_LATEST_PACKET', payload: packet});
        }
      },
    );
  }, []);

  const readBattery = useCallback(async (device: Device) => {
    try {
      const characteristic = await device.readCharacteristicForService(
        SERVICE_UUID,
        CHAR_BATTERY_UUID,
      );
      if (characteristic.value) {
        const level = parseBatteryLevel(characteristic.value);
        dispatch({type: 'SET_BATTERY_LEVEL', payload: level});
      }
    } catch {
      // Battery read is non-critical
    }
  }, []);

  const connectToDevice = useCallback(
    async (device: Device) => {
      bleManager.stopDeviceScan();
      dispatch({type: 'SET_CONNECTION_STATE', payload: 'connecting'});

      try {
        const connected = await device.connect({requestMTU: MTU_SIZE});
        await connected.discoverAllServicesAndCharacteristics();

        connectedDeviceRef.current = connected;
        shouldReconnectRef.current = true;
        reconnectDelayRef.current = 1000;

        dispatch({type: 'SET_CONNECTED_DEVICE', payload: connected});
        dispatch({type: 'SET_CONNECTION_STATE', payload: 'connected'});

        // Start streaming
        const startCmd = encodeConfigCommand(CMD_START_STREAMING);
        await connected.writeCharacteristicWithResponseForService(
          SERVICE_UUID,
          CHAR_CONFIG_UUID,
          startCmd,
        );

        subscribeToFeatures(connected);
        readBattery(connected);

        // Monitor disconnect
        disconnectSubRef.current = bleManager.onDeviceDisconnected(
          connected.id,
          () => {
            subscriptionRef.current?.remove();
            subscriptionRef.current = null;
            dispatch({type: 'SET_CONNECTED_DEVICE', payload: null});

            if (shouldReconnectRef.current) {
              dispatch({type: 'SET_CONNECTION_STATE', payload: 'reconnecting'});
              attemptReconnect(device);
            } else {
              dispatch({type: 'SET_CONNECTION_STATE', payload: 'disconnected'});
            }
          },
        );
      } catch (error: any) {
        dispatch({
          type: 'SET_ERROR',
          payload: error?.message ?? 'Connection failed',
        });
        dispatch({type: 'SET_CONNECTION_STATE', payload: 'disconnected'});
      }
    },
    [subscribeToFeatures, readBattery],
  );

  const attemptReconnect = useCallback(
    (device: Device) => {
      reconnectTimerRef.current = setTimeout(async () => {
        if (!shouldReconnectRef.current) {
          return;
        }
        try {
          await connectToDevice(device);
        } catch {
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            30000,
          );
          if (shouldReconnectRef.current) {
            attemptReconnect(device);
          }
        }
      }, reconnectDelayRef.current);
    },
    [connectToDevice],
  );

  const disconnect = useCallback(async () => {
    shouldReconnectRef.current = false;
    cleanup();

    const device = connectedDeviceRef.current;
    if (device) {
      try {
        const stopCmd = encodeConfigCommand(CMD_STOP_STREAMING);
        await device.writeCharacteristicWithResponseForService(
          SERVICE_UUID,
          CHAR_CONFIG_UUID,
          stopCmd,
        );
      } catch {
        // Best effort
      }
      try {
        await device.cancelConnection();
      } catch {
        // Already disconnected
      }
    }

    connectedDeviceRef.current = null;
    dispatch({type: 'RESET'});
  }, [cleanup]);

  return {
    state,
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
  };
}
