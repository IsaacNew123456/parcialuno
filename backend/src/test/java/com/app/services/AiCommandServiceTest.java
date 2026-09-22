package com.app.services;

import com.app.dto.AiCommandRequest;
import com.app.dto.AiDomainResponse;
import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.RelationModel;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpConnectTimeoutException;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AiCommandServiceTest {

    private AiCommandService service;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        service = new AiCommandService(objectMapper);
    }

    @Test
    @DisplayName("Fallback Heurístico Determinista genera modelo completo de Contabilidad/Finanzas")
    void testBuildHeuristicFallbackCompleteDomain() {
        AiDomainResponse response = service.buildHeuristicFallback("Contabilidad", "Test fallback directo");

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals("GENERATE_CONCEPTUAL_ARCHITECTURE", response.getAction());
        assertEquals("Contabilidad y Finanzas", response.getDomain());
        assertEquals("HEURISTIC_FALLBACK", response.getSource());

        // Verificar 4 clases esperadas: Empresa, Factura, AsientoContable, CuentaContable
        List<ClassModel> classes = response.getClasses();
        assertNotNull(classes);
        assertEquals(4, classes.size());

        List<String> classNames = classes.stream().map(ClassModel::getName).toList();
        assertTrue(classNames.contains("Empresa"));
        assertTrue(classNames.contains("Factura"));
        assertTrue(classNames.contains("AsientoContable"));
        assertTrue(classNames.contains("CuentaContable"));

        // Verificar atributos tipados de Empresa
        ClassModel empresa = classes.stream().filter(c -> "Empresa".equals(c.getName())).findFirst().orElseThrow();
        assertNotNull(empresa.getAttrs());
        assertTrue(empresa.getAttrs().stream().anyMatch(a -> "id".equals(a.getName()) && "Long".equals(a.getType()) && Boolean.TRUE.equals(a.getIsPrimary())));
        assertTrue(empresa.getAttrs().stream().anyMatch(a -> "razonSocial".equals(a.getName()) && "String".equals(a.getType())));

        // Verificar atributos tipados de Factura (Double, LocalDate)
        ClassModel factura = classes.stream().filter(c -> "Factura".equals(c.getName())).findFirst().orElseThrow();
        assertNotNull(factura.getAttrs());
        assertTrue(factura.getAttrs().stream().anyMatch(a -> "montoTotal".equals(a.getName()) && "Double".equals(a.getType())));
        assertTrue(factura.getAttrs().stream().anyMatch(a -> "fechaEmision".equals(a.getName()) && "LocalDate".equals(a.getType())));

        // Verificar relaciones UML
        List<RelationModel> relations = response.getRelations();
        assertNotNull(relations);
        assertEquals(3, relations.size());

        assertTrue(relations.stream().anyMatch(r -> "Empresa".equals(r.getFromName()) && "Factura".equals(r.getToName()) && "composition".equals(r.getRelationType())));
        assertTrue(relations.stream().anyMatch(r -> "Factura".equals(r.getFromName()) && "AsientoContable".equals(r.getToName()) && "1..1".equals(r.getMult())));
        assertTrue(relations.stream().anyMatch(r -> "AsientoContable".equals(r.getFromName()) && "CuentaContable".equals(r.getToName()) && "*..*".equals(r.getMult())));
    }

    @Test
    @DisplayName("Resiliencia: Ante caída de conexión con Ollama (IOException), activa fallback sin lanzar excepción")
    void testResilienceOnOllamaConnectionFailure() throws Exception {
        // Mock de HttpClient que simula caída de red / servicio cerrado (ConnectException)
        HttpClient mockHttpClient = mock(HttpClient.class);
        when(mockHttpClient.send(any(HttpRequest.class), any()))
                .thenThrow(new IOException("Connection refused: connect (Ollama está cerrado)"));

        AiCommandService serviceWithMock = new AiCommandService(
                objectMapper,
                mockHttpClient,
                "http://localhost:11434/api/generate",
                "qwen2.5-coder:1.5b",
                8
        );

        AiCommandRequest request = new AiCommandRequest("Generar sistema contable para empresa comercial");

        // Ejecutar sin producir excepciones no controladas
        AiDomainResponse response = assertDoesNotThrow(() -> serviceWithMock.generateConceptualArchitecture(request));

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals("HEURISTIC_FALLBACK", response.getSource());
        assertEquals("Contabilidad y Finanzas", response.getDomain());
        assertFalse(response.getClasses().isEmpty());
        assertFalse(response.getRelations().isEmpty());
    }

    @Test
    @DisplayName("Resiliencia: Ante timeout de Ollama (HttpConnectTimeoutException), activa fallback sin lanzar excepción")
    void testResilienceOnOllamaTimeout() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        when(mockHttpClient.send(any(HttpRequest.class), any()))
                .thenThrow(new HttpConnectTimeoutException("HTTP connection timed out after 8 seconds"));

        AiCommandService serviceWithMock = new AiCommandService(
                objectMapper,
                mockHttpClient,
                "http://localhost:11434/api/generate",
                "qwen2.5-coder:1.5b",
                8
        );

        AiCommandRequest request = new AiCommandRequest("Crear módulos financieros de facturación");

        AiDomainResponse response = assertDoesNotThrow(() -> serviceWithMock.generateConceptualArchitecture(request));

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals("HEURISTIC_FALLBACK", response.getSource());
        assertEquals(4, response.getClasses().size());
    }

    @Test
    @DisplayName("Resiliencia: Prompt nulo o vacío retorna fallback de forma segura sin excepciones")
    void testResilienceOnNullOrEmptyPrompt() {
        AiDomainResponse nullResponse = assertDoesNotThrow(() -> service.generateConceptualArchitecture(null));
        assertNotNull(nullResponse);
        assertTrue(nullResponse.isSuccess());
        assertEquals("HEURISTIC_FALLBACK", nullResponse.getSource());

        AiDomainResponse emptyResponse = assertDoesNotThrow(() -> service.generateConceptualArchitecture(new AiCommandRequest("")));
        assertNotNull(emptyResponse);
        assertTrue(emptyResponse.isSuccess());
        assertEquals("HEURISTIC_FALLBACK", emptyResponse.getSource());
    }

    @Test
    @DisplayName("Resiliencia: Respuesta exitosa simulada de Ollama estructura correctamente AiDomainResponse")
    void testSuccessfulOllamaResponseParsing() throws Exception {
        String ollamaJsonPayload = """
            {
              "response": "{\\"action\\":\\"GENERATE_CONCEPTUAL_ARCHITECTURE\\",\\"domain\\":\\"Inventario\\",\\"classes\\":[{\\"name\\":\\"Producto\\",\\"attrs\\":[{\\"name\\":\\"id\\",\\"type\\":\\"Long\\"},{\\"name\\":\\"nombre\\",\\"type\\":\\"String\\"},{\\"name\\":\\"precio\\",\\"type\\":\\"Double\\"}]},{\\"name\\":\\"Categoria\\",\\"attrs\\":[{\\"name\\":\\"id\\",\\"type\\":\\"Long\\"},{\\"name\\":\\"descripcion\\",\\"type\\":\\"String\\"}]}],\\"relations\\":[{\\"source\\":\\"Producto\\",\\"target\\":\\"Categoria\\",\\"relationType\\":\\"association\\",\\"mult\\":\\"*..1\\"}]}"
            }
            """;

        @SuppressWarnings("rawtypes")
        HttpResponse mockHttpResponse = mock(HttpResponse.class);
        when(mockHttpResponse.statusCode()).thenReturn(200);
        when(mockHttpResponse.body()).thenReturn(ollamaJsonPayload);

        HttpClient mockHttpClient = mock(HttpClient.class);
        doReturn(mockHttpResponse).when(mockHttpClient).send(any(HttpRequest.class), any());

        AiCommandService serviceWithMock = new AiCommandService(
                objectMapper,
                mockHttpClient,
                "http://localhost:11434/api/generate",
                "qwen2.5-coder:1.5b",
                8
        );

        AiCommandRequest request = new AiCommandRequest("Sistema de inventario con productos y categorías");
        AiDomainResponse response = serviceWithMock.generateConceptualArchitecture(request);

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals("OLLAMA_LLM", response.getSource());
        assertEquals("Inventario", response.getDomain());
        assertEquals(2, response.getClasses().size());
        assertEquals(1, response.getRelations().size());
    }

    // ==========================================
    // Pruebas de compatibilidad con NLP heurístico previo
    // ==========================================
    @Test
    @DisplayName("Compatibilidad NLP: ADD_CLASS con atributos")
    void testLegacyAddClassWithAttributes() {
        var response = service.fallbackHeuristicCommand("Crea la clase Factura con total double y fecha date", List.of("Producto"));
        assertNotNull(response);
        assertEquals("ADD_CLASS", response.getAction());
        assertTrue(response.isSuccess());
        assertEquals("Factura", response.getData().get("name"));
    }

    @Test
    @DisplayName("Compatibilidad NLP: ADD_RELATION entre clases")
    void testLegacyAddRelation() {
        var response = service.fallbackHeuristicCommand("Relaciona Factura con Cliente", List.of("Factura", "Cliente"));
        assertNotNull(response);
        assertEquals("ADD_RELATION", response.getAction());
        assertTrue(response.isSuccess());
        assertEquals("Factura", response.getData().get("source"));
        assertEquals("Cliente", response.getData().get("target"));
    }
}
