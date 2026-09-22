package com.app.services;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.dto.LogicalSchemaModel;
import com.app.dto.RelationModel;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Servicio de Normalización Relacional para CASE UML Studio.
 * Transforma un DiagramModel conceptual en un Modelo Lógico Relacional normalizado (LogicalSchemaModel)
 * aplicando reglas de resolución N:M (tablas pivote), 1FN, 2FN y 3FN.
 */
@Service
public class NormalizationService {

    private static final Set<String> MULTIVALUE_TYPE_INDICATORS = Set.of(
            "list", "set", "collection", "array", "[]", "vector"
    );

    private static final Set<String> COMMON_MULTIVALUED_NAMES = Set.of(
            "telefonos", "telefonos_fijos", "telefonos_moviles", "telefonos_contacto",
            "phones", "correos", "emails", "direcciones", "addresses",
            "hobbies", "intereses", "etiquetas", "tags", "fotos", "imagenes"
    );

    private static final Set<String> DERIVED_ATTRIBUTE_NAMES = Set.of(
            "total", "precio_total", "preciototal", "subtotal", "importe_total", "importetotal",
            "monto_total", "montototal", "saldo_total", "saldototal", "edad", "age"
    );

    /**
     * Normaliza un DiagramModel conceptual produciendo un nuevo LogicalSchemaModel.
     */
    public LogicalSchemaModel normalizeToLogicalSchema(DiagramModel conceptualModel) {
        if (conceptualModel == null) {
            LogicalSchemaModel empty = new LogicalSchemaModel();
            empty.addNote("Modelo conceptual nulo recibido; esquema vacío generado.");
            return empty;
        }

        // Clonado profundo para preservar inmutabilidad del modelo conceptual de entrada
        LogicalSchemaModel logicalModel = cloneToLogicalSchema(conceptualModel);

        // Paso 1: Aplicar 1FN (Atomicidad de nombres, tipos y descomposición de multivalores)
        applyFirstNormalForm(logicalModel);

        // Paso 2: Aplicar 2FN (Identificador unívoco surrogate id en todas las entidades)
        applySecondNormalForm(logicalModel);

        // Paso 3: Resolución N:M (Tablas intermedias pivote <Origen>_<Destino> y llaves compuestas/foráneas)
        resolveManyToManyRelations(logicalModel);

        // Paso 4: Aplicar 3FN (Separación de dependencias transitivas y reporte de atributos derivados)
        applyThirdNormalForm(logicalModel);

        // Post-normalización: Re-asegurar 2FN sobre cualquier entidad creada en pasos posteriores
        applySecondNormalForm(logicalModel);

        return logicalModel;
    }

    /**
     * Adaptador para interoperabilidad con generadores de código existentes.
     */
    public DiagramModel normalize(DiagramModel conceptualModel) {
        return normalizeToLogicalSchema(conceptualModel);
    }

    // =========================================================================
    // 1FN: Primera Forma Normal (Atomicidad)
    // =========================================================================

