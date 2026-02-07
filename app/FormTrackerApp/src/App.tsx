import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {BLEProvider} from './ble/BLEContext';
import {AppNavigator} from './navigation/AppNavigator';

export default function App() {
  return (
    <BLEProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </BLEProvider>
  );
}
