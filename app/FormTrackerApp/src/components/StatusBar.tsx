import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {ConnectionState} from '../ble/types';

interface StatusBarProps {
  connectionState: ConnectionState;
  deviceName: string | null;
  batteryLevel: number | null;
}

const STATE_COLORS: Record<ConnectionState, string> = {
  connected: '#30D158',
  connecting: '#FFD60A',
  reconnecting: '#FFD60A',
  scanning: '#FFD60A',
  disconnected: '#FF453A',
};

const STATE_LABELS: Record<ConnectionState, string> = {
  connected: 'Connected',
  connecting: 'Connecting...',
  reconnecting: 'Reconnecting...',
  scanning: 'Scanning...',
  disconnected: 'Disconnected',
};

export function StatusBar({
  connectionState,
  deviceName,
  batteryLevel,
}: StatusBarProps) {
  const dotColor = STATE_COLORS[connectionState];

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={[styles.dot, {backgroundColor: dotColor}]} />
        <Text style={styles.statusText}>
          {deviceName ?? STATE_LABELS[connectionState]}
        </Text>
      </View>
      {batteryLevel != null && (
        <View style={styles.battery}>
          <View style={styles.batteryOutline}>
            <View
              style={[
                styles.batteryFill,
                {
                  width: `${Math.min(batteryLevel, 100)}%`,
                  backgroundColor: batteryLevel <= 15 ? '#FF453A' : '#30D158',
                },
              ]}
            />
          </View>
          <Text style={styles.batteryText}>{batteryLevel}%</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  battery: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryOutline: {
    width: 28,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#8E8E93',
    overflow: 'hidden',
    marginRight: 4,
  },
  batteryFill: {
    height: '100%',
    borderRadius: 2,
  },
  batteryText: {
    color: '#8E8E93',
    fontSize: 12,
  },
});