    private void applyFirstNormalForm(LogicalSchemaModel model) {
        List<ClassModel> newExtractedEntities = new ArrayList<>();
        List<RelationModel> newExtractedRelations = new ArrayList<>();

        for (ClassModel cls : model.getClasses()) {
            cls.setName(sanitizeClassName(cls.getName()));
            if (cls.getId() == null || cls.getId().isBlank()) {
                cls.setId("cls_" + cls.getName().toLowerCase(Locale.ROOT));
            }

            List<AttrModel> atomicAttrs = new ArrayList<>();
            Set<String> seenNames = new HashSet<>();

            for (AttrModel attr : cls.getAttrs()) {
                if (attr == null) continue;

                String rawName = attr.getName() != null ? attr.getName().trim() : "attr";
                String sanitizedName = sanitizeAttributeName(rawName);
                String rawType = attr.getType() != null ? attr.getType().trim() : "String";

                // Detectar atributo no atómico o multivalor (1FN)
                if (isMultivaluedAttribute(rawName, rawType)) {
                    String singularItemName = extractSingularName(rawName);
                    String childEntityName = cls.getName() + "_" + capitalize(singularItemName);
                    String childEntityId = "cls_" + childEntityName.toLowerCase(Locale.ROOT);

                    ClassModel childEntity = new ClassModel();
                    childEntity.setId(childEntityId);
                    childEntity.setName(childEntityName);
                    childEntity.setX(cls.getX() != null ? cls.getX() + 180.0 : 200.0);
                    childEntity.setY(cls.getY() != null ? cls.getY() + 100.0 : 200.0);

                    // Atributo atómico en entidad hija
                    AttrModel valueAttr = new AttrModel();
                    valueAttr.setName(singularItemName);
                    valueAttr.setType(extractElementJavaType(rawType));
                    valueAttr.setIsPrimary(false);
                    valueAttr.setIsForeignKey(false);
                    childEntity.getAttrs().add(valueAttr);

                    // Relación 1:N Padre -> Hija
                    RelationModel rel = new RelationModel();
                    rel.setId("rel_1fn_" + UUID.randomUUID().toString().substring(0, 8));
                    rel.setFromId(cls.getId());
                    rel.setFromName(cls.getName());
                    rel.setToId(childEntityId);
                    rel.setToName(childEntityName);
                    rel.setMult("1..*");
                    rel.setSourceMultiplicity("1");
                    rel.setTargetMultiplicity("*");
                    rel.setRelationType("composition");

                    newExtractedEntities.add(childEntity);
                    newExtractedRelations.add(rel);

                    model.addNote("1FN: Atributo multivalor '" + rawName + "' en entidad '" + cls.getName()
                            + "' descompuesto en nueva entidad dependiente '" + childEntityName + "'.");
                    continue;
                }

                // Normalizar tipos atómicos estándar
                attr.setName(sanitizedName);
                attr.setType(mapJavaType(rawType));

                if (seenNames.add(sanitizedName.toLowerCase(Locale.ROOT))) {
                    atomicAttrs.add(attr);
                } else {
                    model.addNote("1FN: Columna duplicada omitida '" + sanitizedName + "' en entidad '" + cls.getName() + "'.");
                }
            }

            cls.setAttrs(atomicAttrs);
        }

        model.getClasses().addAll(newExtractedEntities);
        model.getRelations().addAll(newExtractedRelations);
    }

    private boolean isMultivaluedAttribute(String name, String type) {
        if (name != null) {
            String lower = name.toLowerCase(Locale.ROOT);
            if (COMMON_MULTIVALUED_NAMES.contains(lower)) {
                return true;
            }
        }
        if (type != null) {
            String lowerType = type.toLowerCase(Locale.ROOT);
            for (String ind : MULTIVALUE_TYPE_INDICATORS) {
                if (lowerType.contains(ind)) {
                    return true;
                }
            }
        }
        return false;
    }

    private String extractSingularName(String pluralName) {
        if (pluralName == null || pluralName.isBlank()) return "item";
        String s = sanitizeAttributeName(pluralName);
        if (s.endsWith("es") && s.length() > 3) {
            return s.substring(0, s.length() - 2);
        }
        if (s.endsWith("s") && s.length() > 2) {
            return s.substring(0, s.length() - 1);
        }
        return s;
    }

    private String extractElementJavaType(String rawType) {
        if (rawType == null || rawType.isBlank()) return "String";
        String lower = rawType.toLowerCase(Locale.ROOT);
        if (lower.contains("int") || lower.contains("number")) return "Integer";
        if (lower.contains("long")) return "Long";
        if (lower.contains("double") || lower.contains("decimal")) return "Double";
        return "String";
    }

    // =========================================================================
    // 2FN: Segunda Forma Normal (Identificador unívoco y dependencia funcional completa)
    // =========================================================================

    private void applySecondNormalForm(LogicalSchemaModel model) {
        for (ClassModel cls : model.getClasses()) {
            boolean hasId = false;
            for (AttrModel attr : cls.getAttrs()) {
                if ("id".equalsIgnoreCase(attr.getName())) {
                    hasId = true;
                    attr.setName("id");
                    attr.setType("Long");
                    attr.setIsPrimary(true);
                    break;
                }
            }

            if (!hasId) {
                AttrModel surrogateId = new AttrModel();
                surrogateId.setName("id");
                surrogateId.setType("Long");
                surrogateId.setIsPrimary(true);
                surrogateId.setIsForeignKey(false);
                cls.getAttrs().add(0, surrogateId);
                model.addNote("2FN: Clave primaria surrogate 'id' (Long) inyectada en entidad '" + cls.getName() + "'.");
            }

            if (cls.getPrimaryKeyColumns() == null || cls.getPrimaryKeyColumns().isEmpty()) {
                cls.setPrimaryKeyColumns(new ArrayList<>(List.of("id")));
            }
        }
    }

