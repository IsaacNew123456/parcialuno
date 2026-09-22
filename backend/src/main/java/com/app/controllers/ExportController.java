package com.app.controllers;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.repositories.DiagramRepository;
import com.app.services.CodeGeneratorService;
import com.app.services.DiagramService;
import com.app.services.PostmanCollectionService;
import com.app.services.SpringBootProjectGeneratorService;
import com.app.services.XmiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/export")
@CrossOrigin("*")
public class ExportController {

    private static final Logger log = LoggerFactory.getLogger(ExportController.class);

    private static final MediaType ZIP = MediaType.parseMediaType("application/zip");
    private static final MediaType XMI = MediaType.parseMediaType("application/xml");

    private final CodeGeneratorService codeGeneratorService;
    private final XmiService xmiService;
    private final SpringBootProjectGeneratorService projectGeneratorService;
    private final PostmanCollectionService postmanCollectionService;
    private final DiagramRepository diagramRepository;
    private final DiagramService diagramService;

    public ExportController(CodeGeneratorService codeGeneratorService, XmiService xmiService) {
        this(codeGeneratorService, xmiService, null, null, null, null);
    }

    public ExportController(CodeGeneratorService codeGeneratorService,
                            XmiService xmiService,
                            SpringBootProjectGeneratorService projectGeneratorService) {
        this(codeGeneratorService, xmiService, projectGeneratorService, null, null, null);
    }

    public ExportController(CodeGeneratorService codeGeneratorService,
                            XmiService xmiService,
                            SpringBootProjectGeneratorService projectGeneratorService,
                            PostmanCollectionService postmanCollectionService) {
        this(codeGeneratorService, xmiService, projectGeneratorService, postmanCollectionService, null, null);
    }

    @Autowired
    public ExportController(CodeGeneratorService codeGeneratorService,
                            XmiService xmiService,
                            SpringBootProjectGeneratorService projectGeneratorService,
                            @Autowired(required = false) PostmanCollectionService postmanCollectionService,
                            @Autowired(required = false) DiagramRepository diagramRepository,
                            @Autowired(required = false) DiagramService diagramService) {
        this.codeGeneratorService = codeGeneratorService;
        this.xmiService = xmiService;
        this.projectGeneratorService = projectGeneratorService;
        this.postmanCollectionService = postmanCollectionService != null
                ? postmanCollectionService
                : new PostmanCollectionService();
        this.diagramRepository = diagramRepository;
        this.diagramService = diagramService;
    }

    /**
     * Endpoint para descargar el proyecto en ZIP.
     * Soporta tanto GET (utilizado directamente por aplicaciones móviles como Expo FileSystem.downloadAsync)
     * como POST con el modelo del diagrama en el cuerpo (usado por el cliente Web).
     */
    @RequestMapping(
            value = "/zip",
            method = {RequestMethod.GET, RequestMethod.POST},
            produces = {"application/zip", "application/octet-stream"}
    )
    public ResponseEntity<byte[]> exportZip(
            @RequestBody(required = false) DiagramModel diagram,
            @RequestParam(value = "diagramId", required = false) Long diagramId
    ) {
        log.info("[EXPORT] Solicitud de descarga ZIP recibida. diagramId={}, hasBodyModel={}",
                diagramId, diagram != null);
        try {
            DiagramModel target = resolveDiagram(diagram, diagramId);
            byte[] archive = codeGeneratorService.buildZip(target);
            if (archive == null || archive.length == 0) {
                log.error("[EXPORT] El archivo ZIP generado está vacío para diagramId={}", diagramId);
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "El archivo ZIP generado está vacío");
            }
            ContentDisposition disposition = ContentDisposition.attachment()
                    .filename("spring-boot-backend.zip")
                    .build();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                    .contentType(ZIP)
                    .contentLength(archive.length)
                    .body(archive);
        } catch (ResponseStatusException ex) {
            log.error("[EXPORT] Error HTTP al generar exportación ZIP: status={} reason={}",
                    ex.getStatusCode(), ex.getReason(), ex);
            throw ex;
        } catch (IllegalArgumentException ex) {
            log.error("[EXPORT] Parámetros no válidos para exportar ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        } catch (SecurityException ex) {
            log.error("[EXPORT] Permisos insuficientes al generar ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Permisos insuficientes para exportar ZIP", ex);
        } catch (NullPointerException ex) {
            log.error("[EXPORT] Puntero nulo detectado al empaquetar ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El diagrama contiene referencias nulas no procesables", ex);
        } catch (Exception ex) {
            log.error("[EXPORT] Error inesperado en el servidor al exportar ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo generar el archivo ZIP: " + ex.getMessage(), ex);
        }
    }

