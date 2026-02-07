import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useBLEContext} from '../ble/BLEContext';
import {StatusBar} from '../components/StatusBar';
import {MetricTile} from '../components/MetricTile';
import {CadenceChart} from '../components/CadenceChart';
import type {RootStackParamList} from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Metrics'>;

const STRIDE_PHASE_LABELS: Record<string, string> = {
  unknown: '—',
  stance: 'Stance',
  flight: 'Flight',
};

export function MetricsScreen({navigation}: Props) {
  const {state, disconnect} = useBLEContext();
  const {connectionState, connectedDevice, latestPacket, batteryLevel} = state;

  const handleDisconnect = async () => {
    await disconnect();
    navigation.navigate('Scan');
  };

  const cadence = latestPacket?.cadence ?? 0;
  const gct = latestPacket?.groundContactTime ?? 0;
  const vertOsc = latestPacket
    ? (latestPacket.verticalOscillation / 10).toFixed(1)
    : '0.0';
  const stridePhase = latestPacket
    ? STRIDE_PHASE_LABELS[latestPacket.stridePhase]
    : '—';
  const imuError = latestPacket?.flags.imuError ?? false;

  return (
    <View style={styles.container}>
      <StatusBar
        connectionState={connectionState}
        deviceName={connectedDevice?.name ?? null}
        batteryLevel={batteryLevel}
      />

      {connectionState === 'reconnecting' && (
        <View style={styles.reconnectBanner}>
          <Text style={styles.reconnectText}>Reconnecting...</Text>
        </View>
      )}

      {!latestPacket?.flags.dataValid && latestPacket && (
        <View style={styles.mockBanner}>
          <Text style={styles.mockText}>Mock data</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Cadence</Text>
        <CadenceChart cadence={latestPacket?.cadence ?? null} />

        <Text style={[styles.sectionTitle, styles.metricsTitle]}>Metrics</Text>
        <View style={styles.tilesRow}>
          <MetricTile
            label="Cadence"
            value={String(cadence)}
            unit="spm"
            warning={imuError}
          />
          <MetricTile
            label="Ground Contact"
            value={String(gct)}
            unit="ms"
            warning={imuError}
          />
        </View>
        <View style={styles.tilesRow}>
          <MetricTile
            label="Vert. Oscillation"
            value={vertOsc}
            unit="cm"
            warning={imuError}
          />
          <MetricTile
            label="Stride Phase"
            value={stridePhase}
            unit=""
          />
        </View>

        <TouchableOpacity
          style={styles.disconnectBtn}
          onPress={handleDisconnect}
          activeOpacity={0.7}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </ScrollView>
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
  reconnectBanner: {
    backgroundColor: '#3A2F00',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  reconnectText: {
    color: '#FFD60A',
    fontSize: 13,
    fontWeight: '500',
  },
  mockBanner: {
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  mockText: {
    color: '#8E8E93',
    fontSize: 12,
  },
  content: {
    paddingBottom: 40,
  },
  sectionTitle: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  metricsTitle: {
    marginTop: 20,
  },
  tilesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  disconnectBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#FF453A',
  },
  disconnectText: {
    color: '#FF453A',
    fontSize: 16,
    fontWeight: '600',
  },
});
