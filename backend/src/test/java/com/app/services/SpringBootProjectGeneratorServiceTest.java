package com.app.services;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.dto.RelationModel;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SpringBootProjectGeneratorServiceTest {

    private final SpringBootProjectGeneratorService generator = new SpringBootProjectGeneratorService();

    private DiagramModel createTestDiagram() {
        DiagramModel model = new DiagramModel();
        model.setName("Ecommerce");

        // Entidad Cliente
        ClassModel cliente = new ClassModel();
        cliente.setName("Cliente");
        cliente.setId("c1");

        AttrModel nombre = new AttrModel();
        nombre.setName("nombre");
        nombre.setType("varchar");
        cliente.getAttrs().add(nombre);

        AttrModel edad = new AttrModel();
        edad.setName("edad");
        edad.setType("int");
        cliente.getAttrs().add(edad);

        AttrModel activo = new AttrModel();
        activo.setName("activo");
        activo.setType("boolean");
        cliente.getAttrs().add(activo);

        // Entidad Pedido (palabra reservada SQL: order -> Order)
        ClassModel pedido = new ClassModel();
        pedido.setName("Order");
        pedido.setId("c2");

        AttrModel fecha = new AttrModel();
        fecha.setName("fecha");
        fecha.setType("date");
        pedido.getAttrs().add(fecha);

        AttrModel total = new AttrModel();
        total.setName("total");
        total.setType("decimal");
        pedido.getAttrs().add(total);

        // Atributo con palabra reservada de Java
        AttrModel classAttr = new AttrModel();
        classAttr.setName("class");
        classAttr.setType("string");
        pedido.getAttrs().add(classAttr);

        model.getClasses().add(cliente);
        model.getClasses().add(pedido);

        // Relación Cliente (1) -> Order (*)
        RelationModel rel = new RelationModel();
        rel.setFromId("c1");
        rel.setFromName("Cliente");
        rel.setToId("c2");
        rel.setToName("Order");
        rel.setMult("1..*");
        model.getRelations().add(rel);

        return model;
    }

    @Test
    void generatesCompleteFourLayerSpringBootProjectInZip() throws Exception {
        DiagramModel diagram = createTestDiagram();
        byte[] zipBytes = generator.generateProjectZip(diagram);

        assertNotNull(zipBytes);
        assertTrue(zipBytes.length > 0);

        Map<String, String> files = new HashMap<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zipBytes), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                byte[] content = in.readAllBytes();
                files.put(entry.getName(), new String(content, StandardCharsets.UTF_8));
            }
        }

        // 1. Archivos Base
        assertTrue(files.containsKey("pom.xml"));
        assertTrue(files.containsKey("src/main/resources/application.properties"));
        assertTrue(files.containsKey("src/main/java/com/example/generated/Application.java"));

        String pom = files.get("pom.xml");
        assertTrue(pom.contains("spring-boot-starter-web"));
        assertTrue(pom.contains("spring-boot-starter-data-jpa"));
        assertTrue(pom.contains("postgresql"));

        String props = files.get("src/main/resources/application.properties");
        assertTrue(props.contains("jdbc:postgresql://localhost:5432/db_uml"));
        assertTrue(props.contains("spring.jpa.hibernate.ddl-auto=update"));
        assertTrue(props.contains("spring.jpa.show-sql=true"));

        String app = files.get("src/main/java/com/example/generated/Application.java");
        assertTrue(app.contains("package com.example.generated;"));
        assertTrue(app.contains("@SpringBootApplication"));
        assertTrue(app.contains("public static void main(String[] args)"));

        // 2. Modelos / Entidades
        assertTrue(files.containsKey("src/main/java/com/example/generated/models/Cliente.java"));
        assertTrue(files.containsKey("src/main/java/com/example/generated/models/Order.java"));

        String clienteModel = files.get("src/main/java/com/example/generated/models/Cliente.java");
        assertTrue(clienteModel.contains("package com.example.generated.models;"));
        assertTrue(clienteModel.contains("@Entity"));
        assertTrue(clienteModel.contains("@Table(name = \"cliente\")"));
        assertTrue(clienteModel.contains("@Id"));
        assertTrue(clienteModel.contains("@GeneratedValue(strategy = GenerationType.IDENTITY)"));
        assertTrue(clienteModel.contains("private Long id;"));
        assertTrue(clienteModel.contains("private String nombre;"));
        assertTrue(clienteModel.contains("private Integer edad;"));
        assertTrue(clienteModel.contains("private Boolean activo;"));
        assertTrue(clienteModel.contains("public String getNombre()"));
        assertTrue(clienteModel.contains("public void setNombre(String nombre)"));
        // OneToMany relation on counterpart
        assertTrue(clienteModel.contains("@OneToMany(mappedBy = \"cliente\""));
        assertTrue(clienteModel.contains("private List<Order> orderList = new ArrayList<>();"));
        assertFalse(clienteModel.contains("// TODO"));

        String orderModel = files.get("src/main/java/com/example/generated/models/Order.java");
        // Sanitized table name for SQL keyword 'order'
        assertTrue(orderModel.contains("@Table(name = \"tbl_order\")"));
        assertTrue(orderModel.contains("private LocalDate fecha;"));
        assertTrue(orderModel.contains("private Double total;"));
        // Sanitized attribute name for Java keyword 'class'
        assertTrue(orderModel.contains("private String classAttr;"));
        // ManyToOne relation on owner entity
        assertTrue(orderModel.contains("@ManyToOne"));
        assertTrue(orderModel.contains("@JoinColumn(name = \"cliente_id\")"));
        assertTrue(orderModel.contains("private Cliente cliente;"));
        assertFalse(orderModel.contains("// TODO"));

        // 3. Repositorios
        assertTrue(files.containsKey("src/main/java/com/example/generated/repositories/ClienteRepository.java"));
        assertTrue(files.containsKey("src/main/java/com/example/generated/repositories/OrderRepository.java"));
        String clienteRepo = files.get("src/main/java/com/example/generated/repositories/ClienteRepository.java");
        assertTrue(clienteRepo.contains("package com.example.generated.repositories;"));
        assertTrue(clienteRepo.contains("public interface ClienteRepository extends JpaRepository<Cliente, Long>"));

        // 4. Servicios
        assertTrue(files.containsKey("src/main/java/com/example/generated/services/ClienteService.java"));
        assertTrue(files.containsKey("src/main/java/com/example/generated/services/OrderService.java"));
        String clienteService = files.get("src/main/java/com/example/generated/services/ClienteService.java");
        assertTrue(clienteService.contains("package com.example.generated.services;"));
        assertTrue(clienteService.contains("@Service"));
        assertTrue(clienteService.contains("public List<Cliente> findAll()"));
        assertTrue(clienteService.contains("public Optional<Cliente> findById(Long id)"));
        assertTrue(clienteService.contains("public Cliente save(Cliente entity)"));
        assertTrue(clienteService.contains("public void deleteById(Long id)"));

        // 5. Controladores
        assertTrue(files.containsKey("src/main/java/com/example/generated/controllers/ClienteController.java"));
        assertTrue(files.containsKey("src/main/java/com/example/generated/controllers/OrderController.java"));
        String clienteCtrl = files.get("src/main/java/com/example/generated/controllers/ClienteController.java");
        assertTrue(clienteCtrl.contains("package com.example.generated.controllers;"));
        assertTrue(clienteCtrl.contains("@RestController"));
        assertTrue(clienteCtrl.contains("@RequestMapping(\"/api/clientes\")"));
        assertTrue(clienteCtrl.contains("@CrossOrigin(\"*\")"));
        assertTrue(clienteCtrl.contains("@GetMapping"));
        assertTrue(clienteCtrl.contains("@GetMapping(\"/{id}\")"));
        assertTrue(clienteCtrl.contains("@PostMapping"));
        assertTrue(clienteCtrl.contains("@DeleteMapping(\"/{id}\")"));
        assertTrue(clienteCtrl.contains("HttpStatus.CREATED"));
        assertTrue(clienteCtrl.contains("ResponseEntity.notFound().build()"));
        assertTrue(clienteCtrl.contains("ResponseEntity.noContent().build()"));
    }

    @Test
    void robustTypeMappingAndSanitization() {
        assertEquals("Integer", generator.mapJavaType("int"));
        assertEquals("Integer", generator.mapJavaType("INTEGER"));
        assertEquals("Integer", generator.mapJavaType("number"));
        assertEquals("String", generator.mapJavaType("varchar"));
        assertEquals("String", generator.mapJavaType("text"));
        assertEquals("String", generator.mapJavaType("string"));
        assertEquals("LocalDate", generator.mapJavaType("date"));
        assertEquals("LocalDate", generator.mapJavaType("LocalDate"));
        assertEquals("Double", generator.mapJavaType("decimal"));
        assertEquals("Double", generator.mapJavaType("float"));
        assertEquals("Double", generator.mapJavaType("double"));
        assertEquals("Boolean", generator.mapJavaType("bool"));
        assertEquals("Boolean", generator.mapJavaType("boolean"));
        assertEquals("Long", generator.mapJavaType("long"));

        // SQL keyword sanitization
        assertEquals("tbl_user", generator.sanitizeTableName("User"));
        assertEquals("tbl_order", generator.sanitizeTableName("Order"));
        assertEquals("producto", generator.sanitizeTableName("Producto"));

        // Java keyword sanitization
        assertEquals("classAttr", generator.sanitizeAttributeName("class"));
        assertEquals("defaultAttr", generator.sanitizeAttributeName("default"));
        assertEquals("descripcion", generator.sanitizeAttributeName("descripcion"));
    }

    @Test
    void generatesPivotTableAndFourLayersForManyToManyRelation() throws Exception {
        DiagramModel model = new DiagramModel();
        model.setName("Inscripciones");

        ClassModel estudiante = new ClassModel();
        estudiante.setId("c_est");
        estudiante.setName("Estudiante");
        estudiante.getAttrs().add(new AttrModel("nombre", "varchar"));

        ClassModel curso = new ClassModel();
        curso.setId("c_cur");
        curso.setName("Curso");
        curso.getAttrs().add(new AttrModel("titulo", "varchar"));

        model.getClasses().add(estudiante);
        model.getClasses().add(curso);

        RelationModel relNm = new RelationModel();
        relNm.setFromId("c_est");
        relNm.setFromName("Estudiante");
        relNm.setToId("c_cur");
        relNm.setToName("Curso");
        relNm.setMult("*..*");
        model.getRelations().add(relNm);

        byte[] zipBytes = generator.generateProjectZip(model);
        assertNotNull(zipBytes);
        assertTrue(zipBytes.length > 0);

        Map<String, String> files = new HashMap<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zipBytes), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                byte[] content = in.readAllBytes();
                files.put(entry.getName(), new String(content, StandardCharsets.UTF_8));
            }
        }

        // Must contain files for Estudiante, Curso and pivot table EstudianteCurso / Estudiante_Curso
        assertTrue(files.containsKey("src/main/java/com/example/generated/models/Estudiante.java"));
        assertTrue(files.containsKey("src/main/java/com/example/generated/models/Curso.java"));

        boolean hasPivotModel = files.keySet().stream()
                .anyMatch(k -> k.contains("models/EstudianteCurso.java") || k.contains("models/Estudiante_Curso.java"));
        assertTrue(hasPivotModel, "Debe haberse generado el modelo de la tabla pivote intermedia");

        boolean hasPivotRepo = files.keySet().stream()
                .anyMatch(k -> k.contains("repositories/EstudianteCursoRepository.java") || k.contains("repositories/Estudiante_CursoRepository.java"));
        assertTrue(hasPivotRepo, "Debe haberse generado el repositorio de la tabla pivote intermedia");

        boolean hasPivotService = files.keySet().stream()
                .anyMatch(k -> k.contains("services/EstudianteCursoService.java") || k.contains("services/Estudiante_CursoService.java"));
        assertTrue(hasPivotService, "Debe haberse generado el servicio de la tabla pivote intermedia");

        boolean hasPivotController = files.keySet().stream()
                .anyMatch(k -> k.contains("controllers/EstudianteCursoController.java") || k.contains("controllers/Estudiante_CursoController.java"));
        assertTrue(hasPivotController, "Debe haberse generado el controlador de la tabla pivote intermedia");
    }
}
