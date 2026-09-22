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

    @Test
    void buildProjectZipWithManyToManyIntermediateClass() throws Exception {
        DiagramModel model = new DiagramModel();

        ClassModel docente = new ClassModel();
        docente.setId("cls_doc");
        docente.setName("Docente");
        model.getClasses().add(docente);

        ClassModel tribunal = new ClassModel();
        tribunal.setId("cls_trib");
        tribunal.setName("Tribunal");
        model.getClasses().add(tribunal);

        RelationModel nmRel = new RelationModel();
        nmRel.setFromId("cls_doc");
        nmRel.setFromName("Docente");
        nmRel.setToId("cls_trib");
        nmRel.setToName("Tribunal");
        nmRel.setSourceMultiplicity("0..*");
        nmRel.setTargetMultiplicity("1..*");
        nmRel.setMult("0..*..1..*");
        nmRel.setIntermediateClassName("Detalle_DocTrib");
        model.getRelations().add(nmRel);

        CodeGeneratorService generator = new CodeGeneratorService(new ObjectMapper());
        byte[] zipBytes = generator.buildZip(model);
        assertNotNull(zipBytes);

        Map<String, String> files = new HashMap<>();
        try (java.util.zip.ZipInputStream in = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(zipBytes), java.nio.charset.StandardCharsets.UTF_8)) {
            java.util.zip.ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                byte[] content = in.readAllBytes();
                files.put(entry.getName().replace("spring-boot-backend/", ""), new String(content, java.nio.charset.StandardCharsets.UTF_8));
            }
        }

        // Entity Detalle_DocTrib
        assertTrue(files.containsKey("src/main/java/com/app/entities/Detalle_DocTrib.java"), "Debe generar la entidad Detalle_DocTrib");
        String detalleSource = files.get("src/main/java/com/app/entities/Detalle_DocTrib.java");
        assertTrue(detalleSource.contains("private Long id;"), "Debe tener PK surrogate id Long");
        assertTrue(detalleSource.contains("@ManyToOne"), "Debe tener anotación @ManyToOne");
        assertTrue(detalleSource.contains("private Docente docente;"), "Debe tener relación hacia Docente");
        assertTrue(detalleSource.contains("private Tribunal tribunal;"), "Debe tener relación hacia Tribunal");

        // Parents with @OneToMany
        String docenteSource = files.get("src/main/java/com/app/entities/Docente.java");
        assertTrue(docenteSource.contains("@OneToMany(mappedBy = \"docente\")"), "Docente debe tener mappedBy = docente");
        assertTrue(docenteSource.contains("List<Detalle_DocTrib>"), "Docente debe tener lista de Detalle_DocTrib");

        String tribunalSource = files.get("src/main/java/com/app/entities/Tribunal.java");
        assertTrue(tribunalSource.contains("@OneToMany(mappedBy = \"tribunal\")"), "Tribunal debe tener mappedBy = tribunal");
        assertTrue(tribunalSource.contains("List<Detalle_DocTrib>"), "Tribunal debe tener lista de Detalle_DocTrib");

        // SQL Schema
        String sql = files.get("schema.sql");
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS detalle_doc_trib"), "schema.sql debe crear tabla detalle_doc_trib");
        assertTrue(sql.contains("docente_id BIGINT NOT NULL"));
        assertTrue(sql.contains("tribunal_id BIGINT NOT NULL"));
        assertTrue(sql.contains("fk_detalle_doc_trib_docente") && sql.contains("ON DELETE CASCADE"));
        assertTrue(sql.contains("fk_detalle_doc_trib_tribunal") && sql.contains("ON DELETE CASCADE"));
    }
}
