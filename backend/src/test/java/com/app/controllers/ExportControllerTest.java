package com.app.controllers;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.entities.Diagram;
import com.app.repositories.DiagramRepository;
import com.app.services.CodeGeneratorService;
import com.app.services.DiagramService;
import com.app.services.PostmanCollectionService;
import com.app.services.SpringBootProjectGeneratorService;
import com.app.services.XmiService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ExportControllerTest {

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private DiagramRepository diagramRepository;
    private DiagramService diagramService;

    @BeforeEach
    void setUp() {
        CodeGeneratorService codeGeneratorService = new CodeGeneratorService(objectMapper);
        XmiService xmiService = new XmiService();
        SpringBootProjectGeneratorService projectGeneratorService = new SpringBootProjectGeneratorService();
        PostmanCollectionService postmanCollectionService = new PostmanCollectionService();
        diagramRepository = Mockito.mock(DiagramRepository.class);
        diagramService = Mockito.mock(DiagramService.class);

        ExportController controller = new ExportController(
                codeGeneratorService,
                xmiService,
                projectGeneratorService,
                postmanCollectionService,
                diagramRepository,
                diagramService
        );
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private DiagramModel createSampleDiagram() {
        DiagramModel model = new DiagramModel();
        model.setName("tienda");
        ClassModel producto = new ClassModel();
        producto.setName("Producto");
        AttrModel precio = new AttrModel();
        precio.setName("precio");
        precio.setType("decimal");
        producto.getAttrs().add(precio);
        model.getClasses().add(producto);
        return model;
    }

    @Test
    void exportProjectReturnsZipAttachment() throws Exception {
        DiagramModel model = createSampleDiagram();
        String json = objectMapper.writeValueAsString(model);

        mockMvc.perform(post("/api/export/project")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"backend-spring-boot.zip\""));
    }

    @Test
    void exportZipMaintainsBackwardCompatibility() throws Exception {
        DiagramModel model = createSampleDiagram();
        String json = objectMapper.writeValueAsString(model);

        mockMvc.perform(post("/api/export/zip")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"spring-boot-backend.zip\""));
    }

    @Test
    void exportZipSupportsGetRequestFromMobileApp() throws Exception {
        // La app móvil hace FileSystem.downloadAsync (GET /api/export/zip) sin enviar body
        mockMvc.perform(get("/api/export/zip"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"spring-boot-backend.zip\""));
    }

    @Test
    void exportZipSupportsGetRequestWithDiagramIdParam() throws Exception {
        Diagram diagram = new Diagram();
        diagram.setId(42L);
        diagram.setName("Inventario");
        diagram.setContentJson("{\"name\":\"Inventario\",\"classes\":[{\"name\":\"Item\",\"attrs\":[{\"name\":\"codigo\",\"type\":\"String\"}]}],\"relations\":[]}");

        Mockito.when(diagramRepository.findById(eq(42L))).thenReturn(Optional.of(diagram));
        Mockito.when(diagramService.parseContent(any())).thenReturn(createSampleDiagram());

        mockMvc.perform(get("/api/export/zip?diagramId=42"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"spring-boot-backend.zip\""));
    }

    @Test
    void exportProjectSupportsGetRequest() throws Exception {
        mockMvc.perform(get("/api/export/project"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"backend-spring-boot.zip\""));
    }

    @Test
    void exportXmiMaintainsBackwardCompatibility() throws Exception {
        DiagramModel model = createSampleDiagram();
        String json = objectMapper.writeValueAsString(model);

        mockMvc.perform(post("/api/export/xmi")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"tienda.xmi\""));
    }

    @Test
    void exportPostmanReturnsJsonAttachment() throws Exception {
        DiagramModel model = createSampleDiagram();
        String json = objectMapper.writeValueAsString(model);

        mockMvc.perform(post("/api/export/postman")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"postman-collection.json\""));
    }

    @Test
    void exportXmiWithRelationsAndNullFieldsSucceeds() throws Exception {
        DiagramModel model = createSampleDiagram();
        com.app.dto.RelationModel rel = new com.app.dto.RelationModel();
        rel.setSourceId(null);
        rel.setTargetId(null);
        rel.setFromName("Producto");
        rel.setToName("Producto");
        rel.setMult("1 a muchos");
        model.getRelations().add(rel);

        String json = objectMapper.writeValueAsString(model);

        mockMvc.perform(post("/api/export/xmi")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"tienda.xmi\""));
    }
}