    // =========================================================================
    // N:M: Resolución de relaciones Muchos a Muchos (Tablas Pivote)
    // =========================================================================

    private void resolveManyToManyRelations(LogicalSchemaModel model) {
        List<RelationModel> remainingRelations = new ArrayList<>();
        List<ClassModel> pivotEntities = new ArrayList<>();
        List<RelationModel> pivotRelations = new ArrayList<>();

        for (RelationModel rel : model.getRelations()) {
            if (isManyToManyRelation(rel)) {
                ClassModel fromClass = resolveClass(model, rel.getFromId(), rel.getFromName());
                ClassModel toClass = resolveClass(model, rel.getToId(), rel.getToName());

                if (fromClass == null || toClass == null) {
                    // Si los extremos no se resuelven, conservar relación para no perder datos
                    remainingRelations.add(rel);
                    continue;
                }

                // Nombre de la tabla intermedia pivote: <Origen>_<Destino>
                String explicitTable = rel.getEffectiveIntermediateTable();
                String pivotClassName = (explicitTable != null && !explicitTable.isBlank())
                        ? sanitizeClassName(explicitTable)
                        : sanitizeClassName(fromClass.getName()) + "_" + sanitizeClassName(toClass.getName());

                String pivotId = "pivot_" + pivotClassName.toLowerCase(Locale.ROOT);

                // Evitar duplicar tabla pivote si ya fue creada
                boolean alreadyExists = model.getClasses().stream().anyMatch(c -> c.getName().equalsIgnoreCase(pivotClassName))
                        || pivotEntities.stream().anyMatch(c -> c.getName().equalsIgnoreCase(pivotClassName));

                if (alreadyExists) {
                    continue;
                }

                ClassModel pivotEntity = new ClassModel();
                pivotEntity.setId(pivotId);
                pivotEntity.setName(pivotClassName);
                pivotEntity.setIsPivotTable(true);

                // Posición media en el lienzo para visualización amigable
                double fromX = fromClass.getX() != null ? fromClass.getX() : 100.0;
                double fromY = fromClass.getY() != null ? fromClass.getY() : 100.0;
                double toX = toClass.getX() != null ? toClass.getX() : 350.0;
                double toY = toClass.getY() != null ? toClass.getY() : 100.0;
                pivotEntity.setX((fromX + toX) / 2.0);
                pivotEntity.setY((fromY + toY) / 2.0 + 80.0);

                // 1. Clave primaria surrogate
                AttrModel idAttr = new AttrModel();
                idAttr.setName("id");
                idAttr.setType("Long");
                idAttr.setIsPrimary(true);
                idAttr.setIsForeignKey(false);
                pivotEntity.getAttrs().add(idAttr);

                // 2. Llave foránea <origen>_id
                String fromFkName = toSnakeCase(fromClass.getName()) + "_id";
                AttrModel fromFk = new AttrModel();
                fromFk.setName(fromFkName);
                fromFk.setType("Long");
                fromFk.setIsPrimary(false);
                fromFk.setIsForeignKey(true);
                fromFk.setFkReferencedClass(fromClass.getName());
                pivotEntity.getAttrs().add(fromFk);

                // 3. Llave foránea <destino>_id
                String toFkName = toSnakeCase(toClass.getName()) + "_id";
                AttrModel toFk = new AttrModel();
                toFk.setName(toFkName);
                toFk.setType("Long");
                toFk.setIsPrimary(false);
                toFk.setIsForeignKey(true);
                toFk.setFkReferencedClass(toClass.getName());
                pivotEntity.getAttrs().add(toFk);

                // 4. Clave primaria compuesta o índice de unicidad compuesta
                pivotEntity.setPrimaryKeyColumns(new ArrayList<>(List.of(fromFkName, toFkName)));

                // 5. Atributo de auditoría relacional
                AttrModel createdAt = new AttrModel();
                createdAt.setName("createdAt");
                createdAt.setType("LocalDateTime");
                createdAt.setIsPrimary(false);
                createdAt.setIsForeignKey(false);
                pivotEntity.getAttrs().add(createdAt);

                pivotEntities.add(pivotEntity);

                // Crear relación 1:N: Origen (1) -> Pivot (*)
                RelationModel relFromPivot = new RelationModel();
                relFromPivot.setId("rel_pivot_" + fromClass.getName() + "_" + pivotClassName);
                relFromPivot.setFromId(fromClass.getId());
                relFromPivot.setFromName(fromClass.getName());
                relFromPivot.setToId(pivotEntity.getId());
                relFromPivot.setToName(pivotClassName);
                relFromPivot.setMult("1..*");
                relFromPivot.setSourceMultiplicity("1");
                relFromPivot.setTargetMultiplicity("*");
                relFromPivot.setRelationType("composition");
                pivotRelations.add(relFromPivot);

                // Crear relación 1:N: Destino (1) -> Pivot (*)
                RelationModel relToPivot = new RelationModel();
                relToPivot.setId("rel_pivot_" + toClass.getName() + "_" + pivotClassName);
                relToPivot.setFromId(toClass.getId());
                relToPivot.setFromName(toClass.getName());
                relToPivot.setToId(pivotEntity.getId());
                relToPivot.setToName(pivotClassName);
                relToPivot.setMult("1..*");
                relToPivot.setSourceMultiplicity("1");
                relToPivot.setTargetMultiplicity("*");
                relToPivot.setRelationType("composition");
                pivotRelations.add(relToPivot);

                model.setPivotTablesCount(model.getPivotTablesCount() + 1);
                model.addNote("Normalización N:M: Relación entre '" + fromClass.getName() + "' y '"
                        + toClass.getName() + "' desglosada en tabla pivote '" + pivotClassName
                        + "' con FKs compuestas (" + fromFkName + ", " + toFkName + ").");
            } else {
                remainingRelations.add(rel);
            }
        }

        model.getClasses().addAll(pivotEntities);
        remainingRelations.addAll(pivotRelations);
        model.setRelations(remainingRelations);
    }

