package com.app.controllers;

import com.app.dto.DiagramResponse;
import com.app.dto.room.CreateRoomRequest;
import com.app.dto.room.JoinRoomRequest;
import com.app.dto.room.RoomResponse;
import com.app.services.RoomService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RoomControllerTest {

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private RoomService roomService;

    @BeforeEach
    void setUp() {
        roomService = Mockito.mock(RoomService.class);
        RoomController controller = new RoomController(roomService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    @DisplayName("POST /api/rooms crea sala y retorna 201 CREATED con código alfanumérico")
    void testCreateRoomReturns201() throws Exception {
        RoomResponse mockResponse = RoomResponse.builder()
                .id(1L)
                .code("RM8K2A")
                .name("Sala de Arquitectura")
                .diagramId(10L)
                .createdAt(Instant.now())
                .build();

        Mockito.when(roomService.createRoom(any())).thenReturn(mockResponse);

        CreateRoomRequest request = CreateRoomRequest.builder()
                .name("Sala de Arquitectura")
                .build();

        mockMvc.perform(post("/api/rooms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.code", is("RM8K2A")))
                .andExpect(jsonPath("$.name", is("Sala de Arquitectura")))
                .andExpect(jsonPath("$.diagramId", is(10)));
    }

    @Test
    @DisplayName("POST /api/rooms/join permite unirse a la sala por defecto 1234")
    void testJoinRoomByDefaultCode() throws Exception {
        DiagramResponse diagram = new DiagramResponse();
        diagram.setId(100L);
        diagram.setName("Diagrama Base - Sala 1234");

        RoomResponse mockResponse = RoomResponse.builder()
                .id(2L)
                .code("1234")
                .name("Sala Principal")
                .diagramId(100L)
                .diagram(diagram)
                .createdAt(Instant.now())
                .build();

        Mockito.when(roomService.joinRoom(eq("1234"))).thenReturn(mockResponse);

        JoinRoomRequest request = JoinRoomRequest.builder()
                .code("1234")
                .build();

        mockMvc.perform(post("/api/rooms/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is("1234")))
                .andExpect(jsonPath("$.diagramId", is(100)))
                .andExpect(jsonPath("$.diagram.name", is("Diagrama Base - Sala 1234")));
    }

    @Test
    @DisplayName("GET /api/rooms/code/{code} obtiene la información de la sala")
    void testGetRoomByCode() throws Exception {
        RoomResponse mockResponse = RoomResponse.builder()
                .id(5L)
                .code("TEST99")
                .name("Sala de Prueba")
                .diagramId(50L)
                .build();

        Mockito.when(roomService.findByCode("TEST99")).thenReturn(mockResponse);

        mockMvc.perform(get("/api/rooms/code/TEST99"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is("TEST99")))
                .andExpect(jsonPath("$.name", is("Sala de Prueba")));
    }

    @Test
    @DisplayName("GET /api/rooms lista todas las salas")
    void testListAllRooms() throws Exception {
        RoomResponse r1 = RoomResponse.builder().id(1L).code("1234").name("Sala 1").build();
        RoomResponse r2 = RoomResponse.builder().id(2L).code("ABCD").name("Sala 2").build();

        Mockito.when(roomService.findAll()).thenReturn(List.of(r1, r2));

        mockMvc.perform(get("/api/rooms"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].code", is("1234")))
                .andExpect(jsonPath("$[1].code", is("ABCD")));
    }
}
