package com.app.listener;

import com.app.dto.ws.PresencePayload;
import com.app.dto.ws.WsDiagramEvent;
import com.app.dto.ws.WsEventType;
import com.app.services.DiagramSessionService;
import com.app.services.DiagramSessionService.UserLeaveResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Listener del ciclo de vida WebSocket para monitorizar conexiones, suscripciones y desconexiones STOMP.
 * Garantiza la coherencia del estado de presencia y roles en las salas colaborativas.
 */
@Component
public class WebSocketEventListener {

    private static final Logger log = LoggerFactory.getLogger(WebSocketEventListener.class);
    private static final Pattern DIAGRAM_TOPIC_PATTERN = Pattern.compile("^/topic/diagrams/(\\d+)$");

    private final SimpMessagingTemplate messagingTemplate;
    private final DiagramSessionService sessionService;

    public WebSocketEventListener(SimpMessagingTemplate messagingTemplate, DiagramSessionService sessionService) {
        this.messagingTemplate = messagingTemplate;
        this.sessionService = sessionService;
    }

    @EventListener
    public void handleSessionConnected(SessionConnectedEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        log.info("[WS_LIFECYCLE] event=CONNECTED sessionId={}", accessor.getSessionId());
    }

    @EventListener
    public void handleSessionSubscribe(SessionSubscribeEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String destination = accessor.getDestination();
        String sessionId = accessor.getSessionId();

        if (destination == null || sessionId == null) {
            return;
        }

        Matcher matcher = DIAGRAM_TOPIC_PATTERN.matcher(destination);
        if (matcher.matches()) {
            Long diagramId = Long.parseLong(matcher.group(1));

            // Si los headers nativos contienen info del usuario (userId, username), registrar ingreso automático
            String userId = accessor.getFirstNativeHeader("userId");
            if (userId == null) {
                userId = accessor.getFirstNativeHeader("user-id");
            }

            if (userId != null && !userId.isBlank()) {
                String username = accessor.getFirstNativeHeader("username");
                PresencePayload presence = sessionService.addUser(diagramId, sessionId, userId, username);

                WsDiagramEvent<PresencePayload> joinEvent = WsDiagramEvent.of(
                        WsEventType.USER_JOINED,
                        diagramId,
                        userId,
                        presence
                );

                messagingTemplate.convertAndSend(destination, joinEvent);
                log.info("[WS_LIFECYCLE] event=AUTO_USER_JOINED diagramId={} userId={} role={}",
                        diagramId, userId, presence.getRole());
            } else {
                log.debug("[WS_LIFECYCLE] event=SUBSCRIBED destination={} sessionId={}", destination, sessionId);
            }
        }
    }

    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();

        log.info("[WS_LIFECYCLE] event=DISCONNECTING sessionId={}", sessionId);

        sessionService.removeUserBySessionId(sessionId).ifPresent(this::publishLeaveAndHostTransfer);
    }

    private void publishLeaveAndHostTransfer(UserLeaveResult result) {
        Long diagramId = result.getDiagramId();
        String targetTopic = "/topic/diagrams/" + diagramId;

        // 1. Notificar la salida del usuario (USER_LEFT)
        WsDiagramEvent<PresencePayload> leaveEvent = WsDiagramEvent.of(
                WsEventType.USER_LEFT,
                diagramId,
                result.getLeftUser().getUserId(),
                result.getLeftUser()
        );
        messagingTemplate.convertAndSend(targetTopic, leaveEvent);

        log.info("[WS_LIFECYCLE] dispatched=USER_LEFT diagramId={} userId={}",
                diagramId, result.getLeftUser().getUserId());

        // 2. Notificar cambio de HOST si ocurrió una transferencia
        if (result.getNewHost() != null) {
            WsDiagramEvent<PresencePayload> hostChangedEvent = WsDiagramEvent.of(
                    WsEventType.HOST_CHANGED,
                    diagramId,
                    "SYSTEM",
                    result.getNewHost()
            );
            messagingTemplate.convertAndSend(targetTopic, hostChangedEvent);

            log.info("[WS_LIFECYCLE] dispatched=HOST_CHANGED diagramId={} newHostUserId={}",
                    diagramId, result.getNewHost().getUserId());
        }

        // 3. Notificar liberación de bloqueos retenidos por el usuario desconectado
        if (result.getReleasedLocks() != null && !result.getReleasedLocks().isEmpty()) {
            for (com.app.dto.ws.LockPayload lock : result.getReleasedLocks()) {
                WsDiagramEvent<com.app.dto.ws.LockPayload> lockEvent = WsDiagramEvent.of(
                        WsEventType.LOCK_RELEASED,
                        diagramId,
                        "SYSTEM",
                        lock
                );
                messagingTemplate.convertAndSend(targetTopic, lockEvent);
                log.info("[WS_LIFECYCLE] dispatched=LOCK_RELEASED diagramId={} elementId={}",
                        diagramId, lock.getElementId());
            }
        }
    }
}
