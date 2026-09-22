import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

/**
 * Cliente STOMP sobre SockJS para sincronización colaborativa en tiempo real,
 * gestión de presencia, snapshots y control de concurrencia mediante bloqueos.
 */
class WebSocketClient {
  constructor() {
    this.stompClient = null;
    this.currentDiagramId = null;
    this.userId = 'user_' + Math.random().toString(36).substring(2, 9);
    this.username = 'Colaborador_' + this.userId.substring(5, 9);
    this.role = 'COLLABORATOR'; // HOST | COLLABORATOR

    // Estado local de bloqueos: elementId -> LockPayload
    this.locks = new Map();

    // Callbacks suscritos
    this.eventListeners = new Set();
    this.lockListeners = new Set();
    this.snapshotListeners = new Set();
    this.presenceListeners = new Set();

    this.topicSubscription = null;
    this.snapshotSubscription = null;
    this.lockSubscription = null;
    this.isConnected = false;
  }

  getEndpointUrl() {
    if (import.meta.env?.VITE_WS_URL) {
      return import.meta.env.VITE_WS_URL;
    }
    const isLocal5173 = typeof window !== 'undefined' && window.location.port === '5173';
    const host = isLocal5173 ? 'localhost:8080' : (typeof window !== 'undefined' ? window.location.host : 'localhost:8080');
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${host}/ws`;
  }

  /**
   * Conecta al broker STOMP vía SockJS, se suscribe a los tópicos de la sala y solicita el snapshot inicial.
   *
   * @param {string|number} diagramId ID del diagrama UML
   * @param {Object} userInfo { userId, username } opcionales
   */
  connect(diagramId, userInfo = {}) {
    if (this.stompClient && this.stompClient.active && this.currentDiagramId === String(diagramId)) {
      return;
    }

    if (userInfo.userId) this.userId = userInfo.userId;
    if (userInfo.username) this.username = userInfo.username;
    this.currentDiagramId = String(diagramId || '1');

    const socketUrl = this.getEndpointUrl();

    this.stompClient = new Client({
      webSocketFactory: () => new SockJS(socketUrl),
      reconnectDelay: 4000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      debug: (msg) => {
        if (import.meta.env?.DEV && false) {
          console.debug('[WS-CLIENT]', msg);
        }
      },
      onConnect: () => {
        this.isConnected = true;
        this.subscribe(this.currentDiagramId);
        this.joinRoom(this.currentDiagramId);
      },
      onDisconnect: () => {
        this.isConnected = false;
        this.notifyPresence({ eventType: 'DISCONNECTED', userId: this.userId });
      },
      onStompError: (frame) => {
        console.error('[WS-CLIENT] STOMP error:', frame.headers['message'], frame.body);
      },
      onWebSocketError: (err) => {
        console.warn('[WS-CLIENT] WebSocket error (resilient reconnect will retry):', err);
      },
    });

    this.stompClient.activate();
  }

  /**
   * Cambia la suscripción activa a una nueva sala/diagrama sin desconectar el socket subyacente.
   */
  switchRoom(newDiagramId) {
    if (!newDiagramId) return;
    this.currentDiagramId = String(newDiagramId);
    if (this.stompClient && this.stompClient.connected) {
      this.subscribe(this.currentDiagramId);
      this.joinRoom(this.currentDiagramId);
    } else {
      this.connect(this.currentDiagramId);
    }
  }

  /**
   * Suscribe a los canales de la sala:
   * 1. /topic/diagrams/{id} (Eventos públicos: USER_JOINED, LOCK_ACQUIRED, LOCK_RELEASED, etc.)
   * 2. /user/queue/snapshot (Snapshot inicial privado del diagrama)
   * 3. /user/queue/lock y /user/queue/errors (Rechazos de lock privados)
   */
  subscribe(diagramId) {
    if (!this.stompClient || !this.stompClient.connected) return;

    // Limpiar suscripciones previas
    if (this.topicSubscription) this.topicSubscription.unsubscribe();
    if (this.snapshotSubscription) this.snapshotSubscription.unsubscribe();
    if (this.lockSubscription) this.lockSubscription.unsubscribe();

    // 1. Tópico público de la sala
    this.topicSubscription = this.stompClient.subscribe(
      `/topic/diagrams/${diagramId}`,
      (message) => {
        try {
          const event = JSON.parse(message.body);
          this.handleIncomingEvent(event);
        } catch (e) {
          console.error('[WS-CLIENT] Error parseando mensaje de /topic:', e);
        }
      }
    );

    // 2. Cola privada para recepción del snapshot inicial
    this.snapshotSubscription = this.stompClient.subscribe(
      '/user/queue/snapshot',
      (message) => {
        try {
          const event = JSON.parse(message.body);
          if (event && (event.eventType === 'DIAGRAM_SNAPSHOT' || event.payload)) {
            this.notifySnapshot(event.payload);
          }
        } catch (e) {
          console.error('[WS-CLIENT] Error parseando snapshot:', e);
        }
      }
    );

    // 3. Cola privada para rechazos de bloqueo (LOCK_REJECTED) o errores
    this.lockSubscription = this.stompClient.subscribe(
      '/user/queue/lock',
      (message) => {
        try {
          const event = JSON.parse(message.body);
          if (event && event.eventType === 'LOCK_REJECTED') {
            this.handleLockRejected(event.payload);
          }
        } catch (e) {
          console.error('[WS-CLIENT] Error parseando /user/queue/lock:', e);
        }
      }
    );
  }

  /**
   * Envía mensaje de unión a /app/diagrams/{id}/join para registrar presencia y disparar el snapshot.
   */
  joinRoom(diagramId) {
    if (!this.stompClient || !this.stompClient.connected) return;

    const payload = {
      userId: this.userId,
      username: this.username,
      role: 'COLLABORATOR',
    };

    this.stompClient.publish({
      destination: `/app/diagrams/${diagramId}/join`,
      body: JSON.stringify(payload),
    });
  }

  /**
   * Solicita el bloqueo granular de un elemento (CLASS, ATTR, RELATION)
   * antes de iniciar la edición.
   */
  requestLock(elementId, elementType = 'CLASS') {
    if (!this.stompClient || !this.stompClient.connected || !this.currentDiagramId) return;

    const payload = {
      elementId: String(elementId),
      elementType,
      lockedByUserId: this.userId,
      lockedByUsername: this.username,
      locked: true,
    };

    this.stompClient.publish({
      destination: `/app/diagrams/${this.currentDiagramId}/lock`,
      body: JSON.stringify(payload),
    });
  }

  /**
   * Libera el bloqueo granular de un elemento al finalizar la edición o hacer onBlur.
   */
  releaseLock(elementId, elementType = 'CLASS') {
    if (!this.stompClient || !this.stompClient.connected || !this.currentDiagramId) return;

    const payload = {
      elementId: String(elementId),
      elementType,
      lockedByUserId: this.userId,
      lockedByUsername: this.username,
      locked: false,
    };

    this.stompClient.publish({
      destination: `/app/diagrams/${this.currentDiagramId}/lock`,
      body: JSON.stringify(payload),
    });
  }

  /**
   * Envía una mutación atómica a /app/diagrams/{id}/mutate
   * (CLASS_CREATED, CLASS_MOVED, CLASS_UPDATED, CLASS_DELETED,
   *  ATTR_ADDED, ATTR_UPDATED, ATTR_REMOVED, RELATION_CREATED, RELATION_DELETED).
   *
   * @param {string} eventType Tipo de mutación atómica
   * @param {Object} payload Datos del elemento mutado
   */
  sendMutation(eventType, payload) {
    if (!this.stompClient || !this.stompClient.connected || !this.currentDiagramId) {
      return;
    }

    const event = {
      eventType,
      diagramId: Number(this.currentDiagramId),
      senderId: this.userId,
      timestamp: Date.now(),
      payload,
    };

    this.stompClient.publish({
      destination: `/app/diagrams/${this.currentDiagramId}/mutate`,
      body: JSON.stringify(event),
    });
  }

  /**
   * Despacha internamente los eventos recibidos desde el backend.
   */
  handleIncomingEvent(event) {
    if (!event || !event.eventType) return;

    switch (event.eventType) {
      case 'USER_JOINED':
        if (event.payload && event.payload.userId === this.userId) {
          this.role = event.payload.role;
        }
        this.notifyPresence(event);
        break;

      case 'USER_LEFT':
        this.notifyPresence(event);
        break;

      case 'HOST_CHANGED':
        if (event.payload && event.payload.userId === this.userId) {
          this.role = 'HOST';
        }
        this.notifyPresence(event);
        break;

      case 'LOCK_ACQUIRED': {
        const lock = event.payload;
        if (lock && lock.elementId) {
          this.locks.set(lock.elementId, lock);
          this.notifyLock(lock, true);
        }
        break;
      }

      case 'LOCK_RELEASED': {
        const lock = event.payload;
        if (lock && lock.elementId) {
          this.locks.delete(lock.elementId);
          this.notifyLock(lock, false);
        }
        break;
      }

      case 'DIAGRAM_SNAPSHOT':
        this.notifySnapshot(event.payload);
        break;

      default:
        break;
    }

    // Notificar a observadores generales
    this.eventListeners.forEach((cb) => {
      try { cb(event); } catch (e) { console.error(e); }
    });
  }

  handleLockRejected(lockPayload) {
    const holder = lockPayload?.lockedByUsername || lockPayload?.lockedByUserId || 'otro usuario';
    console.warn(`[WS-CLIENT] Bloqueo denegado: El elemento está siendo editado por ${holder}`);
    this.notifyLock(lockPayload, false, true); // true = rejected
  }

  // --- Manejo de Suscriptores ---

  onLock(callback) {
    this.lockListeners.add(callback);
    return () => this.lockListeners.delete(callback);
  }

  onSnapshot(callback) {
    this.snapshotListeners.add(callback);
    return () => this.snapshotListeners.delete(callback);
  }

  onPresence(callback) {
    this.presenceListeners.add(callback);
    return () => this.presenceListeners.delete(callback);
  }

  onEvent(callback) {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  notifyLock(lock, isLocked, isRejected = false) {
    this.lockListeners.forEach((cb) => {
      try { cb(lock, isLocked, isRejected); } catch (e) { console.error(e); }
    });
  }

  notifySnapshot(model) {
    this.snapshotListeners.forEach((cb) => {
      try { cb(model); } catch (e) { console.error(e); }
    });
  }

  notifyPresence(event) {
    this.presenceListeners.forEach((cb) => {
      try { cb(event); } catch (e) { console.error(e); }
    });
  }

  isElementLockedByOther(elementId) {
    const lock = this.locks.get(String(elementId));
    if (!lock || !lock.locked) return false;
    return lock.lockedByUserId !== this.userId;
  }

  getLockInfo(elementId) {
    return this.locks.get(String(elementId)) || null;
  }

  disconnect() {
    if (this.stompClient) {
      try {
        this.stompClient.deactivate();
      } catch (e) {
        console.warn(e);
      }
      this.stompClient = null;
    }
    this.locks.clear();
    this.isConnected = false;
  }
}

// Instancia singleton para uso en toda la aplicación
export const wsClient = new WebSocketClient();
export default wsClient;
