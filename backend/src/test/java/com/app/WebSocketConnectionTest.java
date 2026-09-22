package com.app;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSocketConnectionTest {

    @LocalServerPort
    private int port;

    private WebSocketStompClient stompClient;

    @BeforeEach
    void setUp() {
        stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());
    }

    @Test
    @DisplayName("Debe conectar exitosamente a /ws y suscribirse a /topic/diagrams/1")
    void testConnectionAndSubscription() throws Exception {
        String wsUrl = String.format("ws://localhost:%d/ws", port);

        CompletableFuture<StompSession> connectFuture = stompClient.connectAsync(
                wsUrl,
                new StompSessionHandlerAdapter() {}
        );

        StompSession session = connectFuture.get(10, TimeUnit.SECONDS);

        assertNotNull(session, "La sesión STOMP no debe ser nula");
        assertTrue(session.isConnected(), "La sesión STOMP debe encontrarse activa y conectada");

        // Validar suscripción al tópico del diagrama 1
        StompSession.Subscription subscription = session.subscribe("/topic/diagrams/1", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return String.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                // Manejador del frame recibido
            }
        });

        assertNotNull(subscription, "La suscripción no debe ser nula");
        assertNotNull(subscription.getSubscriptionId(), "El identificador de suscripción debe existir");

        session.disconnect();
    }
}
