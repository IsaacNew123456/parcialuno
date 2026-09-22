package com.app.services;

import com.app.dto.ws.LockElementType;
import com.app.dto.ws.LockPayload;
import com.app.dto.ws.PresencePayload;
import com.app.dto.ws.PresenceRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Servicio en memoria para la gestión del ciclo de vida de sesiones colaborativas,
 * control de presencia, asignación/transferencia del rol de anfitrión (HOST)
 * y control de concurrencia mediante bloqueos granulares de elementos.
 */
@Service
public class DiagramSessionService {

    private static final Logger log = LoggerFactory.getLogger(DiagramSessionService.class);

    // Mapa de salas activas: diagramId -> Lista de usuarios conectados
    private final ConcurrentHashMap<Long, List<UserSession>> roomUsers = new ConcurrentHashMap<>();

    // Índice secundario: sessionId -> UserSession para búsquedas rápidas en desconexión O(1)
    private final ConcurrentHashMap<String, UserSession> sessionIndex = new ConcurrentHashMap<>();

    // Registro concurrente de bloqueos: diagramId -> (elementId -> LockInfo)
    private final ConcurrentHashMap<Long, ConcurrentHashMap<String, LockInfo>> diagramLocks = new ConcurrentHashMap<>();

    /**
     * Registra el ingreso de un usuario a una sala de diagrama.
     */
    public PresencePayload addUser(Long diagramId, String sessionId, String userId, String username) {
        List<UserSession> users = roomUsers.computeIfAbsent(diagramId, k -> new CopyOnWriteArrayList<>());

        synchronized (users) {
            UserSession previous = sessionIndex.remove(sessionId);
            if (previous != null) {
                users.remove(previous);
            }

            boolean hasHost = users.stream().anyMatch(u -> u.getRole() == PresenceRole.HOST);
            PresenceRole role = hasHost ? PresenceRole.COLLABORATOR : PresenceRole.HOST;

            UserSession newSession = new UserSession(
                    sessionId,
                    userId,
                    username != null && !username.isBlank() ? username : "Usuario-" + userId,
                    role,
                    System.currentTimeMillis(),
                    diagramId
            );

            users.add(newSession);
            sessionIndex.put(sessionId, newSession);

            log.info("[COLLAB_SESSION] event=USER_JOINED diagramId={} userId={} role={} totalInRoom={}",
                    diagramId, userId, role, users.size());

            return newSession.toPresencePayload();
        }
    }

    /**
     * Remueve la sesión de un usuario tras su desconexión.
     * Libera automáticamente los bloqueos asociados al usuario.
     */
    public Optional<UserLeaveResult> removeUserBySessionId(String sessionId) {
        UserSession removedSession = sessionIndex.remove(sessionId);
        if (removedSession == null) {
            return Optional.empty();
        }

        Long diagramId = removedSession.getDiagramId();
        List<UserSession> users = roomUsers.get(diagramId);
        if (users == null) {
            return Optional.empty();
        }

        PresencePayload newHostPayload = null;
        boolean roomEmpty = false;

        // 1. Liberar primero los bloqueos adquiridos por el usuario que se retira
        List<LockPayload> releasedLocks = releaseLocksByUser(diagramId, removedSession.getUserId());

        synchronized (users) {
            users.remove(removedSession);

            if (users.isEmpty()) {
                roomUsers.remove(diagramId);
                diagramLocks.remove(diagramId);
                roomEmpty = true;
                log.info("[COLLAB_SESSION] event=ROOM_EMPTIED diagramId={} cleaned_up=true", diagramId);
            } else {
                if (removedSession.getRole() == PresenceRole.HOST) {
                    UserSession oldest = users.stream()
                            .min(Comparator.comparingLong(UserSession::getJoinedAt))
                            .orElse(users.get(0));

                    oldest.setRole(PresenceRole.HOST);
                    newHostPayload = oldest.toPresencePayload();

                    log.info("[COLLAB_SESSION] event=HOST_TRANSFERRED diagramId={} previousHostId={} newHostId={}",
                            diagramId, removedSession.getUserId(), oldest.getUserId());
                }
            }
        }

        log.info("[COLLAB_SESSION] event=USER_LEFT diagramId={} userId={} remainingInRoom={} releasedLocksCount={}",
                diagramId, removedSession.getUserId(), users.size(), releasedLocks.size());

        return Optional.of(new UserLeaveResult(
                diagramId,
                removedSession.toPresencePayload(),
                newHostPayload,
                roomEmpty,
                releasedLocks
        ));
    }

