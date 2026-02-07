import {useReducer, useCallback, useRef, useEffect} from 'react';
import {Platform, PermissionsAndroid} from 'react-native';
import {BleManager, Device, type Subscription} from 'react-native-ble-plx';
import type {
  BLEState,
  BLEAction,
  ScannedDevice,
  PodState,
  PodAssignment,
  BodyLocation,
} from './types';
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
import {
  parseFeaturePacket,
  parseBatteryLevel,
  encodeConfigCommand,
  encodeTimeSyncCommand,
} from './parser';
import {
  savePodAssignments,
  loadPodAssignments,
} from '../storage/podStorage';
import {startDemoStreaming} from './demoMode';

const bleManager = new BleManager();

const initialState: BLEState = {
  scanState: 'idle',
  scannedDevices: [],
  pods: {},
  selectedPodId: null,
  savedAssignments: [],
  demoMode: false,
  error: null,
};

function bleReducer(state: BLEState, action: BLEAction): BLEState {
  switch (action.type) {
    case 'SET_SCAN_STATE':
      return {...state, scanState: action.payload, error: null};
    case 'ADD_SCANNED_DEVICE': {
      const exists = state.scannedDevices.some(
        d => d.id === action.payload.id,
      );
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
    case 'ADD_POD':
      return {
        ...state,
        pods: {...state.pods, [action.payload.deviceId]: action.payload},
      };
    case 'REMOVE_POD': {
      const {[action.payload]: _, ...rest} = state.pods;
      return {
        ...state,
        pods: rest,
        selectedPodId:
          state.selectedPodId === action.payload ? null : state.selectedPodId,
      };
    }
    case 'SET_POD_CONNECTION_STATE': {
      const pod = state.pods[action.payload.deviceId];
      if (!pod) return state;
      return {
        ...state,
        pods: {
          ...state.pods,
          [action.payload.deviceId]: {
            ...pod,
            connectionState: action.payload.state,
          },
        },
      };
    }
    case 'SET_POD_PACKET': {
      const pod = state.pods[action.payload.deviceId];
      if (!pod) return state;
      return {
        ...state,
        pods: {
          ...state.pods,
          [action.payload.deviceId]: {
            ...pod,
            latestPacket: action.payload.packet,
          },
        },
      };
    }
    case 'SET_POD_BATTERY': {
      const pod = state.pods[action.payload.deviceId];
      if (!pod) return state;
      return {
        ...state,
        pods: {
          ...state.pods,
          [action.payload.deviceId]: {
            ...pod,
            batteryLevel: action.payload.level,
          },
        },
      };
    }
    case 'SET_POD_LOCATION': {
      const pod = state.pods[action.payload.deviceId];
      if (!pod) return state;
      return {
        ...state,
        pods: {
          ...state.pods,
          [action.payload.deviceId]: {
            ...pod,
            bodyLocation: action.payload.location,
          },
        },
      };
    }
    case 'SET_POD_TIME_SYNCED': {
      const pod = state.pods[action.payload.deviceId];
      if (!pod) return state;
      return {
        ...state,
        pods: {
          ...state.pods,
          [action.payload.deviceId]: {
            ...pod,
            timeSynced: action.payload.synced,
          },
        },
      };
    }
    case 'SET_SELECTED_POD':
      return {...state, selectedPodId: action.payload};
    case 'LOAD_SAVED_ASSIGNMENTS':
      return {...state, savedAssignments: action.payload};
    case 'SET_DEMO_MODE':
      return {...state, demoMode: action.payload};
    case 'SET_ERROR':
      return {...state, error: action.payload};
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

interface PodRefs {
  featureSub: Subscription | null;
  disconnectSub: Subscription | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectDelay: number;
  shouldReconnect: boolean;
  device: Device;
}

export function useBLE() {
  const [state, dispatch] = useReducer(bleReducer, initialState);
  const podRefsMap = useRef<Map<string, PodRefs>>(new Map());
  const demoStopRef = useRef<(() => void) | null>(null);

  const cleanupPodRefs = useCallback((deviceId: string) => {
    const refs = podRefsMap.current.get(deviceId);
    if (!refs) return;
    refs.featureSub?.remove();
    refs.disconnectSub?.remove();
    if (refs.reconnectTimer) clearTimeout(refs.reconnectTimer);
    refs.shouldReconnect = false;
    podRefsMap.current.delete(deviceId);
  }, []);

  useEffect(() => {
    return () => {
      for (const deviceId of podRefsMap.current.keys()) {
        cleanupPodRefs(deviceId);
      }
      demoStopRef.current?.();
    };
  }, [cleanupPodRefs]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;
      if (apiLevel >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return (
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
            'granted' &&
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
            'granted'
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
      dispatch({
        type: 'SET_ERROR',
        payload: 'Bluetooth permissions not granted',
      });
      return;
    }

    dispatch({type: 'CLEAR_SCANNED_DEVICES'});
    dispatch({type: 'SET_SCAN_STATE', payload: 'scanning'});

    bleManager.startDeviceScan(
      [SERVICE_UUID],
      {allowDuplicates: false},
      (error, device) => {
        if (error) {
          dispatch({type: 'SET_ERROR', payload: error.message});
          dispatch({type: 'SET_SCAN_STATE', payload: 'idle'});
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
    dispatch({type: 'SET_SCAN_STATE', payload: 'idle'});
  }, []);

  const connectToPod = useCallback(
    async (device: Device) => {
      const deviceId = device.id;

      dispatch({
        type: 'ADD_POD',
        payload: {
          deviceId,
          deviceName: device.name ?? deviceId,
          device,
          connectionState: 'connecting',
          latestPacket: null,
          batteryLevel: null,
          bodyLocation: null,
          timeSynced: false,
        },
      });

      try {
        const connected = await device.connect({requestMTU: MTU_SIZE});
        await connected.discoverAllServicesAndCharacteristics();

        const refs: PodRefs = {
          featureSub: null,
          disconnectSub: null,
          reconnectTimer: null,
          reconnectDelay: 1000,
          shouldReconnect: true,
          device: connected,
        };
        podRefsMap.current.set(deviceId, refs);

        dispatch({
          type: 'SET_POD_CONNECTION_STATE',
          payload: {deviceId, state: 'connected'},
        });

        // Time sync
        try {
          const syncCmd = encodeTimeSyncCommand(Date.now());
          await connected.writeCharacteristicWithResponseForService(
            SERVICE_UUID,
            CHAR_CONFIG_UUID,
            syncCmd,
          );
          dispatch({
            type: 'SET_POD_TIME_SYNCED',
            payload: {deviceId, synced: true},
          });
        } catch {
          // Time sync is non-critical
        }

        // Start streaming
        const startCmd = encodeConfigCommand(CMD_START_STREAMING);
        await connected.writeCharacteristicWithResponseForService(
          SERVICE_UUID,
          CHAR_CONFIG_UUID,
          startCmd,
        );

        // Subscribe to feature notifications
        refs.featureSub = connected.monitorCharacteristicForService(
          SERVICE_UUID,
          CHAR_FEATURE_UUID,
          (error, characteristic) => {
            if (error) return;
            if (characteristic?.value) {
              const packet = parseFeaturePacket(characteristic.value);
              dispatch({
                type: 'SET_POD_PACKET',
                payload: {deviceId, packet},
              });
            }
          },
        );

        // Read battery
        try {
          const battChar = await connected.readCharacteristicForService(
            SERVICE_UUID,
            CHAR_BATTERY_UUID,
          );
          if (battChar.value) {
            const level = parseBatteryLevel(battChar.value);
            dispatch({
              type: 'SET_POD_BATTERY',
              payload: {deviceId, level},
            });
          }
        } catch {
          // Battery read is non-critical
        }

        // Monitor disconnect
        refs.disconnectSub = bleManager.onDeviceDisconnected(
          deviceId,
          () => {
            refs.featureSub?.remove();
            refs.featureSub = null;

            if (refs.shouldReconnect) {
              dispatch({
                type: 'SET_POD_CONNECTION_STATE',
                payload: {deviceId, state: 'reconnecting'},
              });
              attemptReconnect(deviceId);
            } else {
              dispatch({
                type: 'SET_POD_CONNECTION_STATE',
                payload: {deviceId, state: 'disconnected'},
              });
            }
          },
        );
      } catch (error: any) {
        dispatch({
          type: 'SET_ERROR',
          payload: error?.message ?? 'Connection failed',
        });
        dispatch({type: 'REMOVE_POD', payload: deviceId});
        cleanupPodRefs(deviceId);
      }
    },
    [cleanupPodRefs],
  );

  const attemptReconnect = useCallback(
    (deviceId: string) => {
      const refs = podRefsMap.current.get(deviceId);
      if (!refs) return;

      refs.reconnectTimer = setTimeout(async () => {
        if (!refs.shouldReconnect) return;
        try {
          // Clean up old refs but keep the entry
          refs.featureSub?.remove();
          refs.disconnectSub?.remove();

          await connectToPod(refs.device);
        } catch {
          refs.reconnectDelay = Math.min(refs.reconnectDelay * 2, 30000);
          if (refs.shouldReconnect) {
            attemptReconnect(deviceId);
          }
        }
      }, refs.reconnectDelay);
    },
    [connectToPod],
  );

  const disconnectPod = useCallback(
    async (deviceId: string) => {
      const refs = podRefsMap.current.get(deviceId);
      if (refs) {
        refs.shouldReconnect = false;
        try {
          const stopCmd = encodeConfigCommand(CMD_STOP_STREAMING);
          await refs.device.writeCharacteristicWithResponseForService(
            SERVICE_UUID,
            CHAR_CONFIG_UUID,
            stopCmd,
          );
        } catch {
          // Best effort
        }
        try {
          await refs.device.cancelConnection();
        } catch {
          // Already disconnected
        }
      }
      cleanupPodRefs(deviceId);
      dispatch({type: 'REMOVE_POD', payload: deviceId});
    },
    [cleanupPodRefs],
  );

  const disconnectAll = useCallback(async () => {
    // Stop demo if running
    if (demoStopRef.current) {
      demoStopRef.current();
      demoStopRef.current = null;
    }

    const deviceIds = Array.from(podRefsMap.current.keys());
    for (const deviceId of deviceIds) {
      await disconnectPod(deviceId);
    }
    dispatch({type: 'RESET'});
  }, [disconnectPod]);

  const assignPodLocation = useCallback(
    (deviceId: string, location: BodyLocation | null) => {
      dispatch({type: 'SET_POD_LOCATION', payload: {deviceId, location}});
    },
    [],
  );

  const setSelectedPod = useCallback((deviceId: string | null) => {
    dispatch({type: 'SET_SELECTED_POD', payload: deviceId});
  }, []);

  const loadAssignments = useCallback(async () => {
    try {
      const assignments = await loadPodAssignments();
      dispatch({type: 'LOAD_SAVED_ASSIGNMENTS', payload: assignments});
    } catch {
      // Non-critical
    }
  }, []);

  const saveAssignments = useCallback(
    async (assignments: PodAssignment[]) => {
      await savePodAssignments(assignments);
      dispatch({type: 'LOAD_SAVED_ASSIGNMENTS', payload: assignments});
    },
    [],
  );

  const startDemoMode = useCallback(() => {
    dispatch({type: 'SET_DEMO_MODE', payload: true});

    // Add 3 demo pods
    const demoPods: PodState[] = [
      {
        deviceId: 'demo-left-foot',
        deviceName: 'Demo Left Foot',
        device: null,
        connectionState: 'connected',
        latestPacket: null,
        batteryLevel: 85,
        bodyLocation: 'left_foot',
        timeSynced: true,
      },
      {
        deviceId: 'demo-right-foot',
        deviceName: 'Demo Right Foot',
        device: null,
        connectionState: 'connected',
        latestPacket: null,
        batteryLevel: 85,
        bodyLocation: 'right_foot',
        timeSynced: true,
      },
      {
        deviceId: 'demo-waist',
        deviceName: 'Demo Waist',
        device: null,
        connectionState: 'connected',
        latestPacket: null,
        batteryLevel: 85,
        bodyLocation: 'waist',
        timeSynced: true,
      },
    ];

    for (const pod of demoPods) {
      dispatch({type: 'ADD_POD', payload: pod});
    }
    dispatch({type: 'SET_SELECTED_POD', payload: 'demo-left-foot'});

    // Start streaming mock data
    const stop = startDemoStreaming((deviceId, packet) => {
      dispatch({type: 'SET_POD_PACKET', payload: {deviceId, packet}});
    }, (deviceId, level) => {
      dispatch({type: 'SET_POD_BATTERY', payload: {deviceId, level}});
    });
    demoStopRef.current = stop;
  }, []);

  const stopDemoMode = useCallback(() => {
    if (demoStopRef.current) {
      demoStopRef.current();
      demoStopRef.current = null;
    }
    dispatch({type: 'SET_DEMO_MODE', payload: false});
    dispatch({type: 'RESET'});
  }, []);

  return {
    state,
    startScan,
    stopScan,
    connectToPod,
    disconnectPod,
    disconnectAll,
    assignPodLocation,
    setSelectedPod,
    loadAssignments,
    saveAssignments,
    startDemoMode,
    stopDemoMode,
  };
}
