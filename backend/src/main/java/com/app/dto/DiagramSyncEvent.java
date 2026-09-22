package com.app.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * DTO para eventos de sincronización colaborativa en tiempo real sobre WebSockets.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DiagramSyncEvent {

    /**
     * Tipo de evento: CLASS_MOVED, CLASS_ADDED, CLASS_UPDATED, CLASS_DELETED,
     * RELATION_ADDED, RELATION_DELETED, DIAGRAM_LOADED, CANVAS_RESET, FULL_SYNC
     */
    private String eventType;

    /**
     * Identificador del diagrama (o 'global')
     */
    private String diagramId;

    /**
     * Identificador único de la sesión/cliente que origina el cambio (para evitar bucles de eco)
     */
    private String senderId;

    /**
     * Carga útil con los datos específicos del cambio (ej: coordenadas x/y, clase, relación)
     */
    private Object payload;

    /**
     * Marca de tiempo del evento
     */
    private Long timestamp;
}