    // --- Control de Concurrencia y Bloqueos Granulares ---

    /**
     * Intenta adquirir un bloqueo sobre un elemento.
     * Si ya está bloqueado por otro usuario, se rechaza la solicitud.
     */
    public LockActionResult acquireLock(Long diagramId, String elementId, LockElementType elementType, String userId, String username) {
        if (diagramId == null || elementId == null || userId == null) {
            return new LockActionResult(false, null, "Parámetros inválidos para bloqueo");
        }

        ConcurrentHashMap<String, LockInfo> locks = diagramLocks.computeIfAbsent(diagramId, k -> new ConcurrentHashMap<>());

        synchronized (locks) {
            LockInfo current = locks.get(elementId);
            if (current != null) {
                if (!current.getLockedByUserId().equals(userId)) {
                    log.warn("[LOCK] event=LOCK_REJECTED diagramId={} elementId={} requestedBy={} currentHolder={}",
                            diagramId, elementId, userId, current.getLockedByUserId());
                    return new LockActionResult(
                            false,
                            current.toPayload(true),
                            "Elemento bloqueado por " + (current.getLockedByUsername() != null ? current.getLockedByUsername() : current.getLockedByUserId())
                    );
                }
                // Si es el mismo usuario, renueva timestamp
                current.setLockedAt(System.currentTimeMillis());
                return new LockActionResult(true, current.toPayload(true), null);
            }

            LockInfo newLock = LockInfo.builder()
                    .elementId(elementId)
                    .elementType(elementType != null ? elementType : LockElementType.CLASS)
                    .lockedByUserId(userId)
                    .lockedByUsername(username != null && !username.isBlank() ? username : userId)
                    .lockedAt(System.currentTimeMillis())
                    .build();

            locks.put(elementId, newLock);
            log.info("[LOCK] event=LOCK_ACQUIRED diagramId={} elementId={} userId={}", diagramId, elementId, userId);
            return new LockActionResult(true, newLock.toPayload(true), null);
        }
    }

    /**
     * Libera un bloqueo previamente adquirido.
     * Valida pertenencia: Solo el dueño del bloqueo o el HOST de la sala pueden liberarlo.
     */
    public Optional<LockPayload> releaseLock(Long diagramId, String elementId, String userId) {
        if (diagramId == null || elementId == null || userId == null) {
            return Optional.empty();
        }

        ConcurrentHashMap<String, LockInfo> locks = diagramLocks.get(diagramId);
        if (locks == null) {
            return Optional.empty();
        }

        synchronized (locks) {
            LockInfo current = locks.get(elementId);
            if (current == null) {
                return Optional.empty();
            }

            Optional<PresencePayload> host = getHost(diagramId);
            boolean isHost = host.isPresent() && userId.equals(host.get().getUserId());

            if (!current.getLockedByUserId().equals(userId) && !isHost) {
                log.warn("[LOCK] event=RELEASE_DENIED diagramId={} elementId={} attemptBy={} heldBy={}",
                        diagramId, elementId, userId, current.getLockedByUserId());
                return Optional.empty();
            }

            locks.remove(elementId);
            if (locks.isEmpty()) {
                diagramLocks.remove(diagramId);
            }

            log.info("[LOCK] event=LOCK_RELEASED diagramId={} elementId={} userId={}", diagramId, elementId, userId);
            return Optional.of(current.toPayload(false));
        }
    }

