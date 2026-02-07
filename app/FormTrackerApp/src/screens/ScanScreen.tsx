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
  const {state, startScan, stopScan, connectToPod, startDemoMode} =
    useBLEContext();
  const {scanState, scannedDevices, pods, error} = state;

  useEffect(() => {
    return () => stopScan();
  }, [stopScan]);

  const handleConnect = useCallback(
    (scanned: ScannedDevice) => {
      connectToPod(scanned.device);
    },
    [connectToPod],
  );

  const handleDemoMode = useCallback(() => {
    startDemoMode();
    navigation.navigate('PodAssignment');
  }, [startDemoMode, navigation]);

  const isScanning = scanState === 'scanning';
  const connectedCount = Object.keys(pods).length;

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
        activeOpacity={0.7}>
        {isScanning && (
          <ActivityIndicator color="#FFFFFF" style={styles.spinner} />
        )}
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
            connected={!!pods[item.id]}
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

      {connectedCount > 0 && (
        <TouchableOpacity
          style={styles.nextBtn}
          onPress={() => navigation.navigate('PodAssignment')}
          activeOpacity={0.7}>
          <Text style={styles.nextBtnText}>
            Next ({connectedCount} pod{connectedCount !== 1 ? 's' : ''})
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.demoBtn}
        onPress={handleDemoMode}
        activeOpacity={0.7}>
        <Text style={styles.demoBtnText}>Demo Mode</Text>
      </TouchableOpacity>
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
  nextBtn: {
    backgroundColor: '#30D158',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  demoBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  demoBtnText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '600',
  },
});
