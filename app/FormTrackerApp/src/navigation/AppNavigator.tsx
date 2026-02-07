import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ScanScreen} from '../screens/ScanScreen';
import {MetricsScreen} from '../screens/MetricsScreen';

export type RootStackParamList = {
  Scan: undefined;
  Metrics: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Scan"
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: '#000000'},
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="Scan" component={ScanScreen} />
      <Stack.Screen name="Metrics" component={MetricsScreen} />
    </Stack.Navigator>
  );
}
