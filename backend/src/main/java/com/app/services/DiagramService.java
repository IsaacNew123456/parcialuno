package com.app.services;

import com.app.dto.DiagramModel;
import com.app.dto.DiagramResponse;
import com.app.dto.DiagramSaveRequest;
import com.app.entities.Diagram;
import com.app.repositories.DiagramRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class DiagramService {

    private static final Logger log = LoggerFactory.getLogger(DiagramService.class);

    private final DiagramRepository repository;
    private final ObjectMapper objectMapper;

    public DiagramService(DiagramRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<DiagramResponse> findAll() {
        return repository.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public DiagramResponse findById(Long id) {
        return toResponse(require(id));
    }

    @Transactional
    public DiagramResponse save(DiagramSaveRequest request) {
        Diagram diagram = new Diagram();
        diagram.setName(request.getName().trim());
        diagram.setContentJson(serializeContent(request));
        return toResponse(repository.save(diagram));
    }

    @Transactional
    public DiagramResponse update(Long id, DiagramSaveRequest request) {
        Diagram diagram = require(id);
        diagram.setName(request.getName().trim());
        diagram.setContentJson(serializeContent(request));
        return toResponse(repository.save(diagram));
    }

    @Transactional
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Diagrama no encontrado");
        }
        repository.deleteById(id);
    }

    /**
     * Aplica mutaciones atómicas granulares al modelo de diagrama y persiste el resultado en PostgreSQL
     * asegurando el incremento de versión optimista.
     */
    @Transactional
    public DiagramModel applyAtomicMutation(Long diagramId, com.app.dto.ws.WsEventType mutationType, com.fasterxml.jackson.databind.JsonNode payload) {
        Diagram diagram = require(diagramId);
        DiagramModel model = parseContent(diagram.getContentJson());
        if (model.getName() == null || model.getName().isBlank()) {
            model.setName(diagram.getName());
        }
        model.setId(diagramId);

        if (mutationType != null) {
            switch (mutationType) {
                case CLASS_CREATED -> {
                    if (payload != null) {
                        try {
                            com.app.dto.ClassModel newClass = objectMapper.treeToValue(payload, com.app.dto.ClassModel.class);
                            if (newClass != null && newClass.getId() != null) {
                                model.getClasses().removeIf(c -> c.getId().equals(newClass.getId()));
                                model.getClasses().add(newClass);
                            }
                        } catch (JsonProcessingException ignored) {}
                    }
                }
                case CLASS_MOVED -> {
                    if (payload != null && payload.has("id")) {
                        String id = payload.get("id").asText();
                        Double x = payload.has("x") ? payload.get("x").asDouble() : null;
                        Double y = payload.has("y") ? payload.get("y").asDouble() : null;
                        model.getClasses().stream()
                                .filter(c -> id.equals(c.getId()))
                                .findFirst()
                                .ifPresent(c -> {
                                    if (x != null) c.setX(x);
                                    if (y != null) c.setY(y);
                                    c.setVersion(c.getVersion() + 1);
                                });
                    }
                }
                case CLASS_UPDATED -> {
                    if (payload != null && payload.has("id")) {
                        String id = payload.get("id").asText();
                        com.fasterxml.jackson.databind.JsonNode patch = payload.has("patch") ? payload.get("patch") : payload;
                        model.getClasses().stream()
                                .filter(c -> id.equals(c.getId()))
                                .findFirst()
                                .ifPresent(c -> {
                                    if (patch.has("name")) {
                                        c.setName(patch.get("name").asText());
                                    }
                                    if (patch.has("attrs")) {
                                        try {
                                            List<com.app.dto.AttrModel> attrs = objectMapper.readerForListOf(com.app.dto.AttrModel.class)
                                                    .readValue(patch.get("attrs"));
                                            c.setAttrs(attrs);
                                        } catch (Exception ignored) {}
                                    }
                                    c.setVersion(c.getVersion() + 1);
                                });
                    }
                }
                case CLASS_DELETED -> {
                    if (payload != null && payload.has("id")) {
                        String id = payload.get("id").asText();
                        model.getClasses().removeIf(c -> id.equals(c.getId()));
                        model.getRelations().removeIf(r -> id.equals(r.getFromId()) || id.equals(r.getToId()));
                    }
                }
                case ATTR_ADDED -> {
                    if (payload != null && payload.has("classId") && payload.has("attr")) {
                        String classId = payload.get("classId").asText();
                        try {
                            com.app.dto.AttrModel newAttr = objectMapper.treeToValue(payload.get("attr"), com.app.dto.AttrModel.class);
                            model.getClasses().stream()
                                    .filter(c -> classId.equals(c.getId()))
                                    .findFirst()
                                    .ifPresent(c -> {
                                        c.getAttrs().add(newAttr);
                                        c.setVersion(c.getVersion() + 1);
                                    });
                        } catch (Exception ignored) {}
                    }
                }
                case ATTR_UPDATED -> {
                    if (payload != null && payload.has("classId")) {
                        String classId = payload.get("classId").asText();
                        int index = payload.has("index") ? payload.get("index").asInt() : -1;
                        model.getClasses().stream()
                                .filter(c -> classId.equals(c.getId()))
                                .findFirst()
                                .ifPresent(c -> {
                                    if (payload.has("attrs")) {
                                        try {
                                            List<com.app.dto.AttrModel> attrs = objectMapper.readerForListOf(com.app.dto.AttrModel.class)
                                                    .readValue(payload.get("attrs"));
                                            c.setAttrs(attrs);
                                        } catch (Exception ignored) {}
                                    } else if (index >= 0 && index < c.getAttrs().size() && payload.has("attr")) {
                                        try {
                                            com.app.dto.AttrModel updatedAttr = objectMapper.treeToValue(payload.get("attr"), com.app.dto.AttrModel.class);
                                            c.getAttrs().set(index, updatedAttr);
                                        } catch (Exception ignored) {}
                                    }
                                    c.setVersion(c.getVersion() + 1);
                                });
                    }
                }
                case ATTR_REMOVED -> {
                    if (payload != null && payload.has("classId")) {
                        String classId = payload.get("classId").asText();
                        int index = payload.has("index") ? payload.get("index").asInt() : -1;
                        String attrName = payload.has("attrName") ? payload.get("attrName").asText() : null;
                        model.getClasses().stream()
                                .filter(c -> classId.equals(c.getId()))
                                .findFirst()
                                .ifPresent(c -> {
                                    if (index >= 0 && index < c.getAttrs().size()) {
                                        c.getAttrs().remove(index);
                                    } else if (attrName != null) {
                                        c.getAttrs().removeIf(a -> attrName.equals(a.getName()));
                                    }
                                    c.setVersion(c.getVersion() + 1);
                                });
                    }
                }
                case RELATION_CREATED -> {
                    if (payload != null) {
                        try {
                            com.app.dto.RelationModel rel = objectMapper.treeToValue(payload, com.app.dto.RelationModel.class);
                            if (rel != null && rel.getId() != null) {
                                // Validar que los extremos de la relación estén presentes
                                String fId = rel.getFromId() != null ? rel.getFromId().trim() : null;
                                String tId = rel.getToId()   != null ? rel.getToId().trim()   : null;
                                if (fId == null || fId.isBlank() || tId == null || tId.isBlank()) {
                                    log.warn("[DiagramService] RELATION_CREATED ignorada: fromId o toId ausentes. diagramId={}", diagramId);
                                    break;
                                }
                                // Normalizar relationType para garantizar sincronización correcta
                                String effectiveType = rel.getEffectiveRelationType();
                                if (!effectiveType.equals(rel.getRelationType())) {
                                    log.warn("[DiagramService] relationType normalizado de '{}' a '{}' diagramId={}",
                                             rel.getRelationType(), effectiveType, diagramId);
                                    rel.setRelationType(effectiveType);
                                }
                                model.getRelations().removeIf(r -> r.getId().equals(rel.getId()));
                                model.getRelations().add(rel);
                            }
                        } catch (Exception ignored) {}
                    }
                }
                case RELATION_DELETED -> {
                    if (payload != null && payload.has("id")) {
                        String id = payload.get("id").asText();
                        model.getRelations().removeIf(r -> id.equals(r.getId()));
                    }
                }
                default -> {}
            }
        }

        // Incrementar versión atómica del diagrama
        long nextVersion = (model.getVersion() != 0 ? model.getVersion() : diagram.getVersion()) + 1;
        model.setVersion(nextVersion);
        diagram.setVersion(nextVersion);

        try {
            diagram.setContentJson(objectMapper.writeValueAsString(model));
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error serializando modelo UML");
        }

        repository.save(diagram);
        return model;
    }

    public DiagramModel parseContent(String contentJson) {
        if (contentJson == null || contentJson.isBlank()) {
            return new DiagramModel();
        }
        try {
            return objectMapper.readValue(contentJson, DiagramModel.class);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "contentJson no es un modelo UML válido");
        }
    }

    private Diagram require(Long id) {
        return repository.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Diagrama no encontrado"));
    }

    public DiagramResponse toResponse(Diagram diagram) {
        return DiagramResponse.from(diagram, parseContent(diagram.getContentJson()));
    }

    private String serializeContent(DiagramSaveRequest request) {
        if (request.getContentJson() != null && !request.getContentJson().isBlank()) {
            parseContent(request.getContentJson());
            return request.getContentJson();
        }
        DiagramModel model = new DiagramModel();
        model.setName(request.getName());
        if (request.getClasses() != null) {
            model.setClasses(request.getClasses());
        }
        if (request.getRelations() != null) {
            model.setRelations(request.getRelations());
        }
        try {
            return objectMapper.writeValueAsString(model);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "No se pudo serializar el modelo UML");
        }
    }
}