    private boolean isManyToManyRelation(RelationModel rel) {
        if (rel == null) return false;

        if (rel.getEffectiveIntermediateTable() != null) {
            return true;
        }

        String mult = rel.getMult() != null ? rel.getMult().trim().toLowerCase(Locale.ROOT) : "";
        if (mult.contains("*..*") || mult.contains("n..m") || mult.contains("m..n")
                || mult.contains("n:m") || mult.contains("m:n")
                || mult.contains("many-to-many") || mult.contains("muchos a muchos")
                || mult.contains("* a *") || mult.equals("*")) {
            return true;
        }

        String src = rel.getSourceMultiplicity() != null ? rel.getSourceMultiplicity().trim().toLowerCase(Locale.ROOT) : "";
        String tgt = rel.getTargetMultiplicity() != null ? rel.getTargetMultiplicity().trim().toLowerCase(Locale.ROOT) : "";

        boolean srcMany = src.equals("*") || src.contains("..*") || src.equals("m") || src.equals("n");
        boolean tgtMany = tgt.equals("*") || tgt.contains("..*") || tgt.equals("m") || tgt.equals("n");

        return srcMany && tgtMany;
    }

    // =========================================================================
    // 3FN: Tercera Forma Normal (Dependencias Transitivas y Atributos Derivados)
    // =========================================================================

