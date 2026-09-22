package com.app.services;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PostmanCollectionServiceTest {

    private PostmanCollectionService service;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = new PostmanCollectionService();
    }

    private DiagramModel createSampleDiagram() {
        DiagramModel diagram = new DiagramModel();
        diagram.setName("TiendaOnline");

        ClassModel producto = new ClassModel();
        producto.setName("Producto");

        AttrModel idAttr = new AttrModel();
        idAttr.setName("id");
        idAttr.setType("Long");
        producto.getAttrs().add(idAttr);

        AttrModel nombreAttr = new AttrModel();
        nombreAttr.setName("nombre");
        nombreAttr.setType("String");
        producto.getAttrs().add(nombreAttr);

        AttrModel precioAttr = new AttrModel();
        precioAttr.setName("precio");
        precioAttr.setType("Double");
        producto.getAttrs().add(precioAttr);

        AttrModel activoAttr = new AttrModel();
        activoAttr.setName("activo");
        activoAttr.setType("Boolean");
        producto.getAttrs().add(activoAttr);

        diagram.getClasses().add(producto);
        return diagram;
    }

    @Test
    void generatesValidPostmanCollectionV210() throws Exception {
        DiagramModel diagram = createSampleDiagram();
        String jsonOutput = service.generateCollectionJson(diagram);

        assertNotNull(jsonOutput);
        JsonNode root = objectMapper.readTree(jsonOutput);

        // Schema y Metadata
        assertEquals("https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                root.path("info").path("schema").asText());
        assertEquals("TiendaOnline", root.path("info").path("name").asText());
        assertFalse(root.path("info").path("_postman_id").asText().isBlank());

        // Variable baseUrl
        JsonNode variables = root.path("variable");
        assertTrue(variables.isArray());
        assertEquals("baseUrl", variables.get(0).path("key").asText());
        assertEquals("http://localhost:8080", variables.get(0).path("value").asText());

        // Folder de clase Producto
        JsonNode items = root.path("item");
        assertEquals(1, items.size());
        JsonNode productoFolder = items.get(0);
        assertEquals("Producto", productoFolder.path("name").asText());

        // 5 Requests CRUD
        JsonNode requests = productoFolder.path("item");
        assertEquals(5, requests.size());

        // 1. GET /api/productos (Listar todos)
        JsonNode getList = requests.get(0);
        assertEquals("Listar todos", getList.path("name").asText());
        assertEquals("GET", getList.path("request").path("method").asText());
        assertEquals("{{baseUrl}}/api/productos", getList.path("request").path("url").path("raw").asText());

        // 2. GET /api/productos/:id (Obtener por ID)
        JsonNode getById = requests.get(1);
        assertEquals("Obtener por ID", getById.path("name").asText());
        assertEquals("GET", getById.path("request").path("method").asText());
        assertEquals("{{baseUrl}}/api/productos/:id", getById.path("request").path("url").path("raw").asText());
        assertEquals("id", getById.path("request").path("url").path("variable").get(0).path("key").asText());
        assertEquals("1", getById.path("request").path("url").path("variable").get(0).path("value").asText());

        // 3. POST /api/productos (Crear registro con dummy data)
        JsonNode postReq = requests.get(2);
        assertEquals("Crear registro", postReq.path("name").asText());
        assertEquals("POST", postReq.path("request").path("method").asText());
        assertEquals("{{baseUrl}}/api/productos", postReq.path("request").path("url").path("raw").asText());

        String postBodyRaw = postReq.path("request").path("body").path("raw").asText();
        assertNotNull(postBodyRaw);
        JsonNode postBodyJson = objectMapper.readTree(postBodyRaw);
        assertEquals("Ejemplo", postBodyJson.path("nombre").asText());
        assertEquals(10.5, postBodyJson.path("precio").asDouble());
        assertTrue(postBodyJson.path("activo").asBoolean());
        // id autoincremental no debe estar en el body de creación
        assertFalse(postBodyJson.has("id"));

        // 4. PUT /api/productos/:id (Actualizar registro)
        JsonNode putReq = requests.get(3);
        assertEquals("Actualizar registro", putReq.path("name").asText());
        assertEquals("PUT", putReq.path("request").path("method").asText());
        assertEquals("{{baseUrl}}/api/productos/:id", putReq.path("request").path("url").path("raw").asText());
        String putBodyRaw = putReq.path("request").path("body").path("raw").asText();
        JsonNode putBodyJson = objectMapper.readTree(putBodyRaw);
        assertEquals("Ejemplo Actualizado", putBodyJson.path("nombre").asText());
        assertEquals(15.5, putBodyJson.path("precio").asDouble());
        assertFalse(putBodyJson.path("activo").asBoolean());

        // 5. DELETE /api/productos/:id (Eliminar registro)
        JsonNode deleteReq = requests.get(4);
        assertEquals("Eliminar registro", deleteReq.path("name").asText());
        assertEquals("DELETE", deleteReq.path("request").path("method").asText());
        assertEquals("{{baseUrl}}/api/productos/:id", deleteReq.path("request").path("url").path("raw").asText());
    }

    @Test
    void handlesEmptyDiagramGracefully() throws Exception {
        DiagramModel empty = new DiagramModel();
        String jsonOutput = service.generateCollectionJson(empty);

        assertNotNull(jsonOutput);
        JsonNode root = objectMapper.readTree(jsonOutput);
        assertEquals("CaseUmlStudio API", root.path("info").path("name").asText());
        assertEquals(0, root.path("item").size());
    }
}
