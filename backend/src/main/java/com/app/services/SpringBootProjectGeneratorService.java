package com.app.services;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.dto.RelationModel;
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
import java.util.Set;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class SpringBootProjectGeneratorService {

    private static final String BASE_PACKAGE = "com.example.generated";
    private static final String JAVA_BASE_DIR = "src/main/java/com/example/generated/";
    private static final String RESOURCES_DIR = "src/main/resources/";

    private final NormalizationService normalizationService;

    public SpringBootProjectGeneratorService() {
        this(new NormalizationService());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public SpringBootProjectGeneratorService(NormalizationService normalizationService) {
        this.normalizationService = normalizationService != null ? normalizationService : new NormalizationService();
    }

    private static final Set<String> JAVA_KEYWORDS = Set.of(
            "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
            "class", "const", "continue", "default", "do", "double", "else", "enum",
            "extends", "final", "finally", "float", "for", "goto", "if", "implements",
            "import", "instanceof", "int", "interface", "long", "native", "new",
            "package", "private", "protected", "public", "return", "short", "static",
            "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
            "transient", "try", "void", "volatile", "while", "record", "yield", "var"
    );

    private static final Set<String> SQL_KEYWORDS = Set.of(
            "user", "order", "group", "table", "select", "where", "from", "join",
            "limit", "primary", "check", "column", "desc", "asc", "all", "and",
            "any", "as", "by", "case", "cast", "create", "database", "delete",
            "drop", "else", "end", "except", "exists", "foreign", "having", "in",
            "index", "insert", "intersect", "into", "is", "key", "like", "not",
            "null", "or", "references", "schema", "set", "then", "to", "union",
            "unique", "update", "values", "when", "with", "offset", "status", "type", "role"
    );

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SpringBootProjectGeneratorService.class);

    public byte[] generateProjectZip(DiagramModel model) {
        DiagramModel preNormalized = normalizationService.normalize(model);
        DiagramModel normalized = normalize(preNormalized);
        if (normalized.getClasses().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El diagrama no contiene clases");
        }

        Map<String, String> files = buildProjectFiles(normalized);

        try (ByteArrayOutputStream buffer = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(buffer, StandardCharsets.UTF_8)) {
            for (Map.Entry<String, String> entry : files.entrySet()) {
                if (entry == null || entry.getKey() == null || entry.getKey().isBlank()) {
                    log.warn("[SpringBootProjectGeneratorService] Saltando entrada ZIP con ruta nula o vacía");
                    continue;
                }
                String safeKey = entry.getKey().replace('\\', '/').replaceAll("^/+", "");
                zip.putNextEntry(new ZipEntry(safeKey));
                byte[] content = entry.getValue() != null
                        ? entry.getValue().getBytes(StandardCharsets.UTF_8)
                        : new byte[0];
                zip.write(content);
                zip.closeEntry();
            }
            zip.finish();
            return buffer.toByteArray();
        } catch (IOException ex) {
            log.error("[SpringBootProjectGeneratorService] Error de E/S al empaquetar el proyecto en ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo empaquetar el proyecto en ZIP", ex);
        } catch (Exception ex) {
            log.error("[SpringBootProjectGeneratorService] Error inesperado al generar el proyecto en ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error al generar el proyecto en ZIP: " + ex.getMessage(), ex);
        }
    }

    private Map<String, String> buildProjectFiles(DiagramModel model) {
        Map<String, String> files = new LinkedHashMap<>();

        // 1. Archivos base del proyecto
        files.put("pom.xml", generatePomXml());
        files.put(RESOURCES_DIR + "application.properties", generateApplicationProperties());
        files.put(JAVA_BASE_DIR + "Application.java", generateApplicationJava());

        // 2. Arquitectura de 4 capas para cada entidad
        for (ClassModel cls : model.getClasses()) {
            if (cls == null || cls.getName() == null || cls.getName().isBlank()) {
                continue;
            }
            String className = cls.getName();
            files.put(JAVA_BASE_DIR + "models/" + className + ".java", generateEntityJava(cls, model));
            files.put(JAVA_BASE_DIR + "repositories/" + className + "Repository.java", generateRepositoryJava(cls));
            files.put(JAVA_BASE_DIR + "services/" + className + "Service.java", generateServiceJava(cls));
            files.put(JAVA_BASE_DIR + "controllers/" + className + "Controller.java", generateControllerJava(cls));
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
            cls.setName(sanitizeClassName(cls.getName()));
            if (cls.getId() == null || cls.getId().isBlank()) {
                cls.setId(cls.getName());
            }
            if (cls.getAttrs() == null) {
                cls.setAttrs(new ArrayList<>());
            }

            boolean hasId = cls.getAttrs().stream()
                    .anyMatch(a -> "id".equalsIgnoreCase(a.getName()));
            if (!hasId) {
                AttrModel id = new AttrModel();
                id.setName("id");
                id.setType("Long");
                cls.getAttrs().add(0, id);
            }

            for (AttrModel attr : cls.getAttrs()) {
                if ("id".equalsIgnoreCase(attr.getName())) {
                    attr.setName("id");
                    attr.setType("Long");
                } else {
                    attr.setName(sanitizeAttributeName(attr.getName()));
                    attr.setType(mapJavaType(attr.getType()));
                }
            }
        }

        return model;
    }

    private record Association(ClassModel one, ClassModel many, RelationModel rel) {}

    private Association fkSide(DiagramModel model, RelationModel rel) {
        ClassModel from = resolveEnd(model, rel.getFromId(), rel.getFromName());
        ClassModel to = resolveEnd(model, rel.getToId(), rel.getToName());
        if (from == null || to == null) {
            return null;
        }

        String mult = rel.getMult() != null ? rel.getMult().trim() : "";
        if ("*..1".equals(mult)) {
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

    private ClassModel resolveEnd(DiagramModel model, String id, String name) {
        if (id != null && !id.isBlank()) {
            for (ClassModel c : model.getClasses()) {
                if (id.equals(c.getId()) || id.equalsIgnoreCase(c.getName())) {
                    return c;
                }
            }
        }
        if (name != null && !name.isBlank()) {
            String pascal = sanitizeClassName(name);
            for (ClassModel c : model.getClasses()) {
                if (pascal.equalsIgnoreCase(c.getName())) {
                    return c;
                }
            }
        }
        return null;
    }

    private String generateEntityJava(ClassModel cls, DiagramModel model) {
        String className = cls.getName();
        String tableName = sanitizeTableName(className);
        List<ClassModel> manyToOneList = manyToOneOf(cls, model);
        List<ClassModel> oneToManyList = oneToManyOf(cls, model);

        TreeSet<String> imports = new TreeSet<>();
        imports.add("import jakarta.persistence.Entity;");
        imports.add("import jakarta.persistence.GeneratedValue;");
        imports.add("import jakarta.persistence.GenerationType;");
        imports.add("import jakarta.persistence.Id;");
        imports.add("import jakarta.persistence.Table;");
        imports.add("import jakarta.persistence.Column;");

        if (!manyToOneList.isEmpty()) {
            imports.add("import jakarta.persistence.ManyToOne;");
            imports.add("import jakarta.persistence.JoinColumn;");
            imports.add("import jakarta.persistence.FetchType;");
            imports.add("import com.fasterxml.jackson.annotation.JsonIgnoreProperties;");
        }

        if (!oneToManyList.isEmpty()) {
            imports.add("import jakarta.persistence.OneToMany;");
            imports.add("import jakarta.persistence.CascadeType;");
            imports.add("import com.fasterxml.jackson.annotation.JsonIgnoreProperties;");
            imports.add("import java.util.ArrayList;");
            imports.add("import java.util.List;");
        }

        for (AttrModel attr : cls.getAttrs()) {
            if ("LocalDate".equals(attr.getType())) {
                imports.add("import java.time.LocalDate;");
            } else if ("LocalDateTime".equals(attr.getType())) {
                imports.add("import java.time.LocalDateTime;");
            }
        }

        StringBuilder fields = new StringBuilder();
        StringBuilder methods = new StringBuilder();

        // 1. Primary Key
        fields.append("    @Id\n")
              .append("    @GeneratedValue(strategy = GenerationType.IDENTITY)\n")
              .append("    private Long id;\n\n");

        methods.append("    public Long getId() {\n")
               .append("        return this.id;\n")
               .append("    }\n\n")
               .append("    public void setId(Long id) {\n")
               .append("        this.id = id;\n")
               .append("    }\n\n");

        // 2. Atributos
        for (AttrModel attr : cls.getAttrs()) {
            if ("id".equals(attr.getName())) {
                continue;
            }
            String attrName = attr.getName();
            String javaType = attr.getType();
            String columnName = sanitizeColumnName(attrName);
            String capitalized = capitalize(attrName);

            fields.append("    @Column(name = \"").append(columnName).append("\")\n")
                  .append("    private ").append(javaType).append(" ").append(attrName).append(";\n\n");

            methods.append("    public ").append(javaType).append(" get").append(capitalized).append("() {\n")
                   .append("        return this.").append(attrName).append(";\n")
                   .append("    }\n\n")
                   .append("    public void set").append(capitalized).append("(").append(javaType).append(" ").append(attrName).append(") {\n")
                   .append("        this.").append(attrName).append(" = ").append(attrName).append(";\n")
                   .append("    }\n\n");
        }

        // 3. Relaciones @ManyToOne (Entidad propietaria de FK)
        for (ClassModel parent : manyToOneList) {
            String parentClass = parent.getName();
            String parentProp = toCamelCase(parentClass);
            String joinCol = sanitizeColumnName(parentClass) + "_id";
            String capitalized = capitalize(parentProp);

            fields.append("    @ManyToOne(fetch = FetchType.LAZY)\n")
                  .append("    @JoinColumn(name = \"").append(joinCol).append("\")\n")
                  .append("    @JsonIgnoreProperties(\"").append(toCamelCase(className)).append("List\")\n")
                  .append("    private ").append(parentClass).append(" ").append(parentProp).append(";\n\n");

            methods.append("    public ").append(parentClass).append(" get").append(capitalized).append("() {\n")
                   .append("        return this.").append(parentProp).append(";\n")
                   .append("    }\n\n")
                   .append("    public void set").append(capitalized).append("(").append(parentClass).append(" ").append(parentProp).append(") {\n")
                   .append("        this.").append(parentProp).append(" = ").append(parentProp).append(";\n")
                   .append("    }\n\n");
        }

        // 4. Relaciones @OneToMany (Contraparte)
        for (ClassModel child : oneToManyList) {
            String childClass = child.getName();
            String listProp = toCamelCase(childClass) + "List";
            String mappedBy = toCamelCase(className);
            String capitalized = capitalize(listProp);

            fields.append("    @OneToMany(mappedBy = \"").append(mappedBy).append("\", cascade = CascadeType.ALL, orphanRemoval = true)\n")
                  .append("    @JsonIgnoreProperties(\"").append(mappedBy).append("\")\n")
                  .append("    private List<").append(childClass).append("> ").append(listProp).append(" = new ArrayList<>();\n\n");

            methods.append("    public List<").append(childClass).append("> get").append(capitalized).append("() {\n")
                   .append("        return this.").append(listProp).append(";\n")
                   .append("    }\n\n")
                   .append("    public void set").append(capitalized).append("(List<").append(childClass).append("> ").append(listProp).append(") {\n")
                   .append("        this.").append(listProp).append(" = ").append(listProp).append(";\n")
                   .append("    }\n\n");
        }

        StringBuilder code = new StringBuilder();
        code.append("package ").append(BASE_PACKAGE).append(".models;\n\n");
        for (String imp : imports) {
            code.append(imp).append("\n");
        }
        code.append("\n@Entity\n")
            .append("@Table(name = \"").append(tableName).append("\")\n")
            .append("public class ").append(className).append(" {\n\n")
            .append(fields)
            .append("    public ").append(className).append("() {\n")
            .append("    }\n\n")
            .append(methods)
            .append("}\n");

        return code.toString();
    }

    private String generateRepositoryJava(ClassModel cls) {
        String className = cls.getName();
        return "package " + BASE_PACKAGE + ".repositories;\n\n"
                + "import " + BASE_PACKAGE + ".models." + className + ";\n"
                + "import org.springframework.data.jpa.repository.JpaRepository;\n"
                + "import org.springframework.stereotype.Repository;\n\n"
                + "@Repository\n"
                + "public interface " + className + "Repository extends JpaRepository<" + className + ", Long> {\n"
                + "}\n";
    }

    private String generateServiceJava(ClassModel cls) {
        String className = cls.getName();
        return "package " + BASE_PACKAGE + ".services;\n\n"
                + "import " + BASE_PACKAGE + ".models." + className + ";\n"
                + "import " + BASE_PACKAGE + ".repositories." + className + "Repository;\n"
                + "import org.springframework.stereotype.Service;\n\n"
                + "import java.util.List;\n"
                + "import java.util.Optional;\n\n"
                + "@Service\n"
                + "public class " + className + "Service {\n\n"
                + "    private final " + className + "Repository repository;\n\n"
                + "    public " + className + "Service(" + className + "Repository repository) {\n"
                + "        this.repository = repository;\n"
                + "    }\n\n"
                + "    public List<" + className + "> findAll() {\n"
                + "        return repository.findAll();\n"
                + "    }\n\n"
                + "    public Optional<" + className + "> findById(Long id) {\n"
                + "        return repository.findById(id);\n"
                + "    }\n\n"
                + "    public " + className + " save(" + className + " entity) {\n"
                + "        return repository.save(entity);\n"
                + "    }\n\n"
                + "    public void deleteById(Long id) {\n"
                + "        repository.deleteById(id);\n"
                + "    }\n"
                + "}\n";
    }

    private String generateControllerJava(ClassModel cls) {
        String className = cls.getName();
        String path = apiResourcePath(className);

        return "package " + BASE_PACKAGE + ".controllers;\n\n"
                + "import " + BASE_PACKAGE + ".models." + className + ";\n"
                + "import " + BASE_PACKAGE + ".services." + className + "Service;\n"
                + "import org.springframework.http.HttpStatus;\n"
                + "import org.springframework.http.ResponseEntity;\n"
                + "import org.springframework.web.bind.annotation.CrossOrigin;\n"
                + "import org.springframework.web.bind.annotation.DeleteMapping;\n"
                + "import org.springframework.web.bind.annotation.GetMapping;\n"
                + "import org.springframework.web.bind.annotation.PathVariable;\n"
                + "import org.springframework.web.bind.annotation.PostMapping;\n"
                + "import org.springframework.web.bind.annotation.RequestBody;\n"
                + "import org.springframework.web.bind.annotation.RequestMapping;\n"
                + "import org.springframework.web.bind.annotation.RestController;\n\n"
                + "import java.util.List;\n\n"
                + "@RestController\n"
                + "@RequestMapping(\"" + path + "\")\n"
                + "@CrossOrigin(\"*\")\n"
                + "public class " + className + "Controller {\n\n"
                + "    private final " + className + "Service service;\n\n"
                + "    public " + className + "Controller(" + className + "Service service) {\n"
                + "        this.service = service;\n"
                + "    }\n\n"
                + "    @GetMapping\n"
                + "    public ResponseEntity<List<" + className + ">> findAll() {\n"
                + "        return ResponseEntity.ok(service.findAll());\n"
                + "    }\n\n"
                + "    @GetMapping(\"/{id}\")\n"
                + "    public ResponseEntity<" + className + "> findById(@PathVariable Long id) {\n"
                + "        return service.findById(id)\n"
                + "                .map(ResponseEntity::ok)\n"
                + "                .orElseGet(() -> ResponseEntity.notFound().build());\n"
                + "    }\n\n"
                + "    @PostMapping\n"
                + "    public ResponseEntity<" + className + "> create(@RequestBody " + className + " entity) {\n"
                + "        " + className + " saved = service.save(entity);\n"
                + "        return ResponseEntity.status(HttpStatus.CREATED).body(saved);\n"
                + "    }\n\n"
                + "    @DeleteMapping(\"/{id}\")\n"
                + "    public ResponseEntity<Void> deleteById(@PathVariable Long id) {\n"
                + "        if (service.findById(id).isEmpty()) {\n"
                + "            return ResponseEntity.notFound().build();\n"
                + "        }\n"
                + "        service.deleteById(id);\n"
                + "        return ResponseEntity.noContent().build();\n"
                + "    }\n"
                + "}\n";
    }

    private String generatePomXml() {
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
                  <groupId>com.example.generated</groupId>
                  <artifactId>generated-project</artifactId>
                  <version>1.0.0</version>
                  <name>generated-project</name>
                  <description>Proyecto Spring Boot generado en 4 capas desde CASE UML Studio</description>
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
                      <groupId>org.postgresql</groupId>
                      <artifactId>postgresql</artifactId>
                      <scope>runtime</scope>
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

    private String generateApplicationProperties() {
        return """
                spring.datasource.url=jdbc:postgresql://localhost:5432/db_uml
                spring.datasource.username=postgres
                spring.datasource.password=postgres
                spring.datasource.driver-class-name=org.postgresql.Driver
                spring.jpa.hibernate.ddl-auto=update
                spring.jpa.show-sql=true
                spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
                """;
    }

    private String generateApplicationJava() {
        return """
                package com.example.generated;

                import org.springframework.boot.SpringApplication;
                import org.springframework.boot.autoconfigure.SpringBootApplication;

                @SpringBootApplication
                public class Application {

                    public static void main(String[] args) {
                        SpringApplication.run(Application.class, args);
                    }
                }
                """;
    }

    public String mapJavaType(String rawType) {
        if (rawType == null || rawType.isBlank()) {
            return "String";
        }
        String t = rawType.trim().toLowerCase(Locale.ROOT);
        return switch (t) {
            case "int", "integer", "number" -> "Integer";
            case "varchar", "text", "string", "char" -> "String";
            case "date", "localdate" -> "LocalDate";
            case "datetime", "localdatetime", "timestamp" -> "LocalDateTime";
            case "decimal", "float", "double", "numeric", "bigdecimal" -> "Double";
            case "bool", "boolean" -> "Boolean";
            case "long", "bigint" -> "Long";
            default -> {
                String pascal = toPascalCase(rawType.trim());
                yield pascal.isEmpty() ? "String" : pascal;
            }
        };
    }

    public String sanitizeClassName(String raw) {
        if (raw == null || raw.isBlank()) {
            return "EntityModel";
        }
        String pascal = toPascalCase(raw);
        if (JAVA_KEYWORDS.contains(pascal.toLowerCase(Locale.ROOT))) {
            pascal = pascal + "Entity";
        }
        return pascal;
    }

    public String sanitizeAttributeName(String raw) {
        if (raw == null || raw.isBlank()) {
            return "attribute";
        }
        String camel = toCamelCase(raw);
        if (JAVA_KEYWORDS.contains(camel.toLowerCase(Locale.ROOT))) {
            camel = camel + "Attr";
        }
        return camel;
    }

    public String sanitizeTableName(String className) {
        String snake = toSnakeCase(className);
        if (SQL_KEYWORDS.contains(snake.toLowerCase(Locale.ROOT))) {
            return "tbl_" + snake;
        }
        return snake;
    }

    public String sanitizeColumnName(String attrName) {
        String snake = toSnakeCase(attrName);
        if (SQL_KEYWORDS.contains(snake.toLowerCase(Locale.ROOT))) {
            return "col_" + snake;
        }
        return snake;
    }

    private String apiResourcePath(String className) {
        String snake = toSnakeCase(className);
        String plural = snake.endsWith("s") ? snake : snake + "s";
        return "/api/" + plural;
    }

    private String toPascalCase(String raw) {
        if (raw == null) return "";
        String[] parts = raw.trim().split("[^A-Za-z0-9]+");
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (part.isBlank()) continue;
            out.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                out.append(part.substring(1));
            }
        }
        return out.isEmpty() ? "Clase" : out.toString();
    }

    private String toCamelCase(String raw) {
        String pascal = toPascalCase(raw);
        if (pascal.isEmpty()) return "prop";
        return Character.toLowerCase(pascal.charAt(0)) + (pascal.length() > 1 ? pascal.substring(1) : "");
    }

    private String toSnakeCase(String name) {
        if (name == null || name.isBlank()) return "entity";
        return name.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase(Locale.ROOT);
    }

    private String capitalize(String str) {
        if (str == null || str.isEmpty()) return "";
        return Character.toUpperCase(str.charAt(0)) + (str.length() > 1 ? str.substring(1) : "");
    }
}