    private void applyThirdNormalForm(LogicalSchemaModel model) {
        List<ClassModel> extractedCatalogs = new ArrayList<>();
        List<RelationModel> catalogRelations = new ArrayList<>();

        for (ClassModel cls : model.getClasses()) {
            if (Boolean.TRUE.equals(cls.getIsPivotTable())) {
                continue;
            }

            // 1. Detectar y advertir atributos derivados
            for (AttrModel attr : cls.getAttrs()) {
                String lowerName = attr.getName().toLowerCase(Locale.ROOT);
                if (DERIVED_ATTRIBUTE_NAMES.contains(lowerName)) {
                    model.addNote("3FN: Atributo derivado potencial detectado '" + attr.getName()
                            + "' en entidad '" + cls.getName() + "'. Se recomienda verificar si su valor puede ser calculado.");
                }
            }

            // 2. Detectar dependencias transitivas agrupadas por prefijo de FK
            // Por ejemplo, si la entidad tiene `departamento_id`, y además `departamento_nombre`, `departamento_ciudad`:
            // `departamento_nombre` depende de `departamento_id`, no directamente de `cls.id`.
            Map<String, List<AttrModel>> transitiveGroups = new LinkedHashMap<>();
            List<AttrModel> remainingAttrs = new ArrayList<>();

            Set<String> foreignKeyPrefixes = new HashSet<>();
            for (AttrModel attr : cls.getAttrs()) {
                String name = attr.getName().toLowerCase(Locale.ROOT);
                if (name.endsWith("_id") && !name.equals("id")) {
                    foreignKeyPrefixes.add(name.substring(0, name.length() - 3));
                }
            }

            for (AttrModel attr : cls.getAttrs()) {
                String name = attr.getName().toLowerCase(Locale.ROOT);
                boolean isTransitive = false;

                for (String prefix : foreignKeyPrefixes) {
                    if (name.startsWith(prefix + "_") && !name.equals(prefix + "_id")) {
                        transitiveGroups.computeIfAbsent(prefix, k -> new ArrayList<>()).add(attr);
                        isTransitive = true;
                        break;
                    }
                }

                if (!isTransitive) {
                    remainingAttrs.add(attr);
                }
            }

            // Si hay atributos transitivos evidentes, extraerlos a una entidad catálogo/referencia
            for (Map.Entry<String, List<AttrModel>> entry : transitiveGroups.entrySet()) {
                String prefix = entry.getKey();
                List<AttrModel> transitives = entry.getValue();

                String catalogClassName = sanitizeClassName(prefix);
                String catalogId = "cat_" + catalogClassName.toLowerCase(Locale.ROOT);

                boolean catalogExists = model.getClasses().stream()
                        .anyMatch(c -> c.getName().equalsIgnoreCase(catalogClassName))
                        || extractedCatalogs.stream().anyMatch(c -> c.getName().equalsIgnoreCase(catalogClassName));

                if (!catalogExists) {
                    ClassModel catalogEntity = new ClassModel();
                    catalogEntity.setId(catalogId);
                    catalogEntity.setName(catalogClassName);
                    catalogEntity.setX(cls.getX() != null ? cls.getX() - 160.0 : 50.0);
                    catalogEntity.setY(cls.getY() != null ? cls.getY() + 120.0 : 200.0);

                    AttrModel pk = new AttrModel();
                    pk.setName("id");
                    pk.setType("Long");
                    pk.setIsPrimary(true);
                    catalogEntity.getAttrs().add(pk);

                    for (AttrModel t : transitives) {
                        String cleanName = t.getName().substring(prefix.length() + 1);
                        AttrModel cleanAttr = new AttrModel();
                        cleanAttr.setName(sanitizeAttributeName(cleanName));
                        cleanAttr.setType(t.getType());
                        cleanAttr.setIsPrimary(false);
                        catalogEntity.getAttrs().add(cleanAttr);
                    }

                    extractedCatalogs.add(catalogEntity);

                    // Relación 1:N: Catálogo (1) -> Host (*)
                    RelationModel rel = new RelationModel();
                    rel.setId("rel_3fn_" + catalogClassName + "_" + cls.getName());
                    rel.setFromId(catalogId);
                    rel.setFromName(catalogClassName);
                    rel.setToId(cls.getId());
                    rel.setToName(cls.getName());
                    rel.setMult("1..*");
                    rel.setSourceMultiplicity("1");
                    rel.setTargetMultiplicity("*");
                    rel.setRelationType("association");
                    catalogRelations.add(rel);

                    model.addNote("3FN: Dependencia transitiva detectada sobre '" + prefix + "_id' en '"
                            + cls.getName() + "'. Se separó la entidad de referencia '" + catalogClassName
                            + "' eliminando atributos transitivos redundantes.");
                } else {
                    model.addNote("3FN: Atributos dependientes transitivos de '" + prefix
                            + "_id' eliminados de '" + cls.getName() + "' para satisfacer 3FN.");
                }

                cls.setAttrs(remainingAttrs);
            }
        }

        model.getClasses().addAll(extractedCatalogs);
        model.getRelations().addAll(catalogRelations);
    }

    // =========================================================================
    // Utilidades y Helpers
    // =========================================================================

    private ClassModel resolveClass(DiagramModel model, String id, String name) {
        if (id != null && !id.isBlank()) {
            for (ClassModel c : model.getClasses()) {
                if (id.equals(c.getId()) || id.equalsIgnoreCase(c.getName())) {
                    return c;
                }
            }
        }
        if (name != null && !name.isBlank()) {
            for (ClassModel c : model.getClasses()) {
                if (name.equalsIgnoreCase(c.getName())) {
                    return c;
                }
            }
        }
        return null;
    }

