import React, {createContext, useContext, useEffect} from 'react';
import {useBLE} from './useBLE';

type BLEContextType = ReturnType<typeof useBLE>;

const BLEContext = createContext<BLEContextType | null>(null);

export function BLEProvider({children}: {children: React.ReactNode}) {
  const ble = useBLE();

  useEffect(() => {
    ble.loadAssignments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <BLEContext.Provider value={ble}>{children}</BLEContext.Provider>;
}

export function useBLEContext(): BLEContextType {
  const context = useContext(BLEContext);
  if (!context) {
    throw new Error('useBLEContext must be used within a BLEProvider');
  }
  return context;
}
