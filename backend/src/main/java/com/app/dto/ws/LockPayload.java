package com.app.dto.ws;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Payload para eventos de control de concurrencia y bloqueo de elementos (LOCK_ACQUIRED, etc.).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LockPayload {

    private String elementId;
    private LockElementType elementType;
    private String lockedByUserId;
    private String lockedByUsername;
    private boolean locked;
}
