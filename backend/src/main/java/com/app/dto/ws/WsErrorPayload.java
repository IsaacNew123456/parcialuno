package com.app.dto.ws;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Payload para notificación de errores a través de WebSockets (ERROR).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WsErrorPayload {

    private String errorCode;
    private String message;
}