    /**
     * Endpoint para exportar el proyecto generado completo en 4 capas.
     * Soporta tanto GET como POST.
     */
    @RequestMapping(
            value = {"/project", "/code"},
            method = {RequestMethod.GET, RequestMethod.POST},
            produces = {"application/zip", "application/octet-stream"}
    )
    public ResponseEntity<byte[]> exportProject(
            @RequestBody(required = false) DiagramModel diagram,
            @RequestParam(value = "diagramId", required = false) Long diagramId
    ) {
        log.info("[EXPORT] Solicitud de exportación de proyecto recibida. diagramId={}, hasBodyModel={}",
                diagramId, diagram != null);
        try {
            DiagramModel target = resolveDiagram(diagram, diagramId);
            byte[] archive = projectGeneratorService.generateProjectZip(target);
            if (archive == null || archive.length == 0) {
                log.error("[EXPORT] El proyecto ZIP generado está vacío para diagramId={}", diagramId);
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "El proyecto ZIP generado está vacío");
            }
            ContentDisposition disposition = ContentDisposition.attachment()
                    .filename("backend-spring-boot.zip")
                    .build();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                    .contentType(ZIP)
                    .contentLength(archive.length)
                    .body(archive);
        } catch (ResponseStatusException ex) {
            log.error("[EXPORT] Error HTTP al generar proyecto ZIP: status={} reason={}",
                    ex.getStatusCode(), ex.getReason(), ex);
            throw ex;
        } catch (IllegalArgumentException ex) {
            log.error("[EXPORT] Parámetros no válidos para proyecto ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        } catch (SecurityException ex) {
            log.error("[EXPORT] Permisos insuficientes para generar proyecto ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Permisos insuficientes para exportar", ex);
        } catch (NullPointerException ex) {
            log.error("[EXPORT] Puntero nulo detectado al generar proyecto ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El modelo contiene referencias nulas no procesables", ex);
        } catch (Exception ex) {
            log.error("[EXPORT] Error inesperado en el servidor al exportar proyecto ZIP: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo generar el proyecto en ZIP: " + ex.getMessage(), ex);
        }
    }

    @PostMapping(value = "/xmi", produces = "application/xml")
    public ResponseEntity<byte[]> exportXmi(@RequestBody(required = false) DiagramModel diagram,
                                            @RequestParam(value = "diagramId", required = false) Long diagramId) {
        try {
            DiagramModel target = resolveDiagram(diagram, diagramId);
            String xmiXml = xmiService.exportToXmi(target);
            byte[] bytes = xmiXml.getBytes(StandardCharsets.UTF_8);
            String name = (target != null && target.getName() != null && !target.getName().isBlank())
                    ? target.getName().replaceAll("[^a-zA-Z0-9_-]", "_")
                    : "diagrama";
            ContentDisposition disposition = ContentDisposition.attachment()
                    .filename(name + ".xmi")
                    .build();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                    .contentType(XMI)
                    .contentLength(bytes.length)
                    .body(bytes);
        } catch (Exception ex) {
            log.error("[EXPORT] Error al exportar XMI: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error al exportar XMI: " + ex.getMessage(), ex);
        }
    }

