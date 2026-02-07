import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

interface MetricTileProps {
  label: string;
  value: string;
  unit: string;
  warning?: boolean;
}

export function MetricTile({label, value, unit, warning}: MetricTileProps) {
  return (
    <View style={[styles.tile, warning && styles.tileWarning]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    width: '48%',
    marginBottom: 10,
  },
  tileWarning: {
    borderColor: '#FF453A',
    borderWidth: 2,
  },
  label: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  value: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 4,
  },
  unit: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 2,
  },
});
