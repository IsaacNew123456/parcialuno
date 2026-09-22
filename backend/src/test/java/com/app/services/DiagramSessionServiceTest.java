package com.app.services;

import com.app.dto.ws.PresencePayload;
import com.app.dto.ws.PresenceRole;
import com.app.services.DiagramSessionService.UserLeaveResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DiagramSessionServiceTest {

    private DiagramSessionService sessionService;

    @BeforeEach
    void setUp() {
        sessionService = new DiagramSessionService();
        sessionService.clearAll();
    }

    @Test
    @DisplayName("Simular conexión de 2 usuarios: primero es HOST, segundo es COLLABORATOR, y transferencia de HOST al desconectar el primero")
    void testTwoUsersConnectionAndHostTransfer() throws InterruptedException {
        Long diagramId = 100L;

        // 1. Primer usuario se une -> debe ser HOST
        PresencePayload user1 = sessionService.addUser(diagramId, "session-1", "user-1", "Alice");
        assertNotNull(user1);
        assertEquals("user-1", user1.getUserId());
        assertEquals("Alice", user1.getUsername());
        assertEquals(PresenceRole.HOST, user1.getRole(), "El primer usuario en ingresar debe ser asignado como HOST");

        // Pequeña pausa para garantizar diferencia medible en joinedAt
        Thread.sleep(10);

        // 2. Segundo usuario se une -> debe ser COLLABORATOR
        PresencePayload user2 = sessionService.addUser(diagramId, "session-2", "user-2", "Bob");
        assertNotNull(user2);
        assertEquals("user-2", user2.getUserId());
        assertEquals("Bob", user2.getUsername());
        assertEquals(PresenceRole.COLLABORATOR, user2.getRole(), "El segundo usuario en ingresar debe ser COLLABORATOR");

        // Verificar lista de usuarios activos
        List<PresencePayload> activeUsers = sessionService.getActiveUsers(diagramId);
        assertEquals(2, activeUsers.size());
        assertEquals(2, sessionService.getUserCount(diagramId));

        // Verificar anfitrión actual
        Optional<PresencePayload> currentHost = sessionService.getHost(diagramId);
        assertTrue(currentHost.isPresent());
        assertEquals("user-1", currentHost.get().getUserId());

        // 3. Desconectar al primer usuario (HOST)
        Optional<UserLeaveResult> leaveResultOpt = sessionService.removeUserBySessionId("session-1");
        assertTrue(leaveResultOpt.isPresent(), "Debe retornar el resultado de la salida del usuario");

        UserLeaveResult leaveResult = leaveResultOpt.get();
        assertEquals("user-1", leaveResult.getLeftUser().getUserId());
        assertFalse(leaveResult.isRoomEmpty(), "La sala no debe estar vacía porque aún permanece user-2");

        // Validar que el rol de HOST fue transferido al segundo usuario (Bob)
        assertNotNull(leaveResult.getNewHost(), "Debe haberse designado un nuevo HOST");
        assertEquals("user-2", leaveResult.getNewHost().getUserId());
        assertEquals(PresenceRole.HOST, leaveResult.getNewHost().getRole(), "El rol asignado debe ser HOST");

        // Validar estado de la sala post-transferencia
        assertEquals(1, sessionService.getUserCount(diagramId));
        Optional<PresencePayload> updatedHost = sessionService.getHost(diagramId);
        assertTrue(updatedHost.isPresent());
        assertEquals("user-2", updatedHost.get().getUserId());
        assertEquals(PresenceRole.HOST, updatedHost.get().getRole());

        // 4. Desconectar al segundo usuario -> la sala debe quedar vacía y limpiarse
        Optional<UserLeaveResult> secondLeaveResultOpt = sessionService.removeUserBySessionId("session-2");
        assertTrue(secondLeaveResultOpt.isPresent());
        assertTrue(secondLeaveResultOpt.get().isRoomEmpty(), "La sala debe reportarse vacía");
        assertEquals(0, sessionService.getUserCount(diagramId), "La estructura en memoria debe haberse limpiado");
    }

    @Test
    @DisplayName("Transferencia de HOST al colaborador más antiguo cuando hay más de dos participantes")
    void testHostTransferToOldestCollaborator() throws InterruptedException {
        Long diagramId = 200L;

        // User 1 ingresa (HOST)
        sessionService.addUser(diagramId, "sess-1", "user-1", "Host 1");
        Thread.sleep(15);

        // User 2 ingresa (Colaborador más antiguo)
        sessionService.addUser(diagramId, "sess-2", "user-2", "Collab Older");
        Thread.sleep(15);

        // User 3 ingresa (Colaborador más reciente)
        sessionService.addUser(diagramId, "sess-3", "user-3", "Collab Newer");

        // User 1 se desconecta
        Optional<UserLeaveResult> result = sessionService.removeUserBySessionId("sess-1");
        assertTrue(result.isPresent());
        assertNotNull(result.get().getNewHost());

        // Debe ser transferido a user-2 por ser el más antiguo
        assertEquals("user-2", result.get().getNewHost().getUserId(),
                "El nuevo host debe ser el colaborador más antiguo en la sala");
    }

    @Test
    @DisplayName("Bloqueo granular: adquisición exitosa, rechazo por colisión concurrente y liberación controlada")
    void testLockAcquisitionAndRejection() {
        Long diagramId = 300L;
        String elementId = "cls_123";

        sessionService.addUser(diagramId, "sess-1", "user-1", "Alice");
        sessionService.addUser(diagramId, "sess-2", "user-2", "Bob");

        // 1. Alice adquiere bloqueo sobre cls_123
        DiagramSessionService.LockActionResult lock1 = sessionService.acquireLock(
                diagramId, elementId, com.app.dto.ws.LockElementType.CLASS, "user-1", "Alice"
        );
        assertTrue(lock1.isSuccess(), "Alice debe adquirir el bloqueo exitosamente");
        assertEquals("user-1", lock1.getPayload().getLockedByUserId());
        assertTrue(lock1.getPayload().isLocked());

        // 2. Bob intenta adquirir el mismo elemento -> Debe ser RECHAZADO
        DiagramSessionService.LockActionResult lock2 = sessionService.acquireLock(
                diagramId, elementId, com.app.dto.ws.LockElementType.CLASS, "user-2", "Bob"
        );
        assertFalse(lock2.isSuccess(), "La solicitud de Bob debe ser rechazada por conflicto");
        assertNotNull(lock2.getFailureReason());
        assertTrue(lock2.getFailureReason().contains("Alice"));

        // 3. Bob intenta liberar el bloqueo de Alice -> Debe denegarse
        Optional<com.app.dto.ws.LockPayload> unauthorizedRelease = sessionService.releaseLock(diagramId, elementId, "user-2");
        assertFalse(unauthorizedRelease.isPresent(), "Un usuario no dueño del bloqueo no puede liberarlo");

        // 4. Alice libera su bloqueo
        Optional<com.app.dto.ws.LockPayload> released = sessionService.releaseLock(diagramId, elementId, "user-1");
        assertTrue(released.isPresent(), "Alice debe poder liberar su propio bloqueo");
        assertFalse(released.get().isLocked());

        // 5. Ahora Bob sí puede adquirir el bloqueo
        DiagramSessionService.LockActionResult lock3 = sessionService.acquireLock(
                diagramId, elementId, com.app.dto.ws.LockElementType.CLASS, "user-2", "Bob"
        );
        assertTrue(lock3.isSuccess(), "Bob debe poder adquirir el bloqueo una vez liberado");
        assertEquals("user-2", lock3.getPayload().getLockedByUserId());
    }

    @Test
    @DisplayName("Liberación automática de bloqueos al desconectarse un usuario")
    void testAutoReleaseLocksOnDisconnect() {
        Long diagramId = 400L;
        sessionService.addUser(diagramId, "sess-alice", "alice-id", "Alice");

        // Alice adquiere 2 bloqueos
        sessionService.acquireLock(diagramId, "cls_1", com.app.dto.ws.LockElementType.CLASS, "alice-id", "Alice");
        sessionService.acquireLock(diagramId, "attr_1", com.app.dto.ws.LockElementType.ATTR, "alice-id", "Alice");
        assertEquals(2, sessionService.getActiveLocks(diagramId).size());

        // Alice se desconecta
        Optional<UserLeaveResult> leaveOpt = sessionService.removeUserBySessionId("sess-alice");
        assertTrue(leaveOpt.isPresent());
        UserLeaveResult leave = leaveOpt.get();

        // Debe reportar 2 bloqueos liberados automáticamente
        assertEquals(2, leave.getReleasedLocks().size());
        assertEquals(0, sessionService.getActiveLocks(diagramId).size(), "Todos los bloqueos deben haber quedado libres");
    }
}
