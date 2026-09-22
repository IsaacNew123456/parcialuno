import { Client } from '@stomp/stompjs';

// ID único para esta pestaña/sesión cliente (evita loops de eco)
export const CLIENT_ID = 'client_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

let stompClient = null;
let currentSubscription = null;
let currentDiagramId = 'global';
const eventListeners = new Set();
const statusListeners = new Set();

let connectionStatus = 'DISCONNECTED'; // 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR'

function notifyStatus(status) {
  connectionStatus = status;
  statusListeners.forEach((fn) => {
    try {
      fn(status);
    } catch (err) {
      console.error('Error in status listener:', err);
    }
  });
}

function getBrokerUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const wsProto = isSecure ? 'wss:' : 'ws:';
  // En desarrollo con Vite en :5173, el backend de Spring Boot corre en 3.14.3.4:8080
  const host = (typeof window !== 'undefined' && window.location.port === '5173')
    ? '3.14.3.4:8080'
    : (typeof window !== 'undefined' ? window.location.host : '3.14.3.4:8080');

  return `${wsProto}//${host}/ws-diagram/websocket`;
}

/**
 * Inicializa y conecta el cliente STOMP sobre WebSocket.
 */
export function initWebSocket(diagramId = 'global') {
  if (stompClient && stompClient.active) {
    subscribeToDiagram(diagramId);
    return;
  }

  currentDiagramId = String(diagramId || 'global');
  notifyStatus('CONNECTING');

  const brokerURL = getBrokerUrl();

  stompClient = new Client({
    brokerURL,
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
    debug: (str) => {
      if (import.meta.env.DEV && false) {
        console.log('[STOMP]', str);
      }
    },
    onConnect: () => {
      notifyStatus('CONNECTED');
      subscribeToDiagram(currentDiagramId);
    },
    onDisconnect: () => {
      notifyStatus('DISCONNECTED');
    },
    onStompError: (frame) => {
      console.warn('STOMP error:', frame.headers['message']);
      notifyStatus('ERROR');
    },
    onWebSocketError: (event) => {
      // Manejo silencioso y resiliente sin romper la UI
      notifyStatus('DISCONNECTED');
    },
    onWebSocketClose: () => {
      notifyStatus('DISCONNECTED');
    },
  });

  try {
    stompClient.activate();
  } catch (e) {
    console.warn('No se pudo activar el cliente STOMP:', e);
    notifyStatus('DISCONNECTED');
  }
}

/**
 * Se suscribe al topic del diagrama actual y al topic global.
 */
export function subscribeToDiagram(diagramId) {
  currentDiagramId = String(diagramId || 'global');

  if (!stompClient || !stompClient.connected) {
    return;
  }

  if (currentSubscription) {
    try {
      currentSubscription.unsubscribe();
    } catch {
      // ignore
    }
  }

  const topic = currentDiagramId && currentDiagramId !== 'global'
    ? `/topic/diagram/${currentDiagramId}`
    : `/topic/diagram/global`;

  currentSubscription = stompClient.subscribe(topic, (message) => {
    try {
      const event = JSON.parse(message.body);
      // Evitar bucle de eco: ignorar eventos emitidos por esta misma pestaña
      if (event && event.senderId !== CLIENT_ID) {
        eventListeners.forEach((fn) => fn(event));
      }
    } catch (err) {
      console.error('Error parseando mensaje WebSocket:', err);
    }
  });

  // También escuchar global si estamos en un diagrama específico
  if (topic !== '/topic/diagram/global') {
    stompClient.subscribe('/topic/diagram/global', (message) => {
      try {
        const event = JSON.parse(message.body);
        if (event && event.senderId !== CLIENT_ID) {
          eventListeners.forEach((fn) => fn(event));
        }
      } catch (err) {
        console.error('Error parseando mensaje WebSocket global:', err);
      }
    });
  }
}

/**
 * Emite un evento de sincronización a través de STOMP a /app/diagram.update.
 */
export function emitDiagramEvent(eventType, payload, diagramId = currentDiagramId) {
  if (!stompClient || !stompClient.connected) {
    // Si no hay conexión STOMP activa, no arroja excepción: la app sigue en modo offline/REST
    return false;
  }

  const syncEvent = {
    eventType,
    diagramId: String(diagramId || 'global'),
    senderId: CLIENT_ID,
    payload,
    timestamp: Date.now(),
  };

  try {
    stompClient.publish({
      destination: '/app/diagram.update',
      body: JSON.stringify(syncEvent),
    });
    return true;
  } catch (err) {
    console.warn('Error al emitir evento WebSocket:', err);
    return false;
  }
}

/**
 * Registra un listener para eventos recibidos desde otros clientes.
 */
export function onDiagramEvent(callback) {
  eventListeners.add(callback);
  return () => eventListeners.delete(callback);
}

/**
 * Registra un listener para cambios en el estado de la conexión WebSocket.
 */
export function onWebSocketStatus(callback) {
  statusListeners.add(callback);
  callback(connectionStatus);
  return () => statusListeners.delete(callback);
}

/**
 * Cierra la conexión WebSocket.
 */
export function disconnectWebSocket() {
  if (stompClient) {
    try {
      stompClient.deactivate();
    } catch {
      // ignore
    }
    stompClient = null;
    currentSubscription = null;
    notifyStatus('DISCONNECTED');
  }
}

export default {
  initWebSocket,
  subscribeToDiagram,
  emitDiagramEvent,
  onDiagramEvent,
  onWebSocketStatus,
  disconnectWebSocket,
  CLIENT_ID,
};
