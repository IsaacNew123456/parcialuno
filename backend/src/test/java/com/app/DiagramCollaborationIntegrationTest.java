package com.app;

import com.app.dto.DiagramSaveRequest;
import com.app.dto.ws.PresencePayload;
import com.app.dto.ws.PresenceRole;
import com.app.dto.ws.WsDiagramEvent;
import com.app.dto.ws.WsEventType;
import com.app.services.DiagramService;
import com.app.services.DiagramSessionService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DiagramCollaborationIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private DiagramSessionService sessionService;

    @Autowired
    private DiagramService diagramService;

    @Autowired
    private ObjectMapper objectMapper;

    private Long testDiagramId;

    @BeforeEach
    void setUp() {
        sessionService.clearAll();

        // Crear o persistir diagrama de prueba para el snapshot
        DiagramSaveRequest request = new DiagramSaveRequest();
        request.setName("Collab Test Diagram");
        request.setContentJson("{\"name\":\"Collab Test Diagram\",\"classes\":[],\"relations\":[]}");
        testDiagramId = diagramService.save(request).getId();
    }

    private WebSocketStompClient createStompClient() {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        client.setMessageConverter(new MappingJackson2MessageConverter());
        return client;
    }

    @Test
    @DisplayName("Integración completa: 2 usuarios STOMP se unen, validan HOST y COLLABORATOR, y transferencia de HOST en desconexión")
    void testEndToEndTwoUsersJoinAndHostTransfer() throws Exception {
        String wsUrl = String.format("ws://localhost:%d/ws", port);
        String topic = "/topic/diagrams/" + testDiagramId;

        BlockingQueue<String> client2ReceivedEvents = new LinkedBlockingQueue<>();

        // 1. Conectar Usuario 1
        WebSocketStompClient client1 = createStompClient();
        CompletableFuture<StompSession> sessionFuture1 = client1.connectAsync(wsUrl, new StompSessionHandlerAdapter() {});
        StompSession stompSession1 = sessionFuture1.get(5, TimeUnit.SECONDS);
        assertTrue(stompSession1.isConnected());

        // Usuario 1 envía join
        PresencePayload joinUser1 = PresencePayload.builder()
                .userId("usr-1")
                .username("Alice Host")
                .build();
        stompSession1.send("/app/diagrams/" + testDiagramId + "/join", joinUser1);

        // Esperar a que DiagramSessionService procese el ingreso de Usuario 1
        Thread.sleep(200);
        assertEquals(1, sessionService.getUserCount(testDiagramId));
        assertEquals(PresenceRole.HOST, sessionService.getHost(testDiagramId).get().getRole());
        assertEquals("usr-1", sessionService.getHost(testDiagramId).get().getUserId());

        // 2. Conectar Usuario 2
        WebSocketStompClient client2 = createStompClient();
        CompletableFuture<StompSession> sessionFuture2 = client2.connectAsync(wsUrl, new StompSessionHandlerAdapter() {});
        StompSession stompSession2 = sessionFuture2.get(5, TimeUnit.SECONDS);
        assertTrue(stompSession2.isConnected());

        // Usuario 2 se suscribe al tópico de la sala
        stompSession2.subscribe(topic, new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return byte[].class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                client2ReceivedEvents.offer(new String((byte[]) payload));
            }
        });

        // Usuario 2 envía join
        PresencePayload joinUser2 = PresencePayload.builder()
                .userId("usr-2")
                .username("Bob Collaborator")
                .build();
        stompSession2.send("/app/diagrams/" + testDiagramId + "/join", joinUser2);

        // Esperar procesamiento de Usuario 2
        Thread.sleep(200);
        assertEquals(2, sessionService.getUserCount(testDiagramId));

        // Validar que en DiagramSessionService user-2 es COLLABORATOR
        PresencePayload user2Presence = sessionService.getActiveUsers(testDiagramId).stream()
                .filter(u -> "usr-2".equals(u.getUserId()))
                .findFirst()
                .orElse(null);
        assertNotNull(user2Presence);
        assertEquals(PresenceRole.COLLABORATOR, user2Presence.getRole());

        // 3. Desconectar Usuario 1 (HOST)
        stompSession1.disconnect();

        // Esperar propagación del evento SessionDisconnectEvent
        String receivedPayload = client2ReceivedEvents.poll(5, TimeUnit.SECONDS);
        assertNotNull(receivedPayload, "El usuario 2 debió recibir una notificación tras la desconexión del usuario 1");

        // Esperar a que se ejecute la transferencia de host en DiagramSessionService
        Thread.sleep(300);

        // Validar transferencia en DiagramSessionService
        assertEquals(1, sessionService.getUserCount(testDiagramId));
        PresencePayload newHost = sessionService.getHost(testDiagramId).orElse(null);
        assertNotNull(newHost, "Debe existir un nuevo HOST tras la desconexión de Alice");
        assertEquals("usr-2", newHost.getUserId(), "El rol HOST debe haberse transferido a Bob (usr-2)");
        assertEquals(PresenceRole.HOST, newHost.getRole());

        // Desconectar cliente 2
        stompSession2.disconnect();
    }

    @Test
    @DisplayName("Mutaciones atómicas: CLASS_CREATED, CLASS_MOVED, ATTR_ADDED sincronizan en tiempo real y persisten en BD con versionado")
    void testAtomicMutationsAndPersistence() throws Exception {
        String wsUrl = String.format("ws://localhost:%d/ws", port);
        String topic = "/topic/diagrams/" + testDiagramId;

        WebSocketStompClient client = createStompClient();
        CompletableFuture<StompSession> sessionFuture = client.connectAsync(wsUrl, new StompSessionHandlerAdapter() {});
        StompSession stompSession = sessionFuture.get(5, TimeUnit.SECONDS);
        assertTrue(stompSession.isConnected());

        BlockingQueue<String> receivedEvents = new LinkedBlockingQueue<>();
        stompSession.subscribe(topic, new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return byte[].class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                receivedEvents.offer(new String((byte[]) payload));
            }
        });

        // 1. Enviar CLASS_CREATED
        String classId = "cls_test_101";
        com.fasterxml.jackson.databind.node.ObjectNode classNode = objectMapper.createObjectNode();
        classNode.put("id", classId);
        classNode.put("name", "Pedido");
        classNode.put("x", 120.0);
        classNode.put("y", 240.0);
        classNode.putArray("attrs");

        WsDiagramEvent<com.fasterxml.jackson.databind.JsonNode> createEvent = WsDiagramEvent.of(
                WsEventType.CLASS_CREATED,
                testDiagramId,
                "user-editor-1",
                classNode
        );

        stompSession.send("/app/diagrams/" + testDiagramId + "/mutate", createEvent);

        // Esperar broadcast
        String eventJson = receivedEvents.poll(5, TimeUnit.SECONDS);
        assertNotNull(eventJson, "Debe recibir broadcast de CLASS_CREATED");
        assertTrue(eventJson.contains("CLASS_CREATED"));
        assertTrue(eventJson.contains("Pedido"));

        // Validar persistencia en PostgreSQL
        Thread.sleep(200);
        var persisted1 = diagramService.findById(testDiagramId);
        assertTrue(persisted1.getContentJson().contains("Pedido"));
        assertTrue(persisted1.getVersion() > 0);

        // 2. Enviar CLASS_MOVED
        com.fasterxml.jackson.databind.node.ObjectNode moveNode = objectMapper.createObjectNode();
        moveNode.put("id", classId);
        moveNode.put("x", 450.0);
        moveNode.put("y", 320.0);

        WsDiagramEvent<com.fasterxml.jackson.databind.JsonNode> moveEvent = WsDiagramEvent.of(
                WsEventType.CLASS_MOVED,
                testDiagramId,
                "user-editor-1",
                moveNode
        );

        stompSession.send("/app/diagrams/" + testDiagramId + "/mutate", moveEvent);

        String moveJson = receivedEvents.poll(5, TimeUnit.SECONDS);
        assertNotNull(moveJson);
        assertTrue(moveJson.contains("CLASS_MOVED"));
        assertTrue(moveJson.contains("450"));

        Thread.sleep(200);
        var persisted2 = diagramService.findById(testDiagramId);
        assertTrue(persisted2.getContentJson().contains("450"));
        assertTrue(persisted2.getVersion() > persisted1.getVersion());

        // 3. Enviar ATTR_ADDED
        com.fasterxml.jackson.databind.node.ObjectNode attrEventNode = objectMapper.createObjectNode();
        attrEventNode.put("classId", classId);
        com.fasterxml.jackson.databind.node.ObjectNode attrNode = attrEventNode.putObject("attr");
        attrNode.put("name", "total");
        attrNode.put("type", "Double");

        WsDiagramEvent<com.fasterxml.jackson.databind.JsonNode> attrEvent = WsDiagramEvent.of(
                WsEventType.ATTR_ADDED,
                testDiagramId,
                "user-editor-1",
                attrEventNode
        );

        stompSession.send("/app/diagrams/" + testDiagramId + "/mutate", attrEvent);

        String attrJson = receivedEvents.poll(5, TimeUnit.SECONDS);
        assertNotNull(attrJson);
        assertTrue(attrJson.contains("ATTR_ADDED"));
        assertTrue(attrJson.contains("total"));

        Thread.sleep(200);
        var persisted3 = diagramService.findById(testDiagramId);
        assertTrue(persisted3.getContentJson().contains("total"));
        assertTrue(persisted3.getVersion() > persisted2.getVersion());

        stompSession.disconnect();
    }
}
