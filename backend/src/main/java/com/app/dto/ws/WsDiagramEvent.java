package com.app.dto.ws;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Contrato envoltorio genérico para todos los eventos WebSocket emitidos en el entorno colaborativo.
 *
 * @param <T> Tipo del payload específico según el {@link WsEventType}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WsDiagramEvent<T> {

    private WsEventType eventType;
    private Long diagramId;
    private String senderId;
    private Long timestamp;
    private T payload;

    /**
     * Factory helper para instanciar eventos con timestamp automático actual.
     */
    public static <T> WsDiagramEvent<T> of(WsEventType eventType, Long diagramId, String senderId, T payload) {
        return WsDiagramEvent.<T>builder()
                .eventType(eventType)
                .diagramId(diagramId)
                .senderId(senderId)
                .timestamp(Instant.now().toEpochMilli())
                .payload(payload)
                .build();
    }
}
