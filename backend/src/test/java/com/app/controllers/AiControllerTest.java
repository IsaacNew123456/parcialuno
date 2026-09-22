package com.app.controllers;

import com.app.dto.AiCommandRequest;
import com.app.dto.AiDomainResponse;
import com.app.dto.ClassModel;
import com.app.dto.RelationModel;
import com.app.services.AiCommandService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Prueba de capa de controlador para POST /api/ai/command.
 * Verifica contrato de la API REST (deserialización, serialización, status HTTP)
 * sin levantar base de datos ni HttpClient real.
 */
@WebMvcTest(AiController.class)
class AiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AiCommandService aiCommandService;

    @Test
    @DisplayName("POST /api/ai/command retorna 200 con AiDomainResponse estructurado (fuente OLLAMA_LLM)")
    void testExecuteCommandReturns200WithOllamaResponse() throws Exception {
        ClassModel cls = new ClassModel();
        cls.setId("cls_producto");
        cls.setName("Producto");
        cls.setX(100.0);
        cls.setY(80.0);
        cls.setVersion(0L);

        AiDomainResponse mockResponse = AiDomainResponse.builder()
                .action("GENERATE_CONCEPTUAL_ARCHITECTURE")
                .domain("Inventario")
                .classes(List.of(cls))
                .relations(List.of())
                .success(true)
                .source("OLLAMA_LLM")
                .message("Modelo generado con éxito por Ollama LLM")
                .build();

        when(aiCommandService.generateConceptualArchitecture(any(AiCommandRequest.class)))
                .thenReturn(mockResponse);

        AiCommandRequest request = new AiCommandRequest("Sistema de inventario de productos");

        mockMvc.perform(post("/api/ai/command")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.source").value("OLLAMA_LLM"))
                .andExpect(jsonPath("$.domain").value("Inventario"))
                .andExpect(jsonPath("$.action").value("GENERATE_CONCEPTUAL_ARCHITECTURE"))
                .andExpect(jsonPath("$.classes").isArray())
                .andExpect(jsonPath("$.classes[0].name").value("Producto"))
                .andExpect(jsonPath("$.relations").isArray());
    }

    @Test
    @DisplayName("POST /api/ai/command con Ollama caído retorna 200 con fuente HEURISTIC_FALLBACK")
    void testExecuteCommandReturnsFallbackWhenOllamaFails() throws Exception {
        AiDomainResponse fallbackResponse = AiDomainResponse.builder()
                .action("GENERATE_CONCEPTUAL_ARCHITECTURE")
                .domain("Contabilidad y Finanzas")
                .classes(List.of())
                .relations(List.of())
                .success(true)
                .source("HEURISTIC_FALLBACK")
                .message("Generado por fallback heurístico determinista (Ollama no disponible)")
                .build();

        when(aiCommandService.generateConceptualArchitecture(any(AiCommandRequest.class)))
                .thenReturn(fallbackResponse);

        AiCommandRequest request = new AiCommandRequest("Generar sistema contable");

        mockMvc.perform(post("/api/ai/command")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.source").value("HEURISTIC_FALLBACK"))
                .andExpect(jsonPath("$.domain").value("Contabilidad y Finanzas"));
    }

    @Test
    @DisplayName("POST /api/ai/command con prompt vacío retorna 200 con fallback heurístico")
    void testExecuteCommandWithEmptyPromptReturnsFallback() throws Exception {
        AiDomainResponse fallbackResponse = AiDomainResponse.builder()
                .action("GENERATE_CONCEPTUAL_ARCHITECTURE")
                .domain("Contabilidad y Finanzas")
                .classes(List.of())
                .relations(List.of())
                .success(true)
                .source("HEURISTIC_FALLBACK")
                .message("Prompt vacío, se retorna arquitectura conceptual base")
                .build();

        when(aiCommandService.generateConceptualArchitecture(any(AiCommandRequest.class)))
                .thenReturn(fallbackResponse);

        AiCommandRequest request = new AiCommandRequest("");

        mockMvc.perform(post("/api/ai/command")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("HEURISTIC_FALLBACK"));
    }

    @Test
    @DisplayName("POST /api/ai/command con relaciones retorna estructura RelationModel completa")
    void testExecuteCommandReturnsRelationsInResponse() throws Exception {
        RelationModel rel = new RelationModel();
        rel.setId("rel_empresa_factura");
        rel.setFromId("cls_empresa");
        rel.setToId("cls_factura");
        rel.setFromName("Empresa");
        rel.setToName("Factura");
        rel.setRelationType("composition");
        rel.setMult("1..*");
        rel.setSourceMultiplicity("1");
        rel.setTargetMultiplicity("*");

        AiDomainResponse mockResponse = AiDomainResponse.builder()
                .action("GENERATE_CONCEPTUAL_ARCHITECTURE")
                .domain("Contabilidad y Finanzas")
                .classes(List.of())
                .relations(List.of(rel))
                .success(true)
                .source("HEURISTIC_FALLBACK")
                .message("Modelo heurístico generado")
                .build();

        when(aiCommandService.generateConceptualArchitecture(any(AiCommandRequest.class)))
                .thenReturn(mockResponse);

        AiCommandRequest request = new AiCommandRequest("Empresa con facturas");

        mockMvc.perform(post("/api/ai/command")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.relations").isArray())
                .andExpect(jsonPath("$.relations[0].relationType").value("composition"))
                .andExpect(jsonPath("$.relations[0].fromName").value("Empresa"))
                .andExpect(jsonPath("$.relations[0].toName").value("Factura"))
                .andExpect(jsonPath("$.relations[0].mult").value("1..*"));
    }

    @Test
    @DisplayName("POST /api/ai/business-chat retorna 200 con BusinessChatResponse generado por gemma2:2b")
    void testBusinessChatReturns200() throws Exception {
        com.app.dto.ai.BusinessChatResponse mockResp = com.app.dto.ai.BusinessChatResponse.builder()
                .reply("Para contabilidad, se recomienda Empresa, AsientoContable y CuentaContable.")
                .success(true)
                .source("ollama-gemma2:2b")
                .message("Respuesta generada por gemma2:2b")
                .build();

        when(aiCommandService.chatBusiness(any(com.app.dto.ai.BusinessChatRequest.class)))
                .thenReturn(mockResp);

        com.app.dto.ai.BusinessChatRequest req = com.app.dto.ai.BusinessChatRequest.builder()
                .message("¿Cómo diseño la contabilidad?")
                .domainContext("contabilidad")
                .build();

        mockMvc.perform(post("/api/ai/business-chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply").value("Para contabilidad, se recomienda Empresa, AsientoContable y CuentaContable."))
                .andExpect(jsonPath("$.source").value("ollama-gemma2:2b"))
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("POST /api/ai/scan-diagram con JSON base64 retorna 200 con clases y relaciones de moondream")
    void testScanDiagramJsonReturns200() throws Exception {
        ClassModel cm = new ClassModel();
        cm.setId("cls_vis_1");
        cm.setName("Factura");

        com.app.dto.ai.ScanDiagramResponse mockResp = com.app.dto.ai.ScanDiagramResponse.builder()
                .classes(List.of(cm))
                .relations(List.of())
                .success(true)
                .source("ollama-moondream:latest")
                .message("Diagrama transcrito")
                .build();

        when(aiCommandService.scanDiagram(any()))
                .thenReturn(mockResp);

        com.app.dto.ai.ScanDiagramRequest req = com.app.dto.ai.ScanDiagramRequest.builder()
                .imageBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
                .fileName("test.png")
                .build();

        mockMvc.perform(post("/api/ai/scan-diagram")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.classes[0].name").value("Factura"))
                .andExpect(jsonPath("$.source").value("ollama-moondream:latest"))
                .andExpect(jsonPath("$.success").value(true));
    }
}
