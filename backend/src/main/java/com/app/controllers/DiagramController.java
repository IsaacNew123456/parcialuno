package com.app.controllers;

import com.app.dto.DiagramModel;
import com.app.dto.DiagramResponse;
import com.app.dto.DiagramSaveRequest;
import com.app.dto.LogicalSchemaModel;
import com.app.services.DiagramService;
import com.app.services.NormalizationService;
import com.app.services.XmiService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.List;

@RestController
@RequestMapping("/api/diagrams")
@CrossOrigin("*")
public class DiagramController {

    private final DiagramService diagramService;
    private final XmiService xmiService;
    private final NormalizationService normalizationService;

    public DiagramController(DiagramService diagramService, XmiService xmiService) {
        this(diagramService, xmiService, new NormalizationService());
    }

    @Autowired
    public DiagramController(DiagramService diagramService, XmiService xmiService, NormalizationService normalizationService) {
        this.diagramService = diagramService;
        this.xmiService = xmiService;
        this.normalizationService = normalizationService != null ? normalizationService : new NormalizationService();
    }

    @GetMapping
    public ResponseEntity<List<DiagramResponse>> findAll() {
        return ResponseEntity.ok(diagramService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<DiagramResponse> findById(@PathVariable Long id) {
        return ResponseEntity.ok(diagramService.findById(id));
    }

    @PostMapping
    public ResponseEntity<DiagramResponse> create(@Valid @RequestBody DiagramSaveRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(diagramService.save(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<DiagramResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody DiagramSaveRequest request) {
        return ResponseEntity.ok(diagramService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        diagramService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/import-xmi", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DiagramModel> importXmiFile(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("El archivo XMI proporcionado está vacío");
        }
        try (InputStream in = file.getInputStream()) {
            DiagramModel diagram = xmiService.importFromXmi(in);
            if (file.getOriginalFilename() != null && !file.getOriginalFilename().isBlank()) {
                String originalName = file.getOriginalFilename().replaceFirst("[.][^.]+$", "");
                if (diagram.getName() == null || diagram.getName().equals("Diagrama Importado") || diagram.getName().equals("ModeloUML")) {
                    diagram.setName(originalName);
                }
            }
            return ResponseEntity.ok(diagram);
        } catch (Exception e) {
            throw new RuntimeException("Error al procesar archivo XMI: " + e.getMessage(), e);
        }
    }

    @PostMapping(value = "/import-xmi", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_PLAIN_VALUE, "application/vnd.xmi+xml"})
    public ResponseEntity<DiagramModel> importXmiText(@RequestBody String xmlContent) {
        if (xmlContent == null || xmlContent.isBlank()) {
            throw new IllegalArgumentException("El contenido XML/XMI no puede estar vacío");
        }
        DiagramModel diagram = xmiService.importFromXmi(xmlContent);
        return ResponseEntity.ok(diagram);
    }

    @PostMapping("/normalize")
    public ResponseEntity<LogicalSchemaModel> normalize(@RequestBody DiagramModel diagram) {
        return ResponseEntity.ok(normalizationService.normalizeToLogicalSchema(diagram));
    }
}
