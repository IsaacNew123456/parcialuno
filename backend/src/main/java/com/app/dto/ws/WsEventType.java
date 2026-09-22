package com.app.dto.ws;

/**
 * Tipos de eventos para la sincronización colaborativa vía WebSockets.
 */
public enum WsEventType {
    USER_JOINED,
    USER_LEFT,
    HOST_CHANGED,
    DIAGRAM_SNAPSHOT,
    CLASS_MUTATED,
    LOCK_ACQUIRED,
    LOCK_RELEASED,
    LOCK_REJECTED,
    ERROR,

    // Eventos atómicos de mutación del modelador UML
    CLASS_CREATED,
    CLASS_MOVED,
    CLASS_UPDATED,
    CLASS_DELETED,
    ATTR_ADDED,
    ATTR_UPDATED,
    ATTR_REMOVED,
    RELATION_CREATED,
    RELATION_DELETED
}
