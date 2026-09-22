package com.app.services;

import com.app.dto.DiagramResponse;
import com.app.dto.room.CreateRoomRequest;
import com.app.dto.room.RoomResponse;
import com.app.entities.Diagram;
import com.app.entities.Room;
import com.app.repositories.DiagramRepository;
import com.app.repositories.RoomRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

class RoomServiceTest {

    private RoomRepository roomRepository;
    private DiagramRepository diagramRepository;
    private DiagramService diagramService;
    private RoomService roomService;

    @BeforeEach
    void setUp() {
        roomRepository = Mockito.mock(RoomRepository.class);
        diagramRepository = Mockito.mock(DiagramRepository.class);
        diagramService = Mockito.mock(DiagramService.class);
        roomService = new RoomService(roomRepository, diagramRepository, diagramService);
    }

    @Test
    @DisplayName("createRoom genera un código alfanumérico si no se provee y persiste diagrama")
    void testCreateRoomGeneratesCode() {
        Diagram mockDiagram = new Diagram();
        mockDiagram.setId(77L);
        mockDiagram.setName("Mi Sala - Diagrama");

        Mockito.when(diagramRepository.save(any(Diagram.class))).thenReturn(mockDiagram);

        Room mockRoom = new Room();
        mockRoom.setId(10L);
        mockRoom.setCode("ABC123");
        mockRoom.setName("Mi Sala");
        mockRoom.setDiagram(mockDiagram);

        Mockito.when(roomRepository.save(any(Room.class))).thenReturn(mockRoom);
        Mockito.when(diagramService.toResponse(any(Diagram.class))).thenReturn(new DiagramResponse());

        CreateRoomRequest request = CreateRoomRequest.builder()
                .name("Mi Sala")
                .build();

        RoomResponse response = roomService.createRoom(request);

        assertNotNull(response);
        assertEquals("ABC123", response.getCode());
        assertEquals("Mi Sala", response.getName());
        assertEquals(77L, response.getDiagramId());
    }

    @Test
    @DisplayName("joinRoom encuentra la sala ignorando mayúsculas y minúsculas")
    void testJoinRoomCaseInsensitive() {
        Diagram mockDiagram = new Diagram();
        mockDiagram.setId(12L);

        Room mockRoom = new Room();
        mockRoom.setId(2L);
        mockRoom.setCode("1234");
        mockRoom.setName("Sala Principal");
        mockRoom.setDiagram(mockDiagram);

        Mockito.when(roomRepository.findByCodeIgnoreCase(eq("1234"))).thenReturn(Optional.of(mockRoom));
        Mockito.when(diagramService.toResponse(any(Diagram.class))).thenReturn(new DiagramResponse());

        RoomResponse response = roomService.joinRoom("1234");

        assertNotNull(response);
        assertEquals("1234", response.getCode());
        assertEquals(12L, response.getDiagramId());
    }

    @Test
    @DisplayName("joinRoom arroja ResponseStatusException NOT_FOUND si el código no existe")
    void testJoinRoomNotFoundThrows() {
        Mockito.when(roomRepository.findByCodeIgnoreCase(eq("NOEXISTE"))).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> roomService.joinRoom("NOEXISTE"));
    }

    @Test
    @DisplayName("resolveDiagramId resuelve el ID del diagrama si se pasa el ID de la sala")
    void testResolveDiagramId() {
        Diagram mockDiagram = new Diagram();
        mockDiagram.setId(999L);

        Room mockRoom = new Room();
        mockRoom.setId(5L);
        mockRoom.setDiagram(mockDiagram);

        Mockito.when(roomRepository.findById(5L)).thenReturn(Optional.of(mockRoom));
        Mockito.when(roomRepository.findById(999L)).thenReturn(Optional.empty());

        assertEquals(999L, roomService.resolveDiagramId(5L));
        assertEquals(999L, roomService.resolveDiagramId(999L));
    }
}
