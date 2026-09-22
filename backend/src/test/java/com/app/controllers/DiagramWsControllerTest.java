package com.app.controllers;

import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.dto.DiagramResponse;
import com.app.dto.ws.PresencePayload;
import com.app.dto.ws.PresenceRole;
import com.app.dto.ws.WsDiagramEvent;
import com.app.dto.ws.WsEventType;
import com.app.services.DiagramService;
import com.app.services.DiagramSessionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DiagramWsControllerTest {

    private DiagramSessionService sessionService;
    private DiagramService diagramService;
    private SimpMessagingTemplate messagingTemplate;
    private DiagramWsController controller;

    @BeforeEach
    void setUp() {
        sessionService = mock(DiagramSessionService.class);
        diagramService = mock(DiagramService.class);
        messagingTemplate = mock(SimpMessagingTemplate.class);
        controller = new DiagramWsController(sessionService, diagramService, messagingTemplate);
    }

    @Test
    @DisplayName("Al unirse a un diagrama, debe registrar presencia, emitir USER_JOINED y retornar DIAGRAM_SNAPSHOT con el modelo completo")
    void testJoinDiagram() {
        Long diagramId = 42L;
        String sessionId = "sess-xyz";
        String userId = "user-123";
        String username = "Carlos";

        PresencePayload joinRequest = PresencePayload.builder()
                .userId(userId)
                .username(username)
                .build();

        PresencePayload registeredPresence = PresencePayload.builder()
                .userId(userId)
                .username(username)
                .role(PresenceRole.HOST)
                .build();

        when(sessionService.addUser(diagramId, sessionId, userId, username))
                .thenReturn(registeredPresence);

        DiagramResponse response = new DiagramResponse();
        response.setId(diagramId);
        response.setName("Diagrama Inicial");
        ClassModel cliente = new ClassModel();
        cliente.setName("Cliente");
        response.setClasses(List.of(cliente));

        when(diagramService.findById(diagramId)).thenReturn(response);

        SimpMessageHeaderAccessor headerAccessor = SimpMessageHeaderAccessor.create();
        headerAccessor.setSessionId(sessionId);

        // Ejecutar endpoint join
        WsDiagramEvent<DiagramModel> snapshotEvent = controller.joinDiagram(diagramId, joinRequest, headerAccessor);

        // Validar registro en servicio de sesiones
        verify(sessionService).addUser(diagramId, sessionId, userId, username);

        // Validar difusión de USER_JOINED al tópico
        ArgumentCaptor<WsDiagramEvent<PresencePayload>> eventCaptor = ArgumentCaptor.forClass(WsDiagramEvent.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/diagrams/42"), eventCaptor.capture());

        WsDiagramEvent<PresencePayload> capturedEvent = eventCaptor.getValue();
        assertEquals(WsEventType.USER_JOINED, capturedEvent.getEventType());
        assertEquals(diagramId, capturedEvent.getDiagramId());
        assertEquals(userId, capturedEvent.getSenderId());
        assertEquals(PresenceRole.HOST, capturedEvent.getPayload().getRole());

        // Validar retorno del snapshot para no tener lienzo en blanco
        assertNotNull(snapshotEvent);
        assertEquals(WsEventType.DIAGRAM_SNAPSHOT, snapshotEvent.getEventType());
        assertEquals(diagramId, snapshotEvent.getDiagramId());
        assertNotNull(snapshotEvent.getPayload());
        assertEquals(1, snapshotEvent.getPayload().getClasses().size());
        assertEquals("Cliente", snapshotEvent.getPayload().getClasses().get(0).getName());
    }
}
