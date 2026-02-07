import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEY_POD_ASSIGNMENTS} from '../ble/constants';
import type {PodAssignment} from '../ble/types';

export async function savePodAssignments(
  assignments: PodAssignment[],
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEY_POD_ASSIGNMENTS,
    JSON.stringify(assignments),
  );
}

export async function loadPodAssignments(): Promise<PodAssignment[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_POD_ASSIGNMENTS);
  if (!raw) {
    return [];
  }
  return JSON.parse(raw) as PodAssignment[];
}

export async function clearPodAssignments(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY_POD_ASSIGNMENTS);
}
