import { StatusBar } from 'expo-status-bar';
import React from 'react';

// The de-risking spike owns the screen. The earlier port attempt is untouched in ./src/Root.
import SpikeScreen from './src/spike/SpikeScreen';

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <SpikeScreen />
    </>
  );
}
