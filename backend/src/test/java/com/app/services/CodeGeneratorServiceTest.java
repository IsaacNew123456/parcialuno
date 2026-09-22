package com.app.services;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.dto.RelationModel;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CodeGeneratorServiceTest {

    private DiagramModel createSampleDiagram() {
        DiagramModel model = new DiagramModel();
        model.setName("demo");

        ClassModel cliente = new ClassModel();
        cliente.setName("Cliente");
        AttrModel email = new AttrModel();
        email.setName("email");
        email.setType("String");
        cliente.getAttrs().add(email);

        ClassModel pedido = new ClassModel();
        pedido.setName("Pedido");
        AttrModel total = new AttrModel();
        total.setName("total");
        total.setType("BigDecimal");
        pedido.getAttrs().add(total);

        model.getClasses().add(cliente);
        model.getClasses().add(pedido);

        RelationModel rel = new RelationModel();
        rel.setFromName("Cliente");
        rel.setToName("Pedido");
        rel.setMult("1..*");
        model.getRelations().add(rel);

        return model;
    }

    @Test
    void buildZipIncludesMavenLayoutAndFourLayersAndSwaggerAndPostman() throws Exception {
        DiagramModel model = createSampleDiagram();
        CodeGeneratorService generator = new CodeGeneratorService(new ObjectMapper());
        byte[] zip = generator.buildZip(model);

        Map<String, String> files = new HashMap<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                byte[] content = in.readAllBytes();
                files.put(entry.getName(), new String(content, StandardCharsets.UTF_8));
            }
        }

        assertTrue(files.containsKey("spring-boot-backend/pom.xml"));
        assertTrue(files.containsKey("spring-boot-backend/schema.sql"));
        assertTrue(files.containsKey("spring-boot-backend/postman_collection.json"));
        assertTrue(files.containsKey("spring-boot-backend/src/main/resources/application.properties"));
        assertTrue(files.containsKey("spring-boot-backend/src/main/java/com/app/BackendApplication.java"));
        assertTrue(files.containsKey("spring-boot-backend/src/main/java/com/app/entities/Cliente.java"));
        assertTrue(files.containsKey("spring-boot-backend/src/main/java/com/app/repositories/PedidoRepository.java"));
        assertTrue(files.containsKey("spring-boot-backend/src/main/java/com/app/services/PedidoService.java"));
        assertTrue(files.containsKey("spring-boot-backend/src/main/java/com/app/controllers/PedidoController.java"));

        // Check springdoc OpenAPI dependency in generated pom.xml
        String pom = files.get("spring-boot-backend/pom.xml");
        assertTrue(pom.contains("springdoc-openapi-starter-webmvc-ui"));
        assertTrue(pom.contains("<version>2.3.0</version>"));

        // Check generated controller has PUT method
        String pedidoController = files.get("spring-boot-backend/src/main/java/com/app/controllers/PedidoController.java");
        assertTrue(pedidoController.contains("@PutMapping(\"/{id}\")"));
        assertTrue(pedidoController.contains("public ResponseEntity<Pedido> update(@PathVariable Long id, @RequestBody Pedido body)"));
    }

    @Test
    void generatePostmanCollectionIncludesCrudEndpointsAndSamplePayloads() throws Exception {
        DiagramModel model = createSampleDiagram();
        ObjectMapper objectMapper = new ObjectMapper();
        CodeGeneratorService generator = new CodeGeneratorService(objectMapper);

        String postmanJson = generator.buildPostmanJson(model);
        assertNotNull(postmanJson);

        JsonNode root = objectMapper.readTree(postmanJson);
        assertEquals("https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                root.path("info").path("schema").asText());

        JsonNode items = root.path("item");
        assertEquals(2, items.size());

        // Check Cliente folder
        JsonNode clienteFolder = items.get(0);
        assertEquals("Cliente", clienteFolder.path("name").asText());
        JsonNode clienteRequests = clienteFolder.path("item");
        assertEquals(5, clienteRequests.size());

        Set<String> methods = new HashSet<>();
        for (JsonNode reqItem : clienteRequests) {
            String method = reqItem.path("request").path("method").asText();
            methods.add(method);
            if ("POST".equals(method) || "PUT".equals(method)) {
                JsonNode body = reqItem.path("request").path("body");
                assertEquals("raw", body.path("mode").asText());
                String rawContent = body.path("raw").asText();
                assertTrue(rawContent.contains("email"));
            }
        }

        assertTrue(methods.contains("GET"));
        assertTrue(methods.contains("POST"));
        assertTrue(methods.contains("PUT"));
        assertTrue(methods.contains("DELETE"));
    }

    @Test
    void buildSchemaSqlWithAdvancedUmlRelations() {
        DiagramModel model = new DiagramModel();
        model.setName("universidad");

        ClassModel pedido = new ClassModel();
        pedido.setName("Pedido");
        model.getClasses().add(pedido);

        ClassModel detalle = new ClassModel();
        detalle.setName("DetallePedido");
        model.getClasses().add(detalle);

        ClassModel estudiante = new ClassModel();
        estudiante.setName("Estudiante");
        model.getClasses().add(estudiante);

        ClassModel curso = new ClassModel();
        curso.setName("Curso");
        model.getClasses().add(curso);

        // 1. Composición: Pedido -> DetallePedido (ON DELETE CASCADE)
        RelationModel compRel = new RelationModel();
        compRel.setFromName("Pedido");
        compRel.setToName("DetallePedido");
        compRel.setRelationType("composition");
        compRel.setMult("1..*");
        model.getRelations().add(compRel);

        // 2. N:M: Estudiante <-> Curso (Tabla intermedia estudiante_curso)
        RelationModel nmRel = new RelationModel();
        nmRel.setFromName("Estudiante");
        nmRel.setToName("Curso");
        nmRel.setMult("*..*");
        nmRel.setIntermediateTable("estudiante_curso");
        model.getRelations().add(nmRel);

        CodeGeneratorService generator = new CodeGeneratorService(new ObjectMapper());
        String sql = generator.buildSchemaSql(model);

        // Assert composition cascade
        assertTrue(sql.contains("fk_detalle_pedido_pedido"));
        assertTrue(sql.contains("ON DELETE CASCADE"));

        // Assert junction table
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS estudiante_curso"));
        assertTrue(sql.contains("PRIMARY KEY (estudiante_id, curso_id)"));
        assertTrue(sql.contains("CONSTRAINT fk_estudiante_curso_estudiante"));
        assertTrue(sql.contains("CONSTRAINT fk_estudiante_curso_curso"));
    }
}
