package com.app.controllers;

import com.app.dto.DiagramModel;
import com.app.dto.DiagramResponse;
import com.app.dto.ws.PresencePayload;
import com.app.dto.ws.WsDiagramEvent;
import com.app.dto.ws.WsEventType;
import com.app.services.DiagramService;
import com.app.services.DiagramSessionService;
import com.app.services.RoomService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;

import java.util.Optional;

/**
 * Controlador STOMP para la gestión de unión a salas, presencia y despacho
 * del snapshot consolidado del diagrama UML.
 */
@Controller
public class DiagramWsController {

    private static final Logger log = LoggerFactory.getLogger(DiagramWsController.class);

    private final DiagramSessionService sessionService;
    private final DiagramService diagramService;
    private final SimpMessagingTemplate messagingTemplate;
    private final RoomService roomService;

    public DiagramWsController(DiagramSessionService sessionService,
                               DiagramService diagramService,
                               SimpMessagingTemplate messagingTemplate) {
        this(sessionService, diagramService, messagingTemplate, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public DiagramWsController(DiagramSessionService sessionService,
                               DiagramService diagramService,
                               SimpMessagingTemplate messagingTemplate,
                               @org.springframework.beans.factory.annotation.Autowired(required = false) RoomService roomService) {
        this.sessionService = sessionService;
        this.diagramService = diagramService;
        this.messagingTemplate = messagingTemplate;
        this.roomService = roomService;
    }

    private Long resolveActualDiagramId(Long id) {
        if (roomService != null && id != null) {
            return roomService.resolveDiagramId(id);
        }
        return id;
    }

    private void broadcastToRoom(Long id, Long diagramId, Object payload) {
        messagingTemplate.convertAndSend("/topic/diagrams/" + id, payload);
        messagingTemplate.convertAndSend("/topic/rooms/" + id, payload);
        if (diagramId != null && !diagramId.equals(id)) {
            messagingTemplate.convertAndSend("/topic/diagrams/" + diagramId, payload);
            messagingTemplate.convertAndSend("/topic/rooms/" + diagramId, payload);
        }
    }

    /**
     * Procesa la unión de un usuario a la sala del diagrama:
     * 1. Asigna rol (HOST o COLLABORATOR) en DiagramSessionService.
     * 2. Notifica a todos los miembros de la sala con USER_JOINED en /topic/diagrams/{id}.
     * 3. Retorna el snapshot consolidado al usuario conectado vía /queue/snapshot.
     */
    @MessageMapping({"/diagrams/{id}/join", "/rooms/{id}/join"})
    @SendToUser("/queue/snapshot")
    public WsDiagramEvent<DiagramModel> joinDiagram(
            @DestinationVariable Long id,
            @Payload PresencePayload joinRequest,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        String sessionId = headerAccessor.getSessionId();
        String userId = joinRequest != null && joinRequest.getUserId() != null
                ? joinRequest.getUserId()
                : "user-" + sessionId;
        String username = joinRequest != null && joinRequest.getUsername() != null
                ? joinRequest.getUsername()
                : "Colaborador";

        Long diagramId = resolveActualDiagramId(id);

        log.info("[WS_CONTROLLER] join_request diagramId={} actualDiagramId={} userId={} username={} sessionId={}",
                id, diagramId, userId, username, sessionId);

        // 1. Registrar presencia y obtener rol asignado
        PresencePayload presence = sessionService.addUser(diagramId, sessionId, userId, username);

        // 2. Difundir evento USER_JOINED al tópico de la sala
        WsDiagramEvent<PresencePayload> userJoinedEvent = WsDiagramEvent.of(
                WsEventType.USER_JOINED,
                id,
                userId,
                presence
        );
        broadcastToRoom(id, diagramId, userJoinedEvent);

        // 3. Obtener el DiagramModel consolidado de la base de datos
        DiagramModel snapshotModel;
        try {
            DiagramResponse response = diagramService.findById(diagramId);
            if (response.getContentJson() != null && !response.getContentJson().isBlank()) {
                snapshotModel = diagramService.parseContent(response.getContentJson());
            } else {
                snapshotModel = new DiagramModel();
                snapshotModel.setName(response.getName());
                if (response.getClasses() != null) {
                    snapshotModel.setClasses(response.getClasses());
                }
                if (response.getRelations() != null) {
                    snapshotModel.setRelations(response.getRelations());
                }
            }
        } catch (Exception ex) {
            log.warn("[WS_CONTROLLER] Diagram {} not found, providing empty snapshot: {}", diagramId, ex.getMessage());
            snapshotModel = new DiagramModel();
            snapshotModel.setName("Diagrama " + diagramId);
        }

        // 4. Construir evento DIAGRAM_SNAPSHOT
        WsDiagramEvent<DiagramModel> snapshotEvent = WsDiagramEvent.of(
                WsEventType.DIAGRAM_SNAPSHOT,
                id,
                "SYSTEM",
                snapshotModel
        );

        log.info("[WS_CONTROLLER] dispatched=DIAGRAM_SNAPSHOT diagramId={} userId={} classesCount={}",
                id, userId, snapshotModel.getClasses() != null ? snapshotModel.getClasses().size() : 0);

        return snapshotEvent;
    }

    /**
     * Procesa solicitudes de adquisición y liberación de bloqueos sobre elementos del diagrama.
     * Difunde LOCK_ACQUIRED o LOCK_RELEASED al tópico /topic/diagrams/{id},
     * o notifica LOCK_REJECTED a la cola privada del cliente si el elemento ya está bloqueado.
     */
    @MessageMapping({"/diagrams/{id}/lock", "/rooms/{id}/lock"})
    public void handleLockRequest(
            @DestinationVariable Long id,
            @Payload com.app.dto.ws.LockPayload request,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        Long diagramId = resolveActualDiagramId(id);
        String sessionId = headerAccessor.getSessionId();
        String userId = request.getLockedByUserId();
        if (userId == null || userId.isBlank()) {
            userId = "user-" + sessionId;
        }
        String username = request.getLockedByUsername() != null && !request.getLockedByUsername().isBlank()
                ? request.getLockedByUsername()
                : userId;

        log.info("[WS_CONTROLLER] lock_request id={} diagramId={} elementId={} isLocked={} userId={}",
                id, diagramId, request.getElementId(), request.isLocked(), userId);

        if (request.isLocked()) {
            // Intento de adquirir bloqueo
            DiagramSessionService.LockActionResult result = sessionService.acquireLock(
                    diagramId, request.getElementId(), request.getElementType(), userId, username
            );

            if (result.isSuccess()) {
                WsDiagramEvent<com.app.dto.ws.LockPayload> event = WsDiagramEvent.of(
                        WsEventType.LOCK_ACQUIRED,
                        id,
                        userId,
                        result.getPayload()
                );
                broadcastToRoom(id, diagramId, event);
                log.info("[WS_CONTROLLER] broadcast=LOCK_ACQUIRED id={} diagramId={} elementId={} by={}",
                        id, diagramId, request.getElementId(), userId);
            } else {
                WsDiagramEvent<com.app.dto.ws.LockPayload> rejectEvent = WsDiagramEvent.of(
                        WsEventType.LOCK_REJECTED,
                        id,
                        userId,
                        result.getPayload()
                );
                messagingTemplate.convertAndSendToUser(sessionId, "/queue/errors", rejectEvent);
                messagingTemplate.convertAndSendToUser(sessionId, "/queue/lock", rejectEvent);
                log.warn("[WS_CONTROLLER] rejected=LOCK_REJECTED diagramId={} elementId={} reason={}",
                        diagramId, request.getElementId(), result.getFailureReason());
            }
        } else {
            // Intento de liberar bloqueo
            Optional<com.app.dto.ws.LockPayload> releasedOpt = sessionService.releaseLock(diagramId, request.getElementId(), userId);
            if (releasedOpt.isPresent()) {
                WsDiagramEvent<com.app.dto.ws.LockPayload> event = WsDiagramEvent.of(
                        WsEventType.LOCK_RELEASED,
                        id,
                        userId,
                        releasedOpt.get()
                );
                broadcastToRoom(id, diagramId, event);
                log.info("[WS_CONTROLLER] broadcast=LOCK_RELEASED id={} diagramId={} elementId={} by={}",
                        id, diagramId, request.getElementId(), userId);
            }
        }
    }

    /**
     * Procesa mutaciones atómicas granulares del modelador UML:
     * CLASS_CREATED, CLASS_MOVED, CLASS_UPDATED, CLASS_DELETED,
     * ATTR_ADDED, ATTR_UPDATED, ATTR_REMOVED, RELATION_CREATED, RELATION_DELETED.
     *
     * Valida control de concurrencia y persistencia transaccional antes de retransmitir.
     */
    @MessageMapping({"/diagrams/{id}/mutate", "/rooms/{id}/mutate"})
    public void handleDiagramMutation(
            @DestinationVariable Long id,
            @Payload WsDiagramEvent<com.fasterxml.jackson.databind.JsonNode> mutationEvent,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        Long diagramId = resolveActualDiagramId(id);
        String sessionId = headerAccessor.getSessionId();
        String senderId = mutationEvent.getSenderId() != null && !mutationEvent.getSenderId().isBlank()
                ? mutationEvent.getSenderId()
                : "user-" + sessionId;

        com.fasterxml.jackson.databind.JsonNode payload = mutationEvent.getPayload();
        WsEventType type = mutationEvent.getEventType();

        log.info("[WS_CONTROLLER] mutation_received id={} diagramId={} type={} senderId={}", id, diagramId, type, senderId);

        // Validar si el elemento a mutar está bloqueado por otro usuario
        String elementId = null;
        if (payload != null) {
            if (payload.has("id")) {
                elementId = payload.get("id").asText();
            } else if (payload.has("classId")) {
                elementId = payload.get("classId").asText();
            }
        }

        if (elementId != null) {
            final String finalElementId = elementId;
            boolean lockedByOther = sessionService.getActiveLocks(diagramId).stream()
                    .anyMatch(l -> l.isLocked() && finalElementId.equals(l.getElementId()) && !senderId.equals(l.getLockedByUserId()));

            if (lockedByOther) {
                log.warn("[WS_CONTROLLER] mutation_rejected diagramId={} type={} elementId={} blocked_by_other",
                        diagramId, type, elementId);
                WsDiagramEvent<com.app.dto.ws.WsErrorPayload> errorEvent = WsDiagramEvent.of(
                        WsEventType.ERROR,
                        id,
                        senderId,
                        new com.app.dto.ws.WsErrorPayload("CONCURRENT_LOCK_VIOLATION", "El elemento está bloqueado por otro colaborador")
                );
                messagingTemplate.convertAndSendToUser(sessionId, "/queue/errors", errorEvent);
                return;
            }
        }

        // Aplicar la mutación en memoria y persistir en PostgreSQL
        try {
            diagramService.applyAtomicMutation(diagramId, type, payload);
        } catch (Exception ex) {
            log.error("[WS_CONTROLLER] Error persistiendo mutación diagramId={}: {}", diagramId, ex.getMessage());
        }

        // Completar metadatos de sincronización
        mutationEvent.setDiagramId(id);
        mutationEvent.setSenderId(senderId);
        if (mutationEvent.getTimestamp() == null) {
            mutationEvent.setTimestamp(System.currentTimeMillis());
        }

        // Reenviar a la sala para sincronización en tiempo real
        broadcastToRoom(id, diagramId, mutationEvent);

        log.info("[WS_CONTROLLER] mutation_broadcast id={} diagramId={} type={} senderId={}", id, diagramId, type, senderId);
    }
}
