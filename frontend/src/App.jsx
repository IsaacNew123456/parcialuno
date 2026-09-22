import { useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import UmlCanvas from './components/UmlCanvas.jsx';
import LandingPage from './components/LandingPage.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { initWebSocket, disconnectWebSocket } from './services/websocketService.js';
import wsClient from './services/wsClient.js';

import { joinRoom } from './services/api.js';
import useUmlStore from './store/useUmlStore.js';

function MainContent() {
  const { user } = useAuth();
  const setActiveRoom = useUmlStore((s) => s.setActiveRoom);

  useEffect(() => {
    if (user) {
      initWebSocket();
      const userInfo = {
        userId: String(user.id || user.username || 'usr-local'),
        username: user.name || user.username || 'Colaborador',
      };

      // Unirse a la sala por defecto 1234
      joinRoom('1234')
        .then((room) => {
          setActiveRoom(room, false);
          wsClient.connect(room.diagramId || room.id, userInfo);
        })
        .catch(() => {
          wsClient.connect(1, userInfo);
        });

      return () => {
        disconnectWebSocket();
        wsClient.disconnect();
      };
    }
  }, [user, setActiveRoom]);

  if (!user) {
    return <LandingPage />;
  }

  return (
    <div className="app-layout">
      <Navbar />
      <Sidebar />
      <UmlCanvas />
    </div>
  );
}

/**
 * App — Raíz de la aplicación con proveedores de Toast y Autenticación.
 */
export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainContent />
      </AuthProvider>
    </ToastProvider>
  );
}
