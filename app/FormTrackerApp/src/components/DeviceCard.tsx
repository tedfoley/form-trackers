import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {ScannedDevice} from '../ble/types';

interface DeviceCardProps {
  device: ScannedDevice;
  onConnect: (device: ScannedDevice) => void;
  connected: boolean;
}

export function DeviceCard({device, onConnect, connected}: DeviceCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => !connected && onConnect(device)}
      disabled={connected}
      activeOpacity={0.7}>
      <View style={styles.info}>
        <Text style={styles.name}>{device.name}</Text>
        <Text style={styles.rssi}>
          {device.rssi != null ? `${device.rssi} dBm` : '—'}
        </Text>
      </View>
      {connected ? (
        <View style={styles.connectedBadge}>
          <Text style={styles.connectedText}>Connected</Text>
        </View>
      ) : (
        <View style={styles.connectBtn}>
          <Text style={styles.connectText}>Connect</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  rssi: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 2,
  },
  connectBtn: {
    backgroundColor: '#0A84FF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  connectedBadge: {
    backgroundColor: '#0A3A1A',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectedText: {
    color: '#30D158',
    fontSize: 14,
    fontWeight: '600',
  },
});
