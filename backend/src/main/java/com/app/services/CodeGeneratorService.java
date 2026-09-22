package com.app.services;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.dto.RelationModel;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class CodeGeneratorService {

    private static final String JAVA_ROOT = "src/main/java/com/app";
    private static final String ZIP_ROOT = "spring-boot-backend/";

    private final ObjectMapper objectMapper;

    public CodeGeneratorService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper.copy().enable(SerializationFeature.INDENT_OUTPUT);
    }

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CodeGeneratorService.class);

    public byte[] buildZip(DiagramModel model) {
        DiagramModel normalized = normalize(model);
        if (normalized.getClasses().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El diagrama no contiene clases");
        }
        Map<String, String> files = buildProjectFiles(normalized);
        try (ByteArrayOutputStream buffer = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(buffer, StandardCharsets.UTF_8)) {
            for (Map.Entry<String, String> entry : files.entrySet()) {
                if (entry == null || entry.getKey() == null || entry.getKey().isBlank()) {
                    log.warn("[CodeGeneratorService] Saltando entrada ZIP con ruta nula o vacía");
                    continue;
                }
                String safeKey = entry.getKey().replace('\\', '/').replaceAll("^/+", "");
                zip.putNextEntry(new ZipEntry(ZIP_ROOT + safeKey));
                byte[] content = entry.getValue() != null
                        ? entry.getValue().getBytes(StandardCharsets.UTF_8)
                        : new byte[0];
                zip.write(content);
                zip.closeEntry();
            }
            zip.finish();
            return buffer.toByteArray();
        } catch (IOException ex) {
            log.error("[CodeGeneratorService] Error de E/S al empaquetar el ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo empaquetar el ZIP", ex);
        } catch (Exception ex) {
            log.error("[CodeGeneratorService] Error inesperado al generar ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error al generar el ZIP: " + ex.getMessage(), ex);
        }
    }

    public String buildSchemaSql(DiagramModel model) {
        return schemaSql(normalize(model));
    }

    public String buildPostmanJson(DiagramModel model) {
        return generatePostmanCollection(normalize(model));
    }

    private Map<String, String> buildProjectFiles(DiagramModel model) {
        Map<String, String> files = new LinkedHashMap<>();
        files.put("pom.xml", generatedPom());
        files.put("schema.sql", schemaSql(model));
        files.put("postman_collection.json", generatePostmanCollection(model));
        files.put("src/main/resources/application.properties", generatedApplicationProperties());
        files.put(JAVA_ROOT + "/BackendApplication.java", generatedApplicationJava());
        for (ClassModel cls : model.getClasses()) {
            if (cls == null || cls.getName() == null || cls.getName().isBlank()) {
                continue;
            }
            files.put(JAVA_ROOT + "/entities/" + cls.getName() + ".java", entitySource(cls, model));
            files.put(JAVA_ROOT + "/repositories/" + cls.getName() + "Repository.java", repositorySource(cls));
            files.put(JAVA_ROOT + "/services/" + cls.getName() + "Service.java", serviceSource(cls));
            files.put(JAVA_ROOT + "/controllers/" + cls.getName() + "Controller.java", controllerSource(cls));
        }
        return files;
    }

    private DiagramModel normalize(DiagramModel input) {
        DiagramModel model = input == null ? new DiagramModel() : input;
        if (model.getClasses() == null) {
            model.setClasses(new ArrayList<>());
        }
        if (model.getRelations() == null) {
            model.setRelations(new ArrayList<>());
        }
        for (ClassModel cls : model.getClasses()) {
            cls.setName(toPascal(cls.getName()));
            if (cls.getId() == null || cls.getId().isBlank()) {
                cls.setId(cls.getName());
            }
            if (cls.getAttrs() == null) {
                cls.setAttrs(new ArrayList<>());
            }
            boolean hasId = cls.getAttrs().stream()
                    .anyMatch(a -> "id".equalsIgnoreCase(safeName(a.getName())));
            if (!hasId) {
                AttrModel id = new AttrModel();
                id.setName("id");
                id.setType("Long");
                cls.getAttrs().add(0, id);
            }
            for (AttrModel attr : cls.getAttrs()) {
                attr.setName(toCamel(safeName(attr.getName())));
                if (attr.getType() == null || attr.getType().isBlank()) {
                    attr.setType("String");
                }
            }
        }
        for (RelationModel rel : model.getRelations()) {
            if (rel.getMult() == null || rel.getMult().isBlank()) {
                rel.setMult("1..*");
            }
        }
        return model;
    }

    private ClassModel resolveEnd(DiagramModel model, String id, String name) {
        if (id != null && !id.isBlank()) {
            for (ClassModel c : model.getClasses()) {
                if (id.equals(c.getId()) || id.equalsIgnoreCase(c.getName())) {
                    return c;
                }
            }
        }
        if (name == null || name.isBlank()) {
            return null;
        }
        String pascal = toPascal(name);
        for (ClassModel c : model.getClasses()) {
            if (pascal.equalsIgnoreCase(c.getName())) {
                return c;
            }
        }
        return null;
    }

    private record Association(ClassModel one, ClassModel many, RelationModel rel) {
    }

    private Association fkSide(DiagramModel model, RelationModel rel) {
        if ("*..*".equals(rel.getMult()) || rel.getEffectiveIntermediateTable() != null) {
            return null; // Relaciones N:M se materializan en tablas intermedias / puente
        }
        ClassModel from = resolveEnd(model, rel.getFromId(), rel.getFromName());
        ClassModel to = resolveEnd(model, rel.getToId(), rel.getToName());
        if (from == null || to == null) {
            return null;
        }
        if ("*..1".equals(rel.getMult())) {
            return new Association(to, from, rel);
        }
        return new Association(from, to, rel);
    }

    private List<ClassModel> manyToOneOf(ClassModel cls, DiagramModel model) {
        List<ClassModel> result = new ArrayList<>();
        for (RelationModel rel : model.getRelations()) {
            Association assoc = fkSide(model, rel);
            if (assoc != null && assoc.many().getId().equals(cls.getId())) {
                result.add(assoc.one());
            }
        }
        return result;
    }

    private List<ClassModel> oneToManyOf(ClassModel cls, DiagramModel model) {
        List<ClassModel> result = new ArrayList<>();
        for (RelationModel rel : model.getRelations()) {
            Association assoc = fkSide(model, rel);
            if (assoc != null && assoc.one().getId().equals(cls.getId())) {
                result.add(assoc.many());
            }
        }
        return result;
    }

    private String schemaSql(DiagramModel model) {
        StringBuilder sql = new StringBuilder();
        sql.append("-- schema.sql · PostgreSQL · generado desde CASE UML Studio\n");
        sql.append("-- Soporte formal UML: Composición (CASCADE), Agregación, Herencia y N:M\n\n");

        for (ClassModel cls : model.getClasses()) {
            List<String> cols = new ArrayList<>();
            cols.add("  id BIGSERIAL PRIMARY KEY");
            for (AttrModel attr : cls.getAttrs()) {
                if ("id".equalsIgnoreCase(attr.getName())) {
                    continue;
                }
                cols.add("  " + toSnake(attr.getName()) + " " + sqlType(attr.getType()) + " NOT NULL");
            }
            for (ClassModel one : manyToOneOf(cls, model)) {
                cols.add("  " + tableName(one.getName()) + "_id BIGINT NOT NULL");
            }
            sql.append("CREATE TABLE IF NOT EXISTS ").append(tableName(cls.getName())).append(" (\n");
            sql.append(String.join(",\n", cols)).append("\n);\n\n");
        }

        // Tablas intermedias para relaciones N:M (*..*)
        for (RelationModel rel : model.getRelations()) {
            if ("*..*".equals(rel.getMult()) || rel.getEffectiveIntermediateTable() != null) {
                ClassModel from = resolveEnd(model, rel.getFromId(), rel.getFromName());
                ClassModel to = resolveEnd(model, rel.getToId(), rel.getToName());
                if (from == null || to == null) continue;

                String junctionName = toSnake(rel.getEffectiveIntermediateTable() != null
                        ? rel.getEffectiveIntermediateTable()
                        : from.getName() + "_" + to.getName());
                String fromFk = tableName(from.getName()) + "_id";
                String toFk = tableName(to.getName()) + "_id";

                sql.append("-- Tabla intermedia (puente N:M) para relación ")
                        .append(from.getName()).append(" <-> ").append(to.getName()).append("\n");
                sql.append("CREATE TABLE IF NOT EXISTS ").append(junctionName).append(" (\n")
                        .append("  ").append(fromFk).append(" BIGINT NOT NULL,\n")
                        .append("  ").append(toFk).append(" BIGINT NOT NULL,\n")
                        .append("  created_at TIMESTAMPTZ DEFAULT NOW(),\n")
                        .append("  PRIMARY KEY (").append(fromFk).append(", ").append(toFk).append("),\n")
                        .append("  CONSTRAINT fk_").append(junctionName).append("_").append(tableName(from.getName()))
                        .append(" FOREIGN KEY (").append(fromFk).append(") REFERENCES ").append(tableName(from.getName()))
                        .append("(id) ON DELETE CASCADE,\n")
                        .append("  CONSTRAINT fk_").append(junctionName).append("_").append(tableName(to.getName()))
                        .append(" FOREIGN KEY (").append(toFk).append(") REFERENCES ").append(tableName(to.getName()))
                        .append("(id) ON DELETE CASCADE\n")
                        .append(");\n\n");
            }
        }

        // Foreign keys para relaciones 1..* / composición / agregación / herencia
        for (RelationModel rel : model.getRelations()) {
            Association assoc = fkSide(model, rel);
            if (assoc == null) continue;

            String manyTable = tableName(assoc.many().getName());
            String oneTable = tableName(assoc.one().getName());
            String relType = rel.getEffectiveRelationType();

            String cascadeRule = switch (relType) {
                case "composition", "inheritance" -> " ON DELETE CASCADE";
                case "aggregation" -> " ON DELETE SET NULL";
                default -> " ON DELETE RESTRICT";
            };

            sql.append("ALTER TABLE ").append(manyTable)
                    .append(" ADD CONSTRAINT fk_").append(manyTable).append("_").append(oneTable)
                    .append(" FOREIGN KEY (").append(oneTable).append("_id) REFERENCES ")
                    .append(oneTable).append("(id)")
                    .append(cascadeRule)
                    .append(";\n");
        }

        return sql.toString();
    }

    private String entitySource(ClassModel cls, DiagramModel model) {
        List<ClassModel> manyToOne = manyToOneOf(cls, model);
        List<ClassModel> oneToMany = oneToManyOf(cls, model);
        StringBuilder fields = new StringBuilder();
        fields.append("    @Id\n")
                .append("    @GeneratedValue(strategy = GenerationType.IDENTITY)\n")
                .append("    private Long id;\n");
        for (AttrModel attr : cls.getAttrs()) {
            if ("id".equals(attr.getName())) {
                continue;
            }
            fields.append("\n    private ").append(javaType(attr.getType()))
                    .append(" ").append(attr.getName()).append(";\n");
        }
        for (ClassModel one : manyToOne) {
            fields.append("\n    @ManyToOne(optional = false)\n")
                    .append("    @JoinColumn(name = \"").append(tableName(one.getName())).append("_id\")\n")
                    .append("    private ").append(one.getName()).append(" ")
                    .append(toCamel(one.getName())).append(";\n");
        }
        for (ClassModel many : oneToMany) {
            fields.append("\n    @OneToMany(mappedBy = \"").append(toCamel(cls.getName())).append("\")\n")
                    .append("    private List<").append(many.getName()).append("> ")
                    .append(toCamel(many.getName())).append("List = new ArrayList<>();\n");
        }
        return "package com.app.entities;\n\n"
                + entityImports(cls, manyToOne, oneToMany)
                + "\n\n@Getter\n@Setter\n@NoArgsConstructor\n@Entity\n@Table(name = \""
                + tableName(cls.getName())
                + "\")\npublic class "
                + cls.getName()
                + " {\n\n"
                + fields
                + "}\n";
    }

    private String entityImports(ClassModel cls, List<ClassModel> manyToOne, List<ClassModel> oneToMany) {
        TreeSet<String> imports = new TreeSet<>();
        imports.add("import jakarta.persistence.Entity;");
        imports.add("import jakarta.persistence.GeneratedValue;");
        imports.add("import jakarta.persistence.GenerationType;");
        imports.add("import jakarta.persistence.Id;");
        imports.add("import jakarta.persistence.Table;");
        imports.add("import lombok.Getter;");
        imports.add("import lombok.NoArgsConstructor;");
        imports.add("import lombok.Setter;");
        if (!manyToOne.isEmpty()) {
            imports.add("import jakarta.persistence.JoinColumn;");
            imports.add("import jakarta.persistence.ManyToOne;");
        }
        if (!oneToMany.isEmpty()) {
            imports.add("import jakarta.persistence.OneToMany;");
            imports.add("import java.util.ArrayList;");
            imports.add("import java.util.List;");
        }
        for (AttrModel attr : cls.getAttrs()) {
            String type = javaType(attr.getType());
            if ("LocalDate".equals(type)) {
                imports.add("import java.time.LocalDate;");
            }
            if ("LocalDateTime".equals(type)) {
                imports.add("import java.time.LocalDateTime;");
            }
            if ("BigDecimal".equals(type)) {
                imports.add("import java.math.BigDecimal;");
            }
        }
        return String.join("\n", imports);
    }

    private String repositorySource(ClassModel cls) {
        String t = cls.getName();
        return "package com.app.repositories;\n\n"
                + "import com.app.entities." + t + ";\n"
                + "import org.springframework.data.jpa.repository.JpaRepository;\n"
                + "import org.springframework.stereotype.Repository;\n\n"
                + "@Repository\n"
                + "public interface " + t + "Repository extends JpaRepository<" + t + ", Long> {\n"
                + "}\n";
    }

    private String serviceSource(ClassModel cls) {
        String t = cls.getName();
        return "package com.app.services;\n\n"
                + "import com.app.entities." + t + ";\n"
                + "import com.app.repositories." + t + "Repository;\n"
                + "import org.springframework.stereotype.Service;\n"
                + "import java.util.List;\n"
                + "import java.util.Optional;\n\n"
                + "@Service\n"
                + "public class " + t + "Service {\n\n"
                + "    private final " + t + "Repository repository;\n\n"
                + "    public " + t + "Service(" + t + "Repository repository) {\n"
                + "        this.repository = repository;\n"
                + "    }\n\n"
                + "    public List<" + t + "> findAll() {\n"
                + "        return repository.findAll();\n"
                + "    }\n\n"
                + "    public Optional<" + t + "> findById(Long id) {\n"
                + "        return repository.findById(id);\n"
                + "    }\n\n"
                + "    public " + t + " save(" + t + " entity) {\n"
                + "        return repository.save(entity);\n"
                + "    }\n\n"
                + "    public void delete(Long id) {\n"
                + "        repository.deleteById(id);\n"
                + "    }\n"
                + "}\n";
    }

    private String controllerSource(ClassModel cls) {
        String t = cls.getName();
        String path = apiPath(t);
        return "package com.app.controllers;\n\n"
                + "import com.app.entities." + t + ";\n"
                + "import com.app.services." + t + "Service;\n"
                + "import org.springframework.http.HttpStatus;\n"
                + "import org.springframework.http.ResponseEntity;\n"
                + "import org.springframework.web.bind.annotation.CrossOrigin;\n"
                + "import org.springframework.web.bind.annotation.DeleteMapping;\n"
                + "import org.springframework.web.bind.annotation.GetMapping;\n"
                + "import org.springframework.web.bind.annotation.PathVariable;\n"
                + "import org.springframework.web.bind.annotation.PostMapping;\n"
                + "import org.springframework.web.bind.annotation.PutMapping;\n"
                + "import org.springframework.web.bind.annotation.RequestBody;\n"
                + "import org.springframework.web.bind.annotation.RequestMapping;\n"
                + "import org.springframework.web.bind.annotation.RestController;\n"
                + "import java.util.List;\n\n"
                + "@RestController\n"
                + "@RequestMapping(\"" + path + "\")\n"
                + "@CrossOrigin(\"*\")\n"
                + "public class " + t + "Controller {\n\n"
                + "    private final " + t + "Service service;\n\n"
                + "    public " + t + "Controller(" + t + "Service service) {\n"
                + "        this.service = service;\n"
                + "    }\n\n"
                + "    @GetMapping\n"
                + "    public ResponseEntity<List<" + t + ">> findAll() {\n"
                + "        return ResponseEntity.ok(service.findAll());\n"
                + "    }\n\n"
                + "    @GetMapping(\"/{id}\")\n"
                + "    public ResponseEntity<" + t + "> findById(@PathVariable Long id) {\n"
                + "        return service.findById(id)\n"
                + "                .map(ResponseEntity::ok)\n"
                + "                .orElseGet(() -> ResponseEntity.notFound().build());\n"
                + "    }\n\n"
                + "    @PostMapping\n"
                + "    public ResponseEntity<" + t + "> create(@RequestBody " + t + " body) {\n"
                + "        " + t + " saved = service.save(body);\n"
                + "        return ResponseEntity.status(HttpStatus.CREATED).body(saved);\n"
                + "    }\n\n"
                + "    @PutMapping(\"/{id}\")\n"
                + "    public ResponseEntity<" + t + "> update(@PathVariable Long id, @RequestBody " + t + " body) {\n"
                + "        if (service.findById(id).isEmpty()) {\n"
                + "            return ResponseEntity.notFound().build();\n"
                + "        }\n"
                + "        body.setId(id);\n"
                + "        return ResponseEntity.ok(service.save(body));\n"
                + "    }\n\n"
                + "    @DeleteMapping(\"/{id}\")\n"
                + "    public ResponseEntity<Void> delete(@PathVariable Long id) {\n"
                + "        if (service.findById(id).isEmpty()) {\n"
                + "            return ResponseEntity.notFound().build();\n"
                + "        }\n"
                + "        service.delete(id);\n"
                + "        return ResponseEntity.noContent().build();\n"
                + "    }\n"
                + "}\n";
    }

    private String generatedPom() {
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <project xmlns="http://maven.apache.org/POM/4.0.0"
                         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
                  <modelVersion>4.0.0</modelVersion>
                  <parent>
                    <groupId>org.springframework.boot</groupId>
                    <artifactId>spring-boot-starter-parent</artifactId>
                    <version>3.3.3</version>
                    <relativePath/>
                  </parent>
                  <groupId>com.app</groupId>
                  <artifactId>spring-boot-backend</artifactId>
                  <version>1.0.0</version>
                  <name>spring-boot-backend</name>
                  <description>Backend Spring Boot generado desde CASE UML Studio</description>
                  <properties>
                    <java.version>17</java.version>
                  </properties>
                  <dependencies>
                    <dependency>
                      <groupId>org.springframework.boot</groupId>
                      <artifactId>spring-boot-starter-web</artifactId>
                    </dependency>
                    <dependency>
                      <groupId>org.springframework.boot</groupId>
                      <artifactId>spring-boot-starter-data-jpa</artifactId>
                    </dependency>
                    <dependency>
                      <groupId>org.springdoc</groupId>
                      <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
                      <version>2.3.0</version>
                    </dependency>
                    <dependency>
                      <groupId>org.postgresql</groupId>
                      <artifactId>postgresql</artifactId>
                      <scope>runtime</scope>
                    </dependency>
                    <dependency>
                      <groupId>org.projectlombok</groupId>
                      <artifactId>lombok</artifactId>
                      <optional>true</optional>
                    </dependency>
                  </dependencies>
                  <build>
                    <plugins>
                      <plugin>
                        <groupId>org.springframework.boot</groupId>
                        <artifactId>spring-boot-maven-plugin</artifactId>
                      </plugin>
                    </plugins>
                  </build>
                </project>
                """;
    }

    private String generatedApplicationProperties() {
        return """
                server.port=8080
                spring.datasource.url=${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/appdb}
                spring.datasource.username=${SPRING_DATASOURCE_USERNAME:postgres}
                spring.datasource.password=${SPRING_DATASOURCE_PASSWORD:postgres}
                spring.datasource.driver-class-name=org.postgresql.Driver
                spring.jpa.hibernate.ddl-auto=update
                spring.jpa.show-sql=true
                spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
                spring.jpa.open-in-view=false
                """;
    }

    private String generatedApplicationJava() {
        return """
                package com.app;

                import org.springframework.boot.SpringApplication;
                import org.springframework.boot.autoconfigure.SpringBootApplication;

                @SpringBootApplication
                public class BackendApplication {

                    public static void main(String[] args) {
                        SpringApplication.run(BackendApplication.class, args);
                    }
                }
                """;
    }

    private String generatePostmanCollection(DiagramModel diagram) {
        try {
            return objectMapper.writeValueAsString(postmanCollection(diagram));
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo generar Postman");
        }
    }

    private Map<String, Object> postmanCollection(DiagramModel model) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (ClassModel cls : model.getClasses()) {
            List<String> base = List.of("api", resourceName(cls.getName()));
            List<Map<String, Object>> requests = new ArrayList<>();
            requests.add(request("GET all " + cls.getName(), "GET", base, null));
            requests.add(request("GET " + cls.getName() + " by ID", "GET", concat(base, ":id"), null));
            requests.add(request("POST " + cls.getName(), "POST", base, sampleBody(cls, model)));
            requests.add(request("PUT " + cls.getName(), "PUT", concat(base, ":id"), sampleBody(cls, model)));
            requests.add(request("DELETE " + cls.getName(), "DELETE", concat(base, ":id"), null));
            Map<String, Object> folder = new LinkedHashMap<>();
            folder.put("name", cls.getName());
            folder.put("item", requests);
            items.add(folder);
        }
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("name", "CASE UML 2.5 API");
        info.put("schema", "https://schema.getpostman.com/json/collection/v2.1.0/collection.json");
        Map<String, Object> collection = new LinkedHashMap<>();
        collection.put("info", info);
        collection.put("item", items);
        return collection;
    }

    private Map<String, Object> request(String name, String method, List<String> path, Map<String, Object> body) {
        Map<String, Object> url = new LinkedHashMap<>();
        url.put("raw", "http://localhost:8080/" + String.join("/", path));
        url.put("protocol", "http");
        url.put("host", List.of("localhost"));
        url.put("port", "8080");
        url.put("path", path);
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("method", method);
        if (body != null) {
            req.put("header", List.of(Map.of("key", "Content-Type", "value", "application/json")));
            req.put("body", Map.of("mode", "raw", "raw", pretty(body)));
        } else {
            req.put("header", List.of());
        }
        req.put("url", url);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", name);
        item.put("request", req);
        return item;
    }

    private Map<String, Object> sampleBody(ClassModel cls, DiagramModel model) {
        Map<String, Object> sample = new LinkedHashMap<>();
        for (AttrModel attr : cls.getAttrs()) {
            if ("id".equals(attr.getName())) {
                continue;
            }
            String type = javaType(attr.getType());
            if (List.of("Long", "Integer", "Double", "BigDecimal").contains(type)) {
                sample.put(attr.getName(), 0);
            } else if ("Boolean".equals(type)) {
                sample.put(attr.getName(), false);
            } else if ("LocalDate".equals(type)) {
                sample.put(attr.getName(), "2026-01-15");
            } else if ("LocalDateTime".equals(type)) {
                sample.put(attr.getName(), "2026-01-15T10:00:00");
            } else {
                sample.put(attr.getName(), "");
            }
        }
        for (ClassModel one : manyToOneOf(cls, model)) {
            sample.put(toCamel(one.getName()), Map.of("id", 1));
        }
        return sample;
    }

    private String pretty(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            return "{}";
        }
    }

    private List<String> concat(List<String> base, String extra) {
        List<String> copy = new ArrayList<>(base);
        copy.add(extra);
        return copy;
    }

    private String javaType(String raw) {
        if (raw == null || raw.isBlank()) {
            return "String";
        }
        String key = raw.trim().toLowerCase(Locale.ROOT);
        return switch (key) {
            case "long" -> "Long";
            case "int", "integer" -> "Integer";
            case "bool", "boolean" -> "Boolean";
            case "date", "localdate" -> "LocalDate";
            case "datetime", "localdatetime" -> "LocalDateTime";
            case "bigdecimal" -> "BigDecimal";
            case "double", "float" -> "Double";
            case "string" -> "String";
            default -> Character.isLowerCase(raw.trim().charAt(0)) ? toPascal(raw) : raw.trim();
        };
    }

    private String sqlType(String raw) {
        return switch (javaType(raw)) {
            case "Long", "Integer" -> "BIGINT";
            case "Boolean" -> "BOOLEAN";
            case "LocalDate" -> "DATE";
            case "LocalDateTime" -> "TIMESTAMPTZ";
            case "BigDecimal", "Double" -> "NUMERIC(14,2)";
            default -> "TEXT";
        };
    }

    private String resourceName(String name) {
        String kebab = toSnake(name).replace('_', '-');
        return kebab.endsWith("s") ? kebab : kebab + "s";
    }

    private String apiPath(String name) {
        return "/api/" + resourceName(name);
    }

    private String tableName(String name) {
        return toSnake(name);
    }

    private String toPascal(String raw) {
        String[] parts = safeName(raw).split("[^A-Za-z0-9]+");
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (part.isBlank()) {
                continue;
            }
            out.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                out.append(part.substring(1));
            }
        }
        return out.isEmpty() ? "Clase" : out.toString();
    }

    private String toCamel(String raw) {
        String pascal = toPascal(raw);
        return Character.toLowerCase(pascal.charAt(0)) + pascal.substring(1);
    }

    private String toSnake(String name) {
        return name.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase(Locale.ROOT);
    }

    private String safeName(String raw) {
        return raw == null ? "" : raw.trim();
    }
}
