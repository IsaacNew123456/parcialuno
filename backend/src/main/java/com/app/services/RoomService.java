package com.app.services;

import com.app.dto.room.CreateRoomRequest;
import com.app.dto.room.RoomResponse;
import com.app.entities.Diagram;
import com.app.entities.Room;
import com.app.repositories.DiagramRepository;
import com.app.repositories.RoomRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.util.List;
import java.util.Optional;

@Service
public class RoomService {

    private static final Logger log = LoggerFactory.getLogger(RoomService.class);
    private static final String ALPHANUMERIC_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RoomRepository roomRepository;
    private final DiagramRepository diagramRepository;
    private final DiagramService diagramService;

    public RoomService(RoomRepository roomRepository,
                       DiagramRepository diagramRepository,
                       DiagramService diagramService) {
        this.roomRepository = roomRepository;
        this.diagramRepository = diagramRepository;
        this.diagramService = diagramService;
    }

    @Transactional(readOnly = true)
    public List<RoomResponse> findAll() {
        return roomRepository.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public RoomResponse findById(Long id) {
        Room room = roomRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sala no encontrada con ID: " + id));
        return toResponse(room);
    }

    @Transactional(readOnly = true)
    public RoomResponse findByCode(String code) {
        if (code == null || code.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El código de sala no puede estar vacío");
        }
        Room room = roomRepository.findByCodeIgnoreCase(code.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ninguna sala con el código: " + code.trim()));
        return toResponse(room);
    }

    @Transactional
    public RoomResponse createRoom(CreateRoomRequest request) {
        String code = (request != null && request.getCode() != null && !request.getCode().isBlank())
                ? request.getCode().trim().toUpperCase()
                : generateUniqueCode();

        if (roomRepository.existsByCodeIgnoreCase(code)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe una sala con el código: " + code);
        }

        String roomName = (request != null && request.getName() != null && !request.getName().isBlank())
                ? request.getName().trim()
                : "Sala " + code;

        String diagramName = (request != null && request.getDiagramName() != null && !request.getDiagramName().isBlank())
                ? request.getDiagramName().trim()
                : roomName + " - Diagrama";

        // Crear diagrama asociado
        Diagram diagram = new Diagram();
        diagram.setName(diagramName);
        diagram.setContentJson("{\"classes\":[],\"relations\":[]}");
        diagram.setVersion(0L);
        diagram = diagramRepository.save(diagram);

        // Crear sala
        Room room = new Room();
        room.setCode(code);
        room.setName(roomName);
        room.setDiagram(diagram);

        Room saved = roomRepository.save(room);
        log.info("[ROOM_SERVICE] Sala creada id={} code={} diagramId={}", saved.getId(), saved.getCode(), diagram.getId());
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public RoomResponse joinRoom(String code) {
        return findByCode(code);
    }

    /**
     * Resuelve el ID del diagrama dado un ID que puede ser de sala o de diagrama.
     */
    @Transactional(readOnly = true)
    public Long resolveDiagramId(Long roomOrDiagramId) {
        if (roomOrDiagramId == null) return null;
        Optional<Room> roomOpt = roomRepository.findById(roomOrDiagramId);
        if (roomOpt.isPresent() && roomOpt.get().getDiagram() != null) {
            return roomOpt.get().getDiagram().getId();
        }
        return roomOrDiagramId;
    }

    /**
     * Resuelve la sala dado un ID de diagrama.
     */
    @Transactional(readOnly = true)
    public Optional<Room> findByDiagramId(Long diagramId) {
        if (diagramId == null) return Optional.empty();
        return roomRepository.findByDiagramId(diagramId);
    }

    public RoomResponse toResponse(Room room) {
        Diagram diagram = room.getDiagram();
        return RoomResponse.builder()
                .id(room.getId())
                .code(room.getCode())
                .name(room.getName())
                .diagramId(diagram != null ? diagram.getId() : null)
                .diagram(diagram != null ? diagramService.toResponse(diagram) : null)
                .createdAt(room.getCreatedAt())
                .build();
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < 50; attempt++) {
            StringBuilder sb = new StringBuilder(6);
            for (int i = 0; i < 6; i++) {
                sb.append(ALPHANUMERIC_CHARS.charAt(RANDOM.nextInt(ALPHANUMERIC_CHARS.length())));
            }
            String code = sb.toString();
            if (!roomRepository.existsByCodeIgnoreCase(code)) {
                return code;
            }
        }
        // Fallback garantizado con timestamp
        return "RM" + (System.currentTimeMillis() % 10000);
    }
}
