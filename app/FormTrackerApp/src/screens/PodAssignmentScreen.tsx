import React, {useEffect, useCallback} from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useBLEContext} from '../ble/BLEContext';
import {
  ALL_BODY_LOCATIONS,
  BODY_LOCATION_LABELS,
} from '../ble/types';
import type {BodyLocation, PodAssignment} from '../ble/types';
import type {RootStackParamList} from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'PodAssignment'>;

export function PodAssignmentScreen({navigation}: Props) {
  const {state, assignPodLocation, saveAssignments, setSelectedPod} =
    useBLEContext();
  const {pods, savedAssignments} = state;

  const podList = Object.values(pods);

  // Pre-fill from saved assignments on mount
  useEffect(() => {
    for (const saved of savedAssignments) {
      if (pods[saved.deviceId]) {
        assignPodLocation(saved.deviceId, saved.bodyLocation);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAssign = useCallback(
    (deviceId: string, location: BodyLocation) => {
      // Clear conflict: if another pod has this location, unset it
      for (const pod of podList) {
        if (pod.deviceId !== deviceId && pod.bodyLocation === location) {
          assignPodLocation(pod.deviceId, null);
        }
      }
      // Toggle: if same location, clear; otherwise assign
      const currentPod = pods[deviceId];
      if (currentPod?.bodyLocation === location) {
        assignPodLocation(deviceId, null);
      } else {
        assignPodLocation(deviceId, location);
      }
    },
    [podList, pods, assignPodLocation],
  );

  const allAssigned = podList.length > 0 && podList.every(p => p.bodyLocation != null);

  const handleStartSession = useCallback(async () => {
    // Save assignments
    const assignments: PodAssignment[] = podList
      .filter(p => p.bodyLocation != null)
      .map(p => ({
        deviceId: p.deviceId,
        deviceName: p.deviceName,
        bodyLocation: p.bodyLocation!,
      }));
    await saveAssignments(assignments);

    // Select first pod
    if (podList.length > 0) {
      setSelectedPod(podList[0].deviceId);
    }
    navigation.navigate('Metrics');
  }, [podList, saveAssignments, setSelectedPod, navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Assign Pods</Text>
      <Text style={styles.subtitle}>
        Assign each pod to a body location
      </Text>

      <FlatList
        data={podList}
        keyExtractor={item => item.deviceId}
        renderItem={({item}) => (
          <View style={styles.podCard}>
            <View style={styles.podHeader}>
              <View style={styles.podInfo}>
                <View
                  style={[
                    styles.connectionDot,
                    {
                      backgroundColor:
                        item.connectionState === 'connected'
                          ? '#30D158'
                          : '#FF453A',
                    },
                  ]}
                />
                <Text style={styles.podName}>{item.deviceName}</Text>
              </View>
              {item.timeSynced && (
                <View style={styles.syncBadge}>
                  <Text style={styles.syncText}>Synced</Text>
                </View>
              )}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.locationRow}>
              {ALL_BODY_LOCATIONS.map(loc => {
                const isSelected = item.bodyLocation === loc;
                const isConflict =
                  !isSelected &&
                  podList.some(
                    p => p.deviceId !== item.deviceId && p.bodyLocation === loc,
                  );
                return (
                  <TouchableOpacity
                    key={loc}
                    style={[
                      styles.locationPill,
                      isSelected && styles.locationPillSelected,
                      isConflict && styles.locationPillConflict,
                    ]}
                    onPress={() => handleAssign(item.deviceId, loc)}
                    activeOpacity={0.7}>
                    <Text
                      style={[
                        styles.locationPillText,
                        isSelected && styles.locationPillTextSelected,
                      ]}>
                      {BODY_LOCATION_LABELS[loc]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      <TouchableOpacity
        style={[styles.startBtn, !allAssigned && styles.startBtnDisabled]}
        onPress={handleStartSession}
        disabled={!allAssigned}
        activeOpacity={0.7}>
        <Text style={styles.startBtnText}>Start Session</Text>
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  podCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  podHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  podInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  podName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  syncBadge: {
    backgroundColor: '#0A3A1A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  syncText: {
    color: '#30D158',
    fontSize: 11,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
  },
  locationPill: {
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  locationPillSelected: {
    backgroundColor: '#0A84FF',
  },
  locationPillConflict: {
    opacity: 0.4,
  },
  locationPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  locationPillTextSelected: {
    fontWeight: '700',
  },
  startBtn: {
    backgroundColor: '#30D158',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 40,
  },
  startBtnDisabled: {
    opacity: 0.4,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