    @PostMapping(value = "/postman", produces = "application/json")
    public ResponseEntity<byte[]> exportPostman(@RequestBody(required = false) DiagramModel diagram,
                                                @RequestParam(value = "diagramId", required = false) Long diagramId) {
        try {
            DiagramModel target = resolveDiagram(diagram, diagramId);
            byte[] jsonBytes = postmanCollectionService.generateCollectionJson(target)
                    .getBytes(StandardCharsets.UTF_8);
            ContentDisposition disposition = ContentDisposition.attachment()
                    .filename("postman-collection.json")
                    .build();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                    .contentType(MediaType.APPLICATION_JSON)
                    .contentLength(jsonBytes.length)
                    .body(jsonBytes);
        } catch (Exception ex) {
            log.error("[EXPORT] Error al exportar Postman Collection: {}", ex.getMessage(), ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error al exportar Postman: " + ex.getMessage(), ex);
        }
    }

    /**
     * Resuelve el diagrama a exportar, priorizando:
     * 1. El diagrama enviado en el cuerpo de la petición.
     * 2. La búsqueda por ID en base de datos si se especificó diagramId.
     * 3. El diagrama más reciente persistido en la base de datos.
     * 4. Un modelo starter por defecto para garantizar que la app móvil siempre pueda descargar un ZIP válido.
     */
    private DiagramModel resolveDiagram(DiagramModel diagram, Long diagramId) {
        if (diagram != null && diagram.getClasses() != null && !diagram.getClasses().isEmpty()) {
            return diagram;
        }

        // 1. Buscar por diagramId explícito
        if (diagramId != null && diagramRepository != null) {
            try {
                Optional<com.app.entities.Diagram> entityOpt = diagramRepository.findById(diagramId);
                if (entityOpt.isPresent()) {
                    DiagramModel loaded = parseDiagramEntity(entityOpt.get());
                    if (loaded != null && loaded.getClasses() != null && !loaded.getClasses().isEmpty()) {
                        log.info("[EXPORT] Diagrama cargado con éxito por diagramId={}", diagramId);
                        return loaded;
                    }
                } else {
                    log.warn("[EXPORT] No se encontró diagrama en base de datos con id={}", diagramId);
                }
            } catch (Exception e) {
                log.warn("[EXPORT] Error al buscar diagrama por id={}: {}", diagramId, e.getMessage());
            }
        }

        // 2. Buscar el diagrama más reciente disponible en base de datos
        if (diagramRepository != null) {
            try {
                List<com.app.entities.Diagram> all = diagramRepository.findAll(Sort.by(Sort.Direction.DESC, "id"));
                for (com.app.entities.Diagram d : all) {
                    DiagramModel loaded = parseDiagramEntity(d);
                    if (loaded != null && loaded.getClasses() != null && !loaded.getClasses().isEmpty()) {
                        log.info("[EXPORT] Modelo recuperado de diagrama reciente en BD id={} name='{}'", d.getId(), d.getName());
                        return loaded;
                    }
                }
            } catch (Exception e) {
                log.warn("[EXPORT] No se pudieron consultar diagramas de la base de datos: {}", e.getMessage());
            }
        }

        // 3. Fallback a modelo inicial para evitar HTTP 500 y permitir descarga fluida en móvil
        log.info("[EXPORT] Utilizando diagrama starter por defecto para asegurar descarga exitosa en cliente móvil");
        return createDefaultStarterDiagram();
    }

    private DiagramModel parseDiagramEntity(com.app.entities.Diagram d) {
        if (d == null || d.getContentJson() == null || d.getContentJson().isBlank()) {
            return null;
        }
        if (diagramService != null) {
            try {
                DiagramModel m = diagramService.parseContent(d.getContentJson());
                if (m.getName() == null || m.getName().isBlank()) {
                    m.setName(d.getName());
                }
                m.setId(d.getId());
                return m;
            } catch (Exception e) {
                log.warn("[EXPORT] No se pudo deserializar contentJson del diagrama id={}: {}", d.getId(), e.getMessage());
            }
        }
        return null;
    }

    private DiagramModel createDefaultStarterDiagram() {
        DiagramModel model = new DiagramModel();
        model.setName("DiagramaBase");

        ClassModel usuario = new ClassModel();
        usuario.setId("cls_user");
        usuario.setName("Usuario");
        usuario.setAttrs(new ArrayList<>());

        AttrModel id = new AttrModel();
        id.setName("id");
        id.setType("Long");
        usuario.getAttrs().add(id);

        AttrModel nombre = new AttrModel();
        nombre.setName("nombre");
        nombre.setType("String");
        usuario.getAttrs().add(nombre);

        AttrModel email = new AttrModel();
        email.setName("email");
        email.setType("String");
        usuario.getAttrs().add(email);

        model.setClasses(new ArrayList<>(List.of(usuario)));
        model.setRelations(new ArrayList<>());
        return model;
    }
}
