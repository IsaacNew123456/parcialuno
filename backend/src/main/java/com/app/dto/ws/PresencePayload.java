package com.app.dto.ws;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Payload para eventos de presencia de usuarios (USER_JOINED, USER_LEFT).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresencePayload {

    private String userId;
    private String username;
    private PresenceRole role;
}
