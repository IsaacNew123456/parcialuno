import './src/utils/polyfills';
import React, { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  // Controla si el usuario ya pasó la pantalla de login.
  // false → mostrar LoginScreen  |  true → mostrar HomeScreen
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {isAuthenticated
        ? <HomeScreen onLogout={() => setIsAuthenticated(false)} />
        : <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />
      }
    </GestureHandlerRootView>
  );
}
