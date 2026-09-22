package com.app.services;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class PostmanCollectionService {

    private static final String SCHEMA_V2_1_0 = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
    private static final String DEFAULT_BASE_URL = "http://localhost:8080";

    private final ObjectMapper objectMapper;

    public PostmanCollectionService() {
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    public PostmanCollectionService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper != null
                ? objectMapper.copy().enable(SerializationFeature.INDENT_OUTPUT)
                : new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    /**
     * Genera la colección Postman v2.1.0 completa a partir de un DiagramModel.
     */
    public String generateCollectionJson(DiagramModel diagram) {
        Map<String, Object> collection = new LinkedHashMap<>();

        String collectionName = (diagram != null && diagram.getName() != null && !diagram.getName().isBlank())
                ? diagram.getName().trim()
                : "CaseUmlStudio API";

        // 1. Info block
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("_postman_id", UUID.randomUUID().toString());
        info.put("name", collectionName);
        info.put("description", "Colección de endpoints generada para la arquitectura Spring Boot de " + collectionName);
        info.put("schema", SCHEMA_V2_1_0);
        collection.put("info", info);

        // 2. Folders / Items por cada ClassModel
        List<Map<String, Object>> items = new ArrayList<>();
        if (diagram != null && diagram.getClasses() != null) {
            for (ClassModel cls : diagram.getClasses()) {
                if (cls != null && cls.getName() != null && !cls.getName().isBlank()) {
                    items.add(createEntityFolder(cls));
                }
            }
        }
        collection.put("item", items);

        // 3. Variables de entorno (baseUrl)
        List<Map<String, Object>> variables = new ArrayList<>();
        Map<String, Object> baseUrlVar = new LinkedHashMap<>();
        baseUrlVar.put("key", "baseUrl");
        baseUrlVar.put("value", DEFAULT_BASE_URL);
        baseUrlVar.put("type", "string");
        variables.add(baseUrlVar);
        collection.put("variable", variables);

        try {
            return objectMapper.writeValueAsString(collection);
        } catch (Exception e) {
            throw new RuntimeException("Error al serializar la colección de Postman: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> createEntityFolder(ClassModel cls) {
        Map<String, Object> folder = new LinkedHashMap<>();
        String entityName = cls.getName().trim();
        String resourcePath = toResourceName(entityName);

        folder.put("name", entityName);
        folder.put("description", "Operaciones CRUD para la entidad " + entityName);

        List<Map<String, Object>> requests = new ArrayList<>();
        requests.add(createFindAllRequest(entityName, resourcePath));
        requests.add(createFindByIdRequest(entityName, resourcePath));
        requests.add(createCreateRequest(cls, entityName, resourcePath));
        requests.add(createUpdateRequest(cls, entityName, resourcePath));
        requests.add(createDeleteRequest(entityName, resourcePath));

        folder.put("item", requests);
        return folder;
    }

    private Map<String, Object> createFindAllRequest(String entityName, String resourcePath) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", "Listar todos");

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("method", "GET");
        request.put("header", new ArrayList<>());

        Map<String, Object> url = new LinkedHashMap<>();
        url.put("raw", "{{baseUrl}}/api/" + resourcePath);
        url.put("host", List.of("{{baseUrl}}"));
        url.put("path", List.of("api", resourcePath));
        request.put("url", url);
        request.put("description", "Obtiene la lista completa de registros de " + entityName);

        item.put("request", request);
        item.put("response", new ArrayList<>());
        return item;
    }

    private Map<String, Object> createFindByIdRequest(String entityName, String resourcePath) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", "Obtener por ID");

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("method", "GET");
        request.put("header", new ArrayList<>());

        Map<String, Object> url = new LinkedHashMap<>();
        url.put("raw", "{{baseUrl}}/api/" + resourcePath + "/:id");
        url.put("host", List.of("{{baseUrl}}"));
        url.put("path", List.of("api", resourcePath, ":id"));

        Map<String, Object> variable = new LinkedHashMap<>();
        variable.put("key", "id");
        variable.put("value", "1");
        variable.put("description", "Identificador único de " + entityName);
        url.put("variable", List.of(variable));

        request.put("url", url);
        request.put("description", "Obtiene un registro de " + entityName + " por su ID");

        item.put("request", request);
        item.put("response", new ArrayList<>());
        return item;
    }

    private Map<String, Object> createCreateRequest(ClassModel cls, String entityName, String resourcePath) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", "Crear registro");

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("method", "POST");

        List<Map<String, Object>> headers = new ArrayList<>();
        Map<String, Object> contentTypeHeader = new LinkedHashMap<>();
        contentTypeHeader.put("key", "Content-Type");
        contentTypeHeader.put("value", "application/json");
        contentTypeHeader.put("type", "text");
        headers.add(contentTypeHeader);
        request.put("header", headers);

        // Body raw JSON
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("mode", "raw");
        body.put("raw", buildDummyJsonPayload(cls, false));

        Map<String, Object> options = new LinkedHashMap<>();
        Map<String, Object> rawOptions = new LinkedHashMap<>();
        rawOptions.put("language", "json");
        options.put("raw", rawOptions);
        body.put("options", options);
        request.put("body", body);

        Map<String, Object> url = new LinkedHashMap<>();
        url.put("raw", "{{baseUrl}}/api/" + resourcePath);
        url.put("host", List.of("{{baseUrl}}"));
        url.put("path", List.of("api", resourcePath));
        request.put("url", url);
        request.put("description", "Crea un nuevo registro de " + entityName);

        item.put("request", request);
        item.put("response", new ArrayList<>());
        return item;
    }

    private Map<String, Object> createUpdateRequest(ClassModel cls, String entityName, String resourcePath) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", "Actualizar registro");

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("method", "PUT");

        List<Map<String, Object>> headers = new ArrayList<>();
        Map<String, Object> contentTypeHeader = new LinkedHashMap<>();
        contentTypeHeader.put("key", "Content-Type");
        contentTypeHeader.put("value", "application/json");
        contentTypeHeader.put("type", "text");
        headers.add(contentTypeHeader);
        request.put("header", headers);

        // Body raw JSON
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("mode", "raw");
        body.put("raw", buildDummyJsonPayload(cls, true));

        Map<String, Object> options = new LinkedHashMap<>();
        Map<String, Object> rawOptions = new LinkedHashMap<>();
        rawOptions.put("language", "json");
        options.put("raw", rawOptions);
        body.put("options", options);
        request.put("body", body);

        Map<String, Object> url = new LinkedHashMap<>();
        url.put("raw", "{{baseUrl}}/api/" + resourcePath + "/:id");
        url.put("host", List.of("{{baseUrl}}"));
        url.put("path", List.of("api", resourcePath, ":id"));

        Map<String, Object> variable = new LinkedHashMap<>();
        variable.put("key", "id");
        variable.put("value", "1");
        variable.put("description", "Identificador único de " + entityName + " a actualizar");
        url.put("variable", List.of(variable));

        request.put("url", url);
        request.put("description", "Actualiza un registro existente de " + entityName);

        item.put("request", request);
        item.put("response", new ArrayList<>());
        return item;
    }

    private Map<String, Object> createDeleteRequest(String entityName, String resourcePath) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", "Eliminar registro");

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("method", "DELETE");
        request.put("header", new ArrayList<>());

        Map<String, Object> url = new LinkedHashMap<>();
        url.put("raw", "{{baseUrl}}/api/" + resourcePath + "/:id");
        url.put("host", List.of("{{baseUrl}}"));
        url.put("path", List.of("api", resourcePath, ":id"));

        Map<String, Object> variable = new LinkedHashMap<>();
        variable.put("key", "id");
        variable.put("value", "1");
        variable.put("description", "Identificador único de " + entityName + " a eliminar");
        url.put("variable", List.of(variable));

        request.put("url", url);
        request.put("description", "Elimina un registro de " + entityName + " por su ID");

        item.put("request", request);
        item.put("response", new ArrayList<>());
        return item;
    }

    private String buildDummyJsonPayload(ClassModel cls, boolean isUpdate) {
        Map<String, Object> payload = new LinkedHashMap<>();

        if (cls.getAttrs() != null && !cls.getAttrs().isEmpty()) {
            for (AttrModel attr : cls.getAttrs()) {
                if (attr == null || attr.getName() == null || attr.getName().isBlank()) {
                    continue;
                }
                String attrName = attr.getName().trim();

                // Para POST omitimos id autoincremental de base de datos; para PUT lo incluimos si fue modelado
                if (attrName.equalsIgnoreCase("id")) {
                    if (isUpdate) {
                        payload.put(attrName, 1);
                    }
                    continue;
                }

                Object dummyVal = generateSampleValue(attrName, attr.getType(), isUpdate);
                payload.put(attrName, dummyVal);
            }
        }

        if (payload.isEmpty()) {
            payload.put("nombre", isUpdate ? "Ejemplo Actualizado" : "Ejemplo");
            payload.put("activo", !isUpdate);
        }

        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            return "{}";
        }
    }

    private Object generateSampleValue(String name, String type, boolean isUpdate) {
        String t = type != null ? type.trim().toLowerCase(Locale.ROOT) : "string";
        String n = name != null ? name.trim().toLowerCase(Locale.ROOT) : "";

        if (t.contains("int") || t.equals("long") || t.equals("short") || t.equals("byte") || t.equals("number")) {
            if (n.contains("edad") || n.contains("age")) return isUpdate ? 26 : 25;
            if (n.contains("stock") || n.contains("cantidad") || n.contains("quantity")) return isUpdate ? 150 : 100;
            if (n.contains("anio") || n.contains("year")) return 2026;
            return isUpdate ? 20 : 10;
        } else if (t.contains("double") || t.contains("float") || t.contains("decimal") || t.contains("numeric") || t.contains("real")) {
            if (n.contains("precio") || n.contains("price")) return isUpdate ? 15.5 : 10.5;
            if (n.contains("total") || n.contains("subtotal")) return isUpdate ? 120.0 : 99.5;
            if (n.contains("descuento") || n.contains("discount")) return isUpdate ? 5.0 : 0.0;
            return isUpdate ? 25.5 : 10.5;
        } else if (t.contains("bool")) {
            return !isUpdate; // POST: true, PUT: false
        } else if (t.contains("localdatetime") || t.contains("timestamp")) {
            return isUpdate ? "2026-06-01T15:30:00" : "2026-01-01T10:00:00";
        } else if (t.contains("date") || t.contains("time")) {
            return isUpdate ? "2026-06-01" : "2026-01-01";
        } else {
            // String y variantes
            if (n.contains("nombre") || n.contains("name")) {
                return isUpdate ? "Ejemplo Actualizado" : "Ejemplo";
            }
            if (n.contains("correo") || n.contains("email")) {
                return isUpdate ? "actualizado@ejemplo.com" : "usuario@ejemplo.com";
            }
            if (n.contains("telefono") || n.contains("phone") || n.contains("celular")) {
                return isUpdate ? "+1987654321" : "+1234567890";
            }
            if (n.contains("direccion") || n.contains("address")) {
                return isUpdate ? "Avenida Siempre Viva 742" : "Calle Principal 123";
            }
            if (n.contains("descripcion") || n.contains("description") || n.contains("detalle")) {
                return isUpdate ? "Descripción actualizada" : "Descripción de ejemplo";
            }
            if (n.contains("codigo") || n.contains("code")) {
                return isUpdate ? "COD-999" : "COD-001";
            }
            if (n.contains("estado") || n.contains("status")) {
                return isUpdate ? "INACTIVO" : "ACTIVO";
            }
            return isUpdate ? (name + " Actualizado") : ("Ejemplo " + name);
        }
    }

    public String toResourceName(String className) {
        if (className == null || className.isBlank()) {
            return "items";
        }
        String clean = className.trim()
                .replaceAll("([a-z0-9])([A-Z])", "$1_$2")
                .replaceAll("[^A-Za-z0-9]+", "_")
                .toLowerCase(Locale.ROOT);
        while (clean.startsWith("_")) clean = clean.substring(1);
        while (clean.endsWith("_")) clean = clean.substring(0, clean.length() - 1);
        if (clean.isBlank()) {
            return "items";
        }
        return clean.endsWith("s") ? clean : clean + "s";
    }
}
