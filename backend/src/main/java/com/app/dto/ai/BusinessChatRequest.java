package com.app.dto.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusinessChatRequest {
    private String message;
    @Builder.Default
    private List<ChatMessageDto> history = new ArrayList<>();
    private String domainContext; // ej. "contabilidad", "inventarios", "transacciones", "facturacion"
}