    private LogicalSchemaModel cloneToLogicalSchema(DiagramModel source) {
        LogicalSchemaModel copy = new LogicalSchemaModel();
        copy.setId(source.getId());
        copy.setName(source.getName() != null ? source.getName() : "DiagramaNormalizado");
        copy.setVersion(source.getVersion());

        List<ClassModel> classCopies = new ArrayList<>();
        if (source.getClasses() != null) {
            for (ClassModel c : source.getClasses()) {
                ClassModel cc = new ClassModel();
                cc.setId(c.getId());
                cc.setName(c.getName());
                cc.setX(c.getX());
                cc.setY(c.getY());
                cc.setVersion(c.getVersion());
                cc.setIsPivotTable(c.getIsPivotTable());
                if (c.getPrimaryKeyColumns() != null) {
                    cc.setPrimaryKeyColumns(new ArrayList<>(c.getPrimaryKeyColumns()));
                }

                List<AttrModel> attrCopies = new ArrayList<>();
                if (c.getAttrs() != null) {
                    for (AttrModel a : c.getAttrs()) {
                        AttrModel ac = new AttrModel();
                        ac.setName(a.getName());
                        ac.setType(a.getType());
                        ac.setVersion(a.getVersion());
                        ac.setIsPrimary(a.getIsPrimary());
                        ac.setIsForeignKey(a.getIsForeignKey());
                        ac.setFkReferencedClass(a.getFkReferencedClass());
                        attrCopies.add(ac);
                    }
                }
                cc.setAttrs(attrCopies);
                classCopies.add(cc);
            }
        }
        copy.setClasses(classCopies);

        List<RelationModel> relCopies = new ArrayList<>();
        if (source.getRelations() != null) {
            for (RelationModel r : source.getRelations()) {
                RelationModel rc = new RelationModel();
                rc.setId(r.getId());
                rc.setFromId(r.getFromId());
                rc.setToId(r.getToId());
                rc.setSourceId(r.getSourceId());
                rc.setTargetId(r.getTargetId());
                rc.setFromName(r.getFromName());
                rc.setToName(r.getToName());
                rc.setMult(r.getMult());
                rc.setRelationType(r.getRelationType());
                rc.setIntermediateTable(r.getIntermediateTable());
                rc.setIntermediateTableName(r.getIntermediateTableName());
                rc.setSourceMultiplicity(r.getSourceMultiplicity());
                rc.setTargetMultiplicity(r.getTargetMultiplicity());
                rc.setVersion(r.getVersion());
                relCopies.add(rc);
            }
        }
        copy.setRelations(relCopies);

        return copy;
    }

    public String sanitizeClassName(String raw) {
        if (raw == null || raw.isBlank()) {
            return "EntityModel";
        }
        String[] parts = raw.trim().split("[^A-Za-z0-9_]+");
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (part.isBlank()) continue;
            // Preservar guiones bajos si representan formato <Origen>_<Destino>
            if (part.contains("_")) {
                String[] subparts = part.split("_");
                for (int i = 0; i < subparts.length; i++) {
                    if (subparts[i].isBlank()) continue;
                    out.append(capitalize(subparts[i]));
                    if (i < subparts.length - 1) {
                        out.append("_");
                    }
                }
            } else {
                out.append(capitalize(part));
            }
        }
        return out.isEmpty() ? "Entity" : out.toString();
    }

    public String sanitizeAttributeName(String raw) {
        if (raw == null || raw.isBlank()) {
            return "attribute";
        }
        String[] parts = raw.trim().split("[^A-Za-z0-9_]+");
        StringBuilder out = new StringBuilder();
        boolean first = true;
        for (String part : parts) {
            if (part.isBlank()) continue;
            if (first) {
                out.append(part.substring(0, 1).toLowerCase(Locale.ROOT));
                if (part.length() > 1) {
                    out.append(part.substring(1));
                }
                first = false;
            } else {
                out.append(capitalize(part));
            }
        }
        return out.isEmpty() ? "attr" : out.toString();
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
                String pascal = capitalize(rawType.trim());
                yield pascal.isEmpty() ? "String" : pascal;
            }
        };
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
