package com.app.services;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.dto.LogicalSchemaModel;
import com.app.dto.RelationModel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NormalizationServiceTest {

    private NormalizationService service;

    @BeforeEach
    void setUp() {
        service = new NormalizationService();
    }

    @Test
    @DisplayName("N:M Resolution: Decomposes many-to-many relationship into <Origen>_<Destino> pivot table with FKs and 1:N relations")
    void testResolveManyToManyCreatesIntermediateTableAndOneToManyRelations() {
        DiagramModel model = new DiagramModel();
        model.setName("SistemaAcademico");

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
        relNm.setId("rel_nm_1");
        relNm.setFromId("c_est");
        relNm.setFromName("Estudiante");
        relNm.setToId("c_cur");
        relNm.setToName("Curso");
        relNm.setMult("*..*");
        model.getRelations().add(relNm);

        LogicalSchemaModel normalized = service.normalizeToLogicalSchema(model);

        assertNotNull(normalized);
        assertTrue(normalized.isNormalized());
        assertEquals(1, normalized.getPivotTablesCount());

        // Debe haber 3 entidades: Estudiante, Curso y Estudiante_Curso
        assertEquals(3, normalized.getClasses().size());

        ClassModel pivot = normalized.getClasses().stream()
                .filter(c -> Boolean.TRUE.equals(c.getIsPivotTable()))
                .findFirst()
                .orElse(null);

        assertNotNull(pivot, "La tabla pivote intermedia debe existir");
        assertTrue(pivot.getName().equalsIgnoreCase("Estudiante_Curso") || pivot.getName().contains("Estudiante_Curso"));

        // Verificar columnas foráneas y surrogate id
        boolean hasSurrogateId = pivot.getAttrs().stream().anyMatch(a -> "id".equals(a.getName()) && Boolean.TRUE.equals(a.getIsPrimary()));
        boolean hasEstudianteFk = pivot.getAttrs().stream().anyMatch(a -> a.getName().contains("estudiante_id") && Boolean.TRUE.equals(a.getIsForeignKey()));
        boolean hasCursoFk = pivot.getAttrs().stream().anyMatch(a -> a.getName().contains("curso_id") && Boolean.TRUE.equals(a.getIsForeignKey()));

        assertTrue(hasSurrogateId, "Pivot debe tener surrogate id Long");
        assertTrue(hasEstudianteFk, "Pivot debe tener FK hacia Estudiante");
        assertTrue(hasCursoFk, "Pivot debe tener FK hacia Curso");

        // Relaciones 1:N hacia la tabla pivote
        assertEquals(2, normalized.getRelations().size());
        for (RelationModel rel : normalized.getRelations()) {
            assertEquals("1..*", rel.getMult());
            assertEquals(pivot.getId(), rel.getToId());
        }

        // Notas de normalización
        assertFalse(normalized.getNormalizationNotes().isEmpty());
    }

    @Test
    @DisplayName("1FN: Ensures attribute atomicity and separates multivalued attributes into child entities")
    void testFirstNormalFormAtomicityAndMultivalueSeparation() {
        DiagramModel model = new DiagramModel();
        model.setName("Clientes");

        ClassModel cliente = new ClassModel();
        cliente.setId("c_cli");
        cliente.setName("Cliente");
        cliente.getAttrs().add(new AttrModel("nombre", "varchar"));
        cliente.getAttrs().add(new AttrModel("telefonos", "List<String>")); // Multivalor

        model.getClasses().add(cliente);

        LogicalSchemaModel normalized = service.normalizeToLogicalSchema(model);

        // Debe existir Cliente y Cliente_Telefono
        assertEquals(2, normalized.getClasses().size());

        ClassModel phoneEntity = normalized.getClasses().stream()
                .filter(c -> c.getName().contains("Telefono"))
                .findFirst()
                .orElse(null);

        assertNotNull(phoneEntity, "Debe haberse extraído una entidad para el atributo multivalor");
        assertTrue(phoneEntity.getAttrs().stream().anyMatch(a -> "telefono".equalsIgnoreCase(a.getName())));

        // Debe existir relación 1:N entre Cliente y Cliente_Telefono
        assertEquals(1, normalized.getRelations().size());
        assertEquals("1..*", normalized.getRelations().get(0).getMult());
    }

    @Test
    @DisplayName("2FN: Ensures unique surrogate primary key id for all entities")
    void testSecondNormalFormSurrogateKeyEnforced() {
        DiagramModel model = new DiagramModel();
        model.setName("Inventario");

        ClassModel producto = new ClassModel();
        producto.setId("c_prod");
        producto.setName("Producto");
        // No tiene atributo 'id'
        producto.getAttrs().add(new AttrModel("codigo", "varchar"));
        producto.getAttrs().add(new AttrModel("precio", "decimal"));

        model.getClasses().add(producto);

        LogicalSchemaModel normalized = service.normalizeToLogicalSchema(model);

        ClassModel prod = normalized.getClasses().get(0);
        AttrModel firstAttr = prod.getAttrs().get(0);

        assertEquals("id", firstAttr.getName());
        assertEquals("Long", firstAttr.getType());
        assertTrue(firstAttr.getIsPrimary());
    }

    @Test
    @DisplayName("3FN: Detects derived attributes and extracts transitive dependencies")
    void testThirdNormalFormTransitiveDependencies() {
        DiagramModel model = new DiagramModel();
        model.setName("Facturacion");

        ClassModel factura = new ClassModel();
        factura.setId("c_fac");
        factura.setName("Factura");
        factura.getAttrs().add(new AttrModel("id", "Long"));
        factura.getAttrs().add(new AttrModel("subtotal", "decimal"));
        factura.getAttrs().add(new AttrModel("total", "decimal")); // Atributo derivado

        // Atributos transitivos sobre un departamento_id
        factura.getAttrs().add(new AttrModel("sucursal_id", "Long"));
        factura.getAttrs().add(new AttrModel("sucursal_nombre", "varchar"));
        factura.getAttrs().add(new AttrModel("sucursal_direccion", "varchar"));

        model.getClasses().add(factura);

        LogicalSchemaModel normalized = service.normalizeToLogicalSchema(model);

        // Se debe haber detectado el atributo derivado en las notas
        boolean noteFound = normalized.getNormalizationNotes().stream()
                .anyMatch(n -> n.contains("derivado potencial detectado 'total'"));
        assertTrue(noteFound, "Debe registrar nota de atributo derivado");

        // Se debe haber extraído la entidad Sucursal
        ClassModel sucursalEntity = normalized.getClasses().stream()
                .filter(c -> c.getName().equalsIgnoreCase("Sucursal"))
                .findFirst()
                .orElse(null);

        assertNotNull(sucursalEntity, "Se debe separar la entidad transitiva Sucursal");
        assertTrue(sucursalEntity.getAttrs().stream().anyMatch(a -> a.getName().equalsIgnoreCase("nombre")));
        assertTrue(sucursalEntity.getAttrs().stream().anyMatch(a -> a.getName().equalsIgnoreCase("direccion")));

        // En Factura no deben quedar sucursal_nombre ni sucursal_direccion
        ClassModel updatedFactura = normalized.getClasses().stream()
                .filter(c -> c.getName().equalsIgnoreCase("Factura"))
                .findFirst()
                .orElseThrow();

        assertFalse(updatedFactura.getAttrs().stream().anyMatch(a -> a.getName().equalsIgnoreCase("sucursal_nombre")));
        assertFalse(updatedFactura.getAttrs().stream().anyMatch(a -> a.getName().equalsIgnoreCase("sucursal_direccion")));
        assertTrue(updatedFactura.getAttrs().stream().anyMatch(a -> a.getName().equalsIgnoreCase("sucursal_id")));
    }

    @Test
    @DisplayName("Edge Case: Null and empty diagram returns safe empty schema without errors")
    void testNullAndEmptyDiagram() {
        LogicalSchemaModel nullResult = service.normalizeToLogicalSchema(null);
        assertNotNull(nullResult);
        assertTrue(nullResult.getClasses().isEmpty());

        LogicalSchemaModel emptyResult = service.normalizeToLogicalSchema(new DiagramModel());
        assertNotNull(emptyResult);
        assertTrue(emptyResult.getClasses().isEmpty());
    }
}
