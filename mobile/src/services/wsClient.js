/**
 * Cliente STOMP para colaboración en tiempo real en React Native.
 *
 * Usa @stomp/stompjs v6+ con WebSocket nativo de React Native
 * (no SockJS — RN tiene WebSocket global, SockJS no funciona en RN).
 *
 * Protocolo del backend:
 *   SUBSCRIBE  /topic/diagrams/{id}          → eventos de sala (broadcast)
 *   SUBSCRIBE  /user/queue/snapshot          → snapshot inicial (privado)
 *   SUBSCRIBE  /user/queue/errors            → errores (privado)
 *   PUBLISH    /app/diagrams/{id}/join       → unirse a la sala
 *   PUBLISH    /app/diagrams/{id}/mutate     → enviar mutación
 *
 * Evento WsDiagramEvent<T>:
 *   { eventType, diagramId, senderId, timestamp, payload }
 *
 * Tipos de mutación (WsEventType):
 *   CLASS_CREATED, CLASS_MOVED, CLASS_UPDATED, CLASS_DELETED,
 *   ATTR_ADDED, ATTR_UPDATED, ATTR_REMOVED,
 *   RELATION_CREATED, RELATION_DELETED
 */
import '../utils/polyfills';
import { Client } from '@stomp/stompjs';
import { API_BASE_URL } from '../config/api';

// STOMP endpoint — Spring Boot expone /ws como endpoint nativo WebSocket
// React Native no tiene SockJS; usamos el endpoint WS nativo de Spring
const WS_URL = API_BASE_URL.replace(/^http/, 'ws') + '/ws/websocket';

class MobileStomp {
  constructor() {
    this._client = null;
    this._diagramId = null;

    // Unique user identity for this session
    this.userId = 'mob_' + Math.random().toString(36).substring(2, 8);
    this.username = 'Mobile_' + this.userId.slice(-4);

    // Registered callbacks
    this._onSnapshot = null;     // (DiagramModel) => void
    this._onMutation = null;     // (WsDiagramEvent) => void
    this._onPresence = null;     // (PresencePayload) => void
    this._onStatusChange = null; // (connected: boolean) => void

    this._topicSub = null;
    this._snapshotSub = null;
    this._errorSub = null;
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Register event listeners before calling connect().
   * @param {{ onSnapshot, onMutation, onPresence, onStatusChange }} callbacks
   */
  setCallbacks({ onSnapshot, onMutation, onPresence, onStatusChange }) {
    this._onSnapshot = onSnapshot || null;
    this._onMutation = onMutation || null;
    this._onPresence = onPresence || null;
    this._onStatusChange = onStatusChange || null;
  }

  /**
   * Connect to the backend STOMP broker and join the diagram room.
   * @param {string|number} diagramId
   */
  connect(diagramId) {
    if (this._client && this._client.connected) {
      this.switchRoom(diagramId);
      return;
    }

    this._diagramId = String(diagramId);

    this._client = new Client({
      brokerURL: WS_URL,
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,

      onConnect: () => {
        this._onStatusChange?.(true);
        this._subscribeToRoom();
        this._joinRoom();
      },

      onDisconnect: () => {
        this._onStatusChange?.(false);
      },

      onStompError: (frame) => {
        console.warn('[MobileStomp] STOMP error:', frame.headers?.message, frame.body);
      },
    });

    this._client.activate();
  }

  /**
   * Cambia la suscripción a otra sala sin reiniciar la conexión WebSocket si ya está activa.
   */
  switchRoom(newDiagramId) {
    if (!newDiagramId) return;
    this._diagramId = String(newDiagramId);
    if (this._client && this._client.connected) {
      try {
        this._topicSub?.unsubscribe();
        this._snapshotSub?.unsubscribe();
        this._errorSub?.unsubscribe();
      } catch (e) {
        console.warn('[MobileStomp] Error unsubscribing:', e);
      }
      this._subscribeToRoom();
      this._joinRoom();
    } else {
      this.connect(this._diagramId);
    }
  }

  /** Disconnect cleanly. */
  disconnect() {
    this._client?.deactivate();
    this._client = null;
    this._diagramId = null;
  }

  /** Returns true if the client is currently connected. */
  get connected() {
    return this._client?.connected ?? false;
  }

  // ── Mutation publishers ───────────────────────────────────────────

  publishClassCreated(cls) {
    this._publish('CLASS_CREATED', {
      id: cls.id,
      name: cls.name,
      attrs: cls.attrs,
      x: cls.x,
      y: cls.y,
    });
  }

  publishClassMoved(id, x, y) {
    this._publish('CLASS_MOVED', { id, x, y });
  }

  publishClassUpdated(id, patch) {
    this._publish('CLASS_UPDATED', { id, ...patch });
  }

  publishClassDeleted(id) {
    this._publish('CLASS_DELETED', { id });
  }

  publishRelationCreated(relation) {
    this._publish('RELATION_CREATED', relation);
  }

  publishRelationDeleted(id) {
    this._publish('RELATION_DELETED', { id });
  }

  // ── Private ───────────────────────────────────────────────────────

  _subscribeToRoom() {
    const id = this._diagramId;

    // Broadcast topic — all room members receive mutations and presence events
    this._topicSub = this._client.subscribe(
      `/topic/diagrams/${id}`,
      (msg) => this._handleBroadcast(msg)
    );

    // Private snapshot topic — only this client receives the initial state
    this._snapshotSub = this._client.subscribe(
      '/user/queue/snapshot',
      (msg) => {
        const event = this._parse(msg);
        if (event?.payload) {
          this._onSnapshot?.(event.payload);
        }
      }
    );

    // Private error topic
    this._errorSub = this._client.subscribe(
      '/user/queue/errors',
      (msg) => {
        const event = this._parse(msg);
        console.warn('[MobileStomp] Server error:', event?.payload);
      }
    );
  }

  _joinRoom() {
    this._client.publish({
      destination: `/app/diagrams/${this._diagramId}/join`,
      body: JSON.stringify({
        userId: this.userId,
        username: this.username,
      }),
    });
  }

  _publish(eventType, payload) {
    if (!this.connected || !this._diagramId) return;
    this._client.publish({
      destination: `/app/diagrams/${this._diagramId}/mutate`,
      body: JSON.stringify({
        eventType,
        diagramId: Number(this._diagramId),
        senderId: this.userId,
        timestamp: Date.now(),
        payload,
      }),
    });
  }

  _handleBroadcast(msg) {
    const event = this._parse(msg);
    if (!event) return;

    const { eventType, payload, senderId } = event;

    // Skip own mutations — HomeScreen already applied them optimistically
    if (senderId === this.userId) return;

    switch (eventType) {
      case 'USER_JOINED':
      case 'USER_LEFT':
        this._onPresence?.(payload);
        break;
      case 'CLASS_CREATED':
      case 'CLASS_MOVED':
      case 'CLASS_UPDATED':
      case 'CLASS_DELETED':
      case 'ATTR_ADDED':
      case 'ATTR_UPDATED':
      case 'ATTR_REMOVED':
      case 'RELATION_CREATED':
      case 'RELATION_DELETED':
        this._onMutation?.({ eventType, payload, senderId });
        break;
      default:
        break;
    }
  }

  _parse(msg) {
    try {
      return JSON.parse(msg.body);
    } catch {
      return null;
    }
  }
}

// Singleton — one connection per app lifecycle
export default new MobileStomp();
