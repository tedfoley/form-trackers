import React, {useEffect, useCallback} from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useBLEContext} from '../ble/BLEContext';
import {DeviceCard} from '../components/DeviceCard';
import type {ScannedDevice} from '../ble/types';
import type {RootStackParamList} from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

export function ScanScreen({navigation}: Props) {
  const {state, startScan, stopScan, connectToDevice} = useBLEContext();
  const {connectionState, scannedDevices, error} = state;

  useEffect(() => {
    if (connectionState === 'connected') {
      navigation.navigate('Metrics');
    }
  }, [connectionState, navigation]);

  useEffect(() => {
    return () => stopScan();
  }, [stopScan]);

  const handleConnect = useCallback(
    (scanned: ScannedDevice) => {
      connectToDevice(scanned.device);
    },
    [connectToDevice],
  );

  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Form Tracker</Text>
      <Text style={styles.subtitle}>
        Scan for nearby Form Tracker devices
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.scanBtn, isScanning && styles.scanBtnActive]}
        onPress={isScanning ? stopScan : startScan}
        disabled={isConnecting}
        activeOpacity={0.7}>
        {isScanning && <ActivityIndicator color="#FFFFFF" style={styles.spinner} />}
        <Text style={styles.scanBtnText}>
          {isScanning ? 'Stop Scanning' : 'Start Scanning'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={scannedDevices}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <DeviceCard
            device={item}
            onConnect={handleConnect}
            connecting={isConnecting}
          />
        )}
        ListEmptyComponent={
          isScanning ? (
            <Text style={styles.emptyText}>Searching for devices...</Text>
          ) : (
            <Text style={styles.emptyText}>
              Tap "Start Scanning" to find devices
            </Text>
          )
        }
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 15,
    marginTop: 4,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: '#3A1C1C',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#FF453A',
    fontSize: 13,
  },
  scanBtn: {
    backgroundColor: '#0A84FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 20,
  },
  scanBtnActive: {
    backgroundColor: '#FF453A',
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  spinner: {
    marginRight: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
});
