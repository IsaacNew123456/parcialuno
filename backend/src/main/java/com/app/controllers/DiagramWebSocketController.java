package com.app.controllers;

import com.app.dto.DiagramSyncEvent;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * Controlador de WebSockets para recibir y retransmitir eventos de modelado colaborativo en tiempo real.
 */
@Controller
public class DiagramWebSocketController {

    private final SimpMessagingTemplate messagingTemplate;

    public DiagramWebSocketController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Recibe eventos generales en /app/diagram.update y los retransmite a /topic/diagram/{id} o /topic/diagram/global.
     */
    @MessageMapping("/diagram.update")
    public void handleDiagramUpdate(@Payload DiagramSyncEvent event) {
        if (event.getTimestamp() == null) {
            event.setTimestamp(System.currentTimeMillis());
        }

        String targetTopic = (event.getDiagramId() != null && !event.getDiagramId().isBlank())
                ? "/topic/diagram/" + event.getDiagramId()
                : "/topic/diagram/global";

        // Retransmite a todos los clientes suscritos al topic del diagrama
        messagingTemplate.convertAndSend(targetTopic, event);
        // También retransmite al topic global si se actualiza un diagrama específico
        if (!targetTopic.endsWith("/global")) {
            messagingTemplate.convertAndSend("/topic/diagram/global", event);
        }
    }

    /**
     * Recibe eventos dirigidos a un ID específico en /app/diagram/{id}/update y los retransmite a /topic/diagram/{id}.
     */
    @MessageMapping("/diagram/{id}/update")
    public void handleDiagramUpdateById(@DestinationVariable String id, @Payload DiagramSyncEvent event) {
        if (event.getTimestamp() == null) {
            event.setTimestamp(System.currentTimeMillis());
        }
        event.setDiagramId(id);
        messagingTemplate.convertAndSend("/topic/diagram/" + id, event);
        messagingTemplate.convertAndSend("/topic/diagram/global", event);
    }
}
