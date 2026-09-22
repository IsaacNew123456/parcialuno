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

    /**
     * Tipo/rubro del negocio que el usuario desea modelar.
     * Ejemplos: "farmacia", "restaurante", "transporte", "contabilidad", "clínica", "e-commerce".
     * Tiene prioridad sobre domainContext.
     */
    private String businessType;

    /**
     * Contexto adicional de dominio (mantiene compatibilidad con clientes anteriores).
     * Se usa como fallback si businessType no viene informado.
     * Ej: "contabilidad", "inventarios", "transacciones", "facturacion".
     */
    private String domainContext;

    /**
     * Retorna el rubro efectivo: prioriza businessType, luego domainContext.
     * Si ninguno está presente devuelve null (el servicio aplicará el prompt genérico).
     */
    public String effectiveBusinessType() {
        if (businessType != null && !businessType.isBlank()) return businessType.trim();
        if (domainContext != null && !domainContext.isBlank()) return domainContext.trim();
        return null;
    }
}
