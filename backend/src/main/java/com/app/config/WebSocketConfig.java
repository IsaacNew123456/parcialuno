package com.app.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * Configuración de WebSockets con STOMP para la colaboración multiusuario
 * en tiempo real de diagramas UML en CaseUmlStudio.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // Habilita un broker simple en memoria para difusión (/topic) y mensajes privados/errores (/queue)
        config.enableSimpleBroker("/topic", "/queue");
        // Prefijo para los mensajes que se dirigen a métodos anotados con @MessageMapping
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Endpoint WebSocket nativo para clientes directos y tests
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*", "http://localhost:5173");

        // Endpoint WebSocket con soporte SockJS y CORS habilitado
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*", "http://localhost:5173")
                .withSockJS();

        // Compatibilidad retroactiva con /ws-diagram si algún componente previo lo requiere
        registry.addEndpoint("/ws-diagram")
                .setAllowedOriginPatterns("*", "http://localhost:5173");

        registry.addEndpoint("/ws-diagram")
                .setAllowedOriginPatterns("*", "http://localhost:5173")
                .withSockJS();
    }
}