    /**
     * Libera todos los bloqueos asociados a un usuario específico en un diagrama.
     */
    public List<LockPayload> releaseLocksByUser(Long diagramId, String userId) {
        if (diagramId == null || userId == null) {
            return Collections.emptyList();
        }

        ConcurrentHashMap<String, LockInfo> locks = diagramLocks.get(diagramId);
        if (locks == null || locks.isEmpty()) {
            return Collections.emptyList();
        }

        List<LockPayload> released = new ArrayList<>();
        synchronized (locks) {
            Iterator<Map.Entry<String, LockInfo>> it = locks.entrySet().iterator();
            while (it.hasNext()) {
                Map.Entry<String, LockInfo> entry = it.next();
                if (userId.equals(entry.getValue().getLockedByUserId())) {
                    released.add(entry.getValue().toPayload(false));
                    it.remove();
                }
            }
            if (locks.isEmpty()) {
                diagramLocks.remove(diagramId);
            }
        }

        if (!released.isEmpty()) {
            log.info("[LOCK] event=AUTO_RELEASE_ALL diagramId={} userId={} releasedCount={}",
                    diagramId, userId, released.size());
        }
        return released;
    }

    /**
     * Retorna el mapa de bloqueos activos en el diagrama.
     */
    public List<LockPayload> getActiveLocks(Long diagramId) {
        ConcurrentHashMap<String, LockInfo> locks = diagramLocks.get(diagramId);
        if (locks == null || locks.isEmpty()) {
            return Collections.emptyList();
        }
        synchronized (locks) {
            return locks.values().stream()
                    .map(info -> info.toPayload(true))
                    .toList();
        }
    }

    // --- Consultas de Presencia ---

    public List<PresencePayload> getActiveUsers(Long diagramId) {
        List<UserSession> users = roomUsers.get(diagramId);
        if (users == null || users.isEmpty()) {
            return Collections.emptyList();
        }
        synchronized (users) {
            return users.stream()
                    .map(UserSession::toPresencePayload)
                    .toList();
        }
    }

    public Optional<PresencePayload> getHost(Long diagramId) {
        List<UserSession> users = roomUsers.get(diagramId);
        if (users == null || users.isEmpty()) {
            return Optional.empty();
        }
        synchronized (users) {
            return users.stream()
                    .filter(u -> u.getRole() == PresenceRole.HOST)
                    .map(UserSession::toPresencePayload)
                    .findFirst();
        }
    }

    public int getUserCount(Long diagramId) {
        List<UserSession> users = roomUsers.get(diagramId);
        return users != null ? users.size() : 0;
    }

    public Optional<UserSession> getSession(String sessionId) {
        return Optional.ofNullable(sessionIndex.get(sessionId));
    }

    public void clearAll() {
        roomUsers.clear();
        sessionIndex.clear();
        diagramLocks.clear();
    }

    // --- Clases de Apoyo Internas ---

    public static class UserSession {
        private final String sessionId;
        private final String userId;
        private final String username;
        private PresenceRole role;
        private final long joinedAt;
        private final Long diagramId;

        public UserSession(String sessionId, String userId, String username, PresenceRole role, long joinedAt, Long diagramId) {
            this.sessionId = sessionId;
            this.userId = userId;
            this.username = username;
            this.role = role;
            this.joinedAt = joinedAt;
            this.diagramId = diagramId;
        }

        public String getSessionId() { return sessionId; }
        public String getUserId() { return userId; }
        public String getUsername() { return username; }
        public PresenceRole getRole() { return role; }
        public void setRole(PresenceRole role) { this.role = role; }
        public long getJoinedAt() { return joinedAt; }
        public Long getDiagramId() { return diagramId; }

        public PresencePayload toPresencePayload() {
            return PresencePayload.builder()
                    .userId(userId)
                    .username(username)
                    .role(role)
                    .build();
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LockInfo {
        private String elementId;
        private LockElementType elementType;
        private String lockedByUserId;
        private String lockedByUsername;
        private long lockedAt;

        public LockPayload toPayload(boolean isLocked) {
            return LockPayload.builder()
                    .elementId(elementId)
                    .elementType(elementType)
                    .lockedByUserId(lockedByUserId)
                    .lockedByUsername(lockedByUsername)
                    .locked(isLocked)
                    .build();
        }
    }

    @Data
    @AllArgsConstructor
    public static class LockActionResult {
        private boolean success;
        private LockPayload payload;
        private String failureReason;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserLeaveResult {
        private Long diagramId;
        private PresencePayload leftUser;
        private PresencePayload newHost;
        private boolean roomEmpty;
        @Builder.Default
        private List<LockPayload> releasedLocks = Collections.emptyList();
    }
}
