package com.app.controllers;

import com.app.dto.AiCommandRequest;
import com.app.dto.AiDomainResponse;
import com.app.dto.ai.BusinessChatRequest;
import com.app.dto.ai.BusinessChatResponse;
import com.app.dto.ai.ScanDiagramRequest;
import com.app.dto.ai.ScanDiagramResponse;
import com.app.dto.ai.TranscribeAudioResponse;
import com.app.services.AiCommandService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Base64;

@RestController
@RequestMapping("/api/ai")
@CrossOrigin(origins = "*")
public class AiController {

    private static final Logger log = LoggerFactory.getLogger(AiController.class);

    private final AiCommandService aiCommandService;

    public AiController(AiCommandService aiCommandService) {
        this.aiCommandService = aiCommandService;
    }

    /**
     * Endpoint para generar arquitectura conceptual de software a partir de órdenes en lenguaje natural.
     * POST /api/ai/command
     * 
     * Recibe AiCommandRequest y retorna AiDomainResponse estructurado con clases, atributos tipados y relaciones UML.
     * Compatible tanto con clientes web como móviles.
     */
    @PostMapping("/command")
    public ResponseEntity<AiDomainResponse> executeCommand(@RequestBody AiCommandRequest request) {
        log.info("[AI_CONTROLLER] Received conceptual architecture request: prompt='{}'",
                request != null ? request.getPrompt() : "null");

        AiDomainResponse response = aiCommandService.generateConceptualArchitecture(request);

        log.info("[AI_CONTROLLER] Response source='{}', domain='{}', classesCount={}, relationsCount={}, success={}",
                response.getSource(), response.getDomain(),
                response.getClasses() != null ? response.getClasses().size() : 0,
                response.getRelations() != null ? response.getRelations().size() : 0,
                response.isSuccess());

        return ResponseEntity.ok(response);
    }

    /**
     * Chatbot de IA Empresarial (Voz y Texto) utilizando el modelo local gemma2:2b.
     * POST /api/ai/business-chat
     */
    @PostMapping("/business-chat")
    public ResponseEntity<BusinessChatResponse> businessChat(@RequestBody BusinessChatRequest request) {
        log.info("[AI_CONTROLLER] Received business chat message: '{}', domainContext='{}'",
                request != null ? request.getMessage() : "null",
                request != null ? request.getDomainContext() : "");

        BusinessChatResponse response = aiCommandService.chatBusiness(request);

        log.info("[AI_CONTROLLER] Business chat response: source='{}', hasArchitecture={}, success={}",
                response.getSource(),
                response.getSuggestedArchitecture() != null,
                response.isSuccess());

        return ResponseEntity.ok(response);
    }

    /**
     * Procesamiento visual de diagramas de clases dibujados utilizando el modelo moondream.
     * POST /api/ai/scan-diagram
     * Acepta JSON con base64 o multipart/form-data.
     */
    @PostMapping(value = "/scan-diagram", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ScanDiagramResponse> scanDiagramJson(@RequestBody ScanDiagramRequest request) {
        log.info("[AI_CONTROLLER] Received scan-diagram JSON request (base64 length={})",
                request != null && request.getImageBase64() != null ? request.getImageBase64().length() : 0);

        String base64 = (request != null) ? request.getImageBase64() : null;
        ScanDiagramResponse response = aiCommandService.scanDiagram(base64);

        log.info("[AI_CONTROLLER] Scan diagram result: source='{}', classes={}, relations={}, success={}",
                response.getSource(),
                response.getClasses() != null ? response.getClasses().size() : 0,
                response.getRelations() != null ? response.getRelations().size() : 0,
                response.isSuccess());

        return ResponseEntity.ok(response);
    }

    /**
     * Sobrecarga de escaneo de diagrama para subida de archivo multipart directo.
     */
    @PostMapping(value = "/scan-diagram", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ScanDiagramResponse> scanDiagramMultipart(@RequestParam("file") MultipartFile file) {
        log.info("[AI_CONTROLLER] Received scan-diagram Multipart request: name='{}', size={} bytes",
                file != null ? file.getOriginalFilename() : "null",
                file != null ? file.getSize() : 0);

        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(ScanDiagramResponse.builder()
                    .success(false)
                    .message("El archivo de imagen está vacío o no fue enviado.")
                    .build());
        }

        try {
            String base64 = Base64.getEncoder().encodeToString(file.getBytes());
            ScanDiagramResponse response = aiCommandService.scanDiagram(base64);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("[AI_CONTROLLER] Error reading multipart image: {}", e.getMessage(), e);
            return ResponseEntity.ok(ScanDiagramResponse.builder()
                    .success(false)
                    .message("Error leyendo la imagen: " + e.getMessage())
                    .build());
        }
    }

    /**
     * Transcripción de audio a texto mediante Ollama/Whisper.
     * POST /api/ai/transcribe-audio
     * Acepta multipart/form-data con un campo 'audio' (archivo .m4a / .wav / .ogg).
     */
    @PostMapping(value = "/transcribe-audio", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TranscribeAudioResponse> transcribeAudio(
            @RequestParam("audio") MultipartFile audioFile) {

        log.info("[AI_CONTROLLER] Received transcribe-audio request: name='{}', size={} bytes, contentType='{}'",
                audioFile != null ? audioFile.getOriginalFilename() : "null",
                audioFile != null ? audioFile.getSize() : 0,
                audioFile != null ? audioFile.getContentType() : "null");

        if (audioFile == null || audioFile.isEmpty()) {
            log.warn("[AI_CONTROLLER] transcribe-audio received an empty or null file.");
            return ResponseEntity.badRequest().body(
                    TranscribeAudioResponse.builder()
                            .success(false)
                            .message("El archivo de audio está vacío o no fue enviado correctamente.")
                            .transcript("")
                            .source("none")
                            .build()
            );
        }

        try {
            TranscribeAudioResponse response = aiCommandService.transcribeAudio(audioFile);
            log.info("[AI_CONTROLLER] Transcription result: success={}, source='{}', transcriptLength={}",
                    response.isSuccess(), response.getSource(),
                    response.getTranscript() != null ? response.getTranscript().length() : 0);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("[AI_CONTROLLER] Unexpected error in transcribe-audio: {}", e.getMessage(), e);
            return ResponseEntity.ok(
                    TranscribeAudioResponse.builder()
                            .success(false)
                            .message("Error interno al transcribir el audio: " + e.getMessage())
                            .transcript("")
                            .source("error")
                            .build()
            );
        }
    }
}
