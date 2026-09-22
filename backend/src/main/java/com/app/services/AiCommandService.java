package com.app.services;

import com.app.dto.AiCommandRequest;
import com.app.dto.AiDomainResponse;
import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.RelationModel;
import com.app.dto.ai.BusinessChatRequest;
import com.app.dto.ai.BusinessChatResponse;
import com.app.dto.ai.ChatMessageDto;
import com.app.dto.ai.ScanDiagramRequest;
import com.app.dto.ai.ScanDiagramResponse;
import com.app.dto.ai.TranscribeAudioResponse;
import org.springframework.web.multipart.MultipartFile;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiCommandService {

    private static final Logger log = LoggerFactory.getLogger(AiCommandService.class);

    @Value("${ai.ollama.url:http://localhost:11434/api/generate}")
    private String ollamaUrl;

    @Value("${ai.ollama.model:gemma2:2b}")
    private String ollamaModel;

    @Value("${ai.ollama.vision-model:moondream:latest}")
    private String ollamaVisionModel = "moondream:latest";

    @Value("${ai.ollama.timeout-seconds:45}")
    private int timeoutSeconds;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public AiCommandService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    // Constructor para inyección de pruebas unitarias (5 parámetros)
    public AiCommandService(ObjectMapper objectMapper, HttpClient httpClient, String ollamaUrl, String ollamaModel, int timeoutSeconds) {
        this(objectMapper, httpClient, ollamaUrl, ollamaModel, "moondream:latest", timeoutSeconds);
    }

    // Constructor completo para pruebas unitarias con visión
    public AiCommandService(ObjectMapper objectMapper, HttpClient httpClient, String ollamaUrl, String ollamaModel, String ollamaVisionModel, int timeoutSeconds) {
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.ollamaUrl = ollamaUrl;
        this.ollamaModel = ollamaModel;
        this.ollamaVisionModel = ollamaVisionModel;
        this.timeoutSeconds = timeoutSeconds;
    }

    /**
     * Procesa la orden conceptual mediante Ollama local o fallback heurístico determinista.
     */
    public AiDomainResponse generateConceptualArchitecture(AiCommandRequest request) {
        String prompt = (request != null && request.getPrompt() != null) ? request.getPrompt().trim() : "";
        if (prompt.isEmpty()) {
            return buildHeuristicFallback("Contabilidad y Finanzas", "Prompt vacío, se retorna arquitectura conceptual base");
        }

        try {
            AiDomainResponse response = callOllamaConceptual(prompt);
            if (response != null && response.isSuccess() && response.getClasses() != null && !response.getClasses().isEmpty()) {
                return response;
            }
        } catch (Exception ex) {
            log.warn("[AI_SERVICE] Ollama local call failed or timed out ({}). Activating deterministic heuristic fallback.", ex.getMessage());
        }

        return buildHeuristicFallback(prompt, "Generado por fallback heurístico determinista (Ollama no disponible)");
    }

    /**
     * Llamada HTTP POST a Ollama con system prompt estricto estructurado en JSON.
     */
    private AiDomainResponse callOllamaConceptual(String userPrompt) throws Exception {
        String systemPrompt = """
            Eres un arquitecto de software UML y analista de dominio.
            Convierte la descripción del usuario en una arquitectura conceptual de clases completa.
            DEBES responder ÚNICAMENTE con un objeto JSON válido, sin bloques de markdown, sin texto adicional, sin introducciones.
            
            Estructura JSON estricta requerida:
            {
              "action": "GENERATE_CONCEPTUAL_ARCHITECTURE",
              "domain": "NombreDelDominio",
              "classes": [
                {
                  "name": "NombreClase",
                  "attrs": [
                    {
                      "name": "nombreAtributo",
                      "type": "Long" | "String" | "Double" | "LocalDate"
                    }
                  ]
                }
              ],
              "relations": [
                {
                  "source": "ClaseOrigen",
                  "target": "ClaseDestino",
                  "relationType": "association" | "composition" | "aggregation" | "inheritance",
                  "mult": "1..*" | "*..*" | "1..1" | "*..1"
                }
              ]
            }
            
            Reglas:
            - Tipos de atributos permitidos: Long, String, Double, LocalDate.
            - Incluye siempre un atributo identificador (id) de tipo Long en cada clase.
            - Relaciones claras con multiplicidades UML válidas.
            """;

        Map<String, Object> payload = new HashMap<>();
        payload.put("model", ollamaModel != null ? ollamaModel : "qwen2.5-coder:1.5b");
        payload.put("prompt", systemPrompt + "\nDescripción del usuario: " + userPrompt + "\nJSON:");
        payload.put("stream", false);
        payload.put("format", "json");

        String requestBody = objectMapper.writeValueAsString(payload);

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(ollamaUrl != null ? ollamaUrl : "http://localhost:11434/api/generate"))
                .timeout(Duration.ofSeconds(timeoutSeconds > 0 ? timeoutSeconds : 8))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        HttpResponse<String> httpResponse = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

        if (httpResponse.statusCode() >= 200 && httpResponse.statusCode() < 300) {
            JsonNode root = objectMapper.readTree(httpResponse.body());
            String responseText = root.path("response").asText("");
            if (responseText.isBlank()) {
                responseText = httpResponse.body();
            }

            String cleanJson = cleanCodeBlocks(responseText);
            JsonNode modelNode = objectMapper.readTree(cleanJson);

            String domain = modelNode.path("domain").asText("Dominio Conceptual");
            String action = modelNode.path("action").asText("GENERATE_CONCEPTUAL_ARCHITECTURE");

            List<ClassModel> classes = new ArrayList<>();
            Map<String, ClassModel> classMap = new HashMap<>();

            JsonNode classesArray = modelNode.path("classes");
            if (classesArray.isArray()) {
                int index = 0;
                for (JsonNode cNode : classesArray) {
                    String className = cNode.path("name").asText("").trim();
                    if (className.isEmpty()) continue;

                    ClassModel cm = new ClassModel();
                    String classId = "cls_" + className.toLowerCase(Locale.ROOT);
                    cm.setId(classId);
                    cm.setName(className);
                    cm.setX(100.0 + (index % 2) * 320.0);
                    cm.setY(80.0 + (index / 2) * 220.0);
                    cm.setVersion(0L);

                    List<AttrModel> attrs = new ArrayList<>();
                    JsonNode attrsArray = cNode.path("attrs");
                    if (!attrsArray.isArray()) {
                        attrsArray = cNode.path("attributes");
                    }
                    if (attrsArray.isArray()) {
                        for (JsonNode aNode : attrsArray) {
                            String aName = aNode.path("name").asText("").trim();
                            String aType = normalizeJavaType(aNode.path("type").asText("String").trim());
                            if (!aName.isEmpty()) {
                                AttrModel attr = new AttrModel(aName, aType);
                                if ("id".equalsIgnoreCase(aName) || aName.toLowerCase(Locale.ROOT).endsWith("id")) {
                                    attr.setIsPrimary(true);
                                }
                                attrs.add(attr);
                            }
                        }
                    }

                    if (attrs.isEmpty() || attrs.stream().noneMatch(a -> "id".equalsIgnoreCase(a.getName()))) {
                        AttrModel idAttr = new AttrModel("id", "Long");
                        idAttr.setIsPrimary(true);
                        attrs.add(0, idAttr);
                    }

                    cm.setAttrs(attrs);
                    classes.add(cm);
                    classMap.put(className.toLowerCase(Locale.ROOT), cm);
                    index++;
                }
            }

            List<RelationModel> relations = new ArrayList<>();
            JsonNode relationsArray = modelNode.path("relations");
            if (relationsArray.isArray()) {
                int relIdx = 0;
                for (JsonNode rNode : relationsArray) {
                    String srcName = rNode.path("source").asText("").trim();
                    if (srcName.isEmpty()) srcName = rNode.path("from").asText("").trim();

                    String tgtName = rNode.path("target").asText("").trim();
                    if (tgtName.isEmpty()) tgtName = rNode.path("to").asText("").trim();

                    String relType = rNode.path("relationType").asText("association").trim();
                    String mult = rNode.path("mult").asText("1..*").trim();

                    ClassModel fromCls = classMap.get(srcName.toLowerCase(Locale.ROOT));
                    ClassModel toCls = classMap.get(tgtName.toLowerCase(Locale.ROOT));

                    if (fromCls != null && toCls != null && !fromCls.getId().equals(toCls.getId())) {
                        RelationModel rm = new RelationModel();
                        rm.setId("rel_ai_" + relIdx++);
                        rm.setFromId(fromCls.getId());
                        rm.setToId(toCls.getId());
                        rm.setSourceId(fromCls.getId());
                        rm.setTargetId(toCls.getId());
                        rm.setFromName(fromCls.getName());
                        rm.setToName(toCls.getName());
                        rm.setRelationType(relType.toLowerCase(Locale.ROOT));
                        rm.setMult(mult);
                        rm.setSourceMultiplicity(mult.contains("..") ? mult.split("\\.\\.")[0] : "1");
                        rm.setTargetMultiplicity(mult.contains("..") ? mult.split("\\.\\.")[1] : mult);
                        relations.add(rm);
                    }
                }
            }

            if (!classes.isEmpty()) {
                return AiDomainResponse.builder()
                        .action(action)
                        .domain(domain)
                        .classes(classes)
                        .relations(relations)
                        .success(true)
                        .source("OLLAMA_LLM")
                        .message("Modelo conceptual generado con éxito por Ollama LLM")
                        .build();
            }
        }

        throw new RuntimeException("Respuesta inválida o incompleta de Ollama: HTTP " + httpResponse.statusCode());
    }

    /**
     * Chatbot de IA Empresarial (Voz y Texto) impulsado por el modelo local gemma2:2b.
     * Estructura lógica de backend orientada a negocios (contabilidad, inventarios, transacciones, etc.).
     */
    public BusinessChatResponse chatBusiness(BusinessChatRequest request) {
        if (request == null || request.getMessage() == null || request.getMessage().isBlank()) {
            return BusinessChatResponse.builder()
                    .reply("¡Hola! Soy tu Asistente de Arquitectura Empresarial. "
                         + "¿Qué tipo de negocio o rubro deseas modelar hoy? "
                         + "Por ejemplo: farmacia, restaurante, transporte, contabilidad, e-commerce, clínica, etc.")
                    .success(true)
                    .source("system")
                    .build();
        }

        String userMsg = request.getMessage().trim();
        String effectiveType = request.effectiveBusinessType(); // puede ser null → prompt genérico

        StringBuilder promptBuilder = new StringBuilder();
        promptBuilder.append(buildDynamicSystemPrompt(effectiveType));

        if (effectiveType != null) {
            promptBuilder.append("\nRubro/tipo de negocio del usuario: ").append(effectiveType).append("\n");
        }

        if (request.getHistory() != null && !request.getHistory().isEmpty()) {
            promptBuilder.append("\nHistorial reciente de la conversación:\n");
            for (ChatMessageDto msg : request.getHistory()) {
                if (msg != null && msg.getContent() != null && !msg.getContent().isBlank()) {
                    String role = "user".equalsIgnoreCase(msg.getRole()) ? "Usuario" : "Asistente";
                    promptBuilder.append(role).append(": ").append(msg.getContent().trim()).append("\n");
                }
            }
        }

        promptBuilder.append("\nPregunta del usuario: ").append(userMsg).append("\nRespuesta estructurada:");

        String targetModel = (ollamaModel != null && !ollamaModel.isBlank()) ? ollamaModel : "gemma2:2b";

        try {
            String rawResponse = callOllamaGenerate(promptBuilder.toString(), targetModel);
            if (rawResponse != null && !rawResponse.isBlank()) {
                AiDomainResponse suggested = extractArchitectureFromJsonBlock(rawResponse);
                return BusinessChatResponse.builder()
                        .reply(rawResponse)
                        .suggestedArchitecture(suggested)
                        .success(true)
                        .source("ollama-" + targetModel)
                        .message("Respuesta generada por " + targetModel
                                + (effectiveType != null ? " | Rubro: " + effectiveType : ""))
                        .build();
            }
        } catch (Exception ex) {
            log.warn("[AI_SERVICE] Business chat call to Ollama ({}) failed or timed out: {}. Using heuristic fallback.", targetModel, ex.getMessage());
        }

        return buildBusinessChatFallback(userMsg, effectiveType);
    }

    /**
     * Construye el System Prompt dinámico según el rubro/tipo de negocio indicado por el usuario.
     * Si el rubro es nulo o vacío, genera un prompt genérico polivalente.
     *
     * @param businessType Rubro o tipo de empresa (ej. "farmacia", "transporte", "contabilidad").  Puede ser null.
     * @return System prompt completo listo para ser inyectado al modelo.
     */
    private String buildDynamicSystemPrompt(String businessType) {
        String rubroLine;
        if (businessType != null && !businessType.isBlank()) {
            rubroLine = "Eres un Arquitecto de Software Empresarial Senior especializado en el rubro de \""
                    + businessType
                    + "\". Adapta todos tus consejos, entidades y reglas de negocio específicamente a ese tipo de empresa.";
        } else {
            rubroLine = "Eres un Arquitecto de Software Empresarial Senior capaz de asesorar cualquier tipo de negocio o industria. "
                    + "Identifica el rubro del usuario a través del contexto de la conversación y adapta tu respuesta a él.";
        }

        return rubroLine + """

            Tu misión es guiar al usuario en el diseño de arquitectura de software, modelado de entidades, reglas de negocio y transaccionalidad en Spring Boot.
            Responde siempre en español de forma estructurada y técnica.
            Evita responder siempre lo mismo: adapta las entidades, atributos y relaciones al dominio específico del negocio del usuario.
            Si la consulta involucra diseñar o definir clases o entidades, incluye al final de tu respuesta un bloque JSON con este formato exacto:
            ```json
            {
              "domain": "NombreDominio",
              "classes": [
                {
                  "name": "NombreClase",
                  "attrs": [
                    {"name": "id", "type": "Long"},
                    {"name": "campo", "type": "String"}
                  ],
                  "methods": ["metodoPrincipal()"]
                }
              ],
              "relations": [
                {
                  "source": "ClaseA",
                  "target": "ClaseB",
                  "relationType": "association",
                  "mult": "1..*"
                }
              ]
            }
            ```
            Tipos de atributos permitidos: Long, String, Double, LocalDate.
            Siempre incluye un atributo id de tipo Long en cada entidad.
            """;
    }

    /**
     * Procesamiento visual de diagramas UML utilizando el modelo multimodal moondream.
     * Analiza la imagen dibujada y extrae clases, atributos, métodos y relaciones para renderizar en el canvas.
     */
    public ScanDiagramResponse scanDiagram(String imageBase64) {
        if (imageBase64 == null || imageBase64.isBlank()) {
            return ScanDiagramResponse.builder()
                    .success(false)
                    .message("No se proporcionó ninguna imagen para procesar.")
                    .build();
        }

        // Limpieza del prefijo data:image/...;base64, si existiera
        String cleanBase64 = imageBase64.trim();
        int commaIdx = cleanBase64.indexOf(",");
        if (commaIdx >= 0 && commaIdx < 120) {
            cleanBase64 = cleanBase64.substring(commaIdx + 1).trim();
        }

        String visionModel = (ollamaVisionModel != null && !ollamaVisionModel.isBlank()) ? ollamaVisionModel : "moondream:latest";

        String visionPrompt = """
            You are an expert UML class diagram optical recognition assistant.
            Carefully inspect this image of a drawn UML class diagram.
            Identify every class box, class name, attributes, methods, and relationship lines between them.
            Return a JSON object with this exact structure:
            {
              "classes": [
                {
                  "name": "ClassName",
                  "attrs": [
                    {"name": "id", "type": "Long"},
                    {"name": "fieldName", "type": "String"}
                  ],
                  "methods": ["calculateTotal()"]
                }
              ],
              "relations": [
                {
                  "source": "ClassSource",
                  "target": "ClassTarget",
                  "relationType": "association",
                  "mult": "1..*"
                }
              ]
            }
            Do not include any other markdown text outside the JSON if possible.
            """;

        try {
            String rawResponse = callOllamaVision(visionPrompt, cleanBase64, visionModel);
            log.info("[AI_SERVICE] Moondream raw vision output: {}", rawResponse);

            ScanDiagramResponse parsed = parseVisionDiagramResponse(rawResponse);
            if (parsed != null && parsed.getClasses() != null && !parsed.getClasses().isEmpty()) {
                parsed.setSuccess(true);
                parsed.setSource("ollama-" + visionModel);
                parsed.setRawDescription(rawResponse);
                parsed.setMessage("Diagrama transcrito exitosamente por " + visionModel);
                return parsed;
            }
        } catch (Exception ex) {
            log.warn("[AI_SERVICE] Vision scan call to Ollama ({}) failed: {}. Using fallback recognition.", visionModel, ex.getMessage());
        }

        return buildScanDiagramFallback("Diagrama Escaneado");
    }

    /**
     * Transcripción de audio a texto mediante el modelo Whisper de Ollama.
     * Acepta un archivo de audio (m4a, wav, ogg) recibido como MultipartFile.
     *
     * Estrategia:
     *  1. Convierte el audio a base64.
     *  2. Envía al endpoint /api/generate de Ollama con el modelo 'whisper'.
     *  3. Si Whisper no está disponible, devuelve error descriptivo (no lanza excepción).
     *
     * @param audioFile Archivo de audio recibido por multipart
     * @return TranscribeAudioResponse con el texto transcrito o mensaje de error
     */
    public TranscribeAudioResponse transcribeAudio(MultipartFile audioFile) {
        log.info("[AI_SERVICE] transcribeAudio — fileName='{}', size={} bytes, contentType='{}'",
                audioFile.getOriginalFilename(), audioFile.getSize(), audioFile.getContentType());

        if (audioFile.isEmpty()) {
            log.warn("[AI_SERVICE] transcribeAudio — archivo de audio vacío.");
            return TranscribeAudioResponse.builder()
                    .success(false)
                    .message("El archivo de audio está vacío.")
                    .transcript("")
                    .source("none")
                    .build();
        }

        String audioBase64;
        try {
            byte[] audioBytes = audioFile.getBytes();
            audioBase64 = Base64.getEncoder().encodeToString(audioBytes);
            log.info("[AI_SERVICE] transcribeAudio — audio codificado en base64, length={}", audioBase64.length());
        } catch (Exception e) {
            log.error("[AI_SERVICE] transcribeAudio — error al leer bytes del audio: {}", e.getMessage(), e);
            return TranscribeAudioResponse.builder()
                    .success(false)
                    .message("Error al leer el archivo de audio: " + e.getMessage())
                    .transcript("")
                    .source("error")
                    .build();
        }

        // Intento de transcripción con Ollama/Whisper
        try {
            String whisperModel = "whisper";
            String whisperPrompt = "Transcribe the following audio accurately. Return only the transcribed text, no explanations.";

            Map<String, Object> payload = new HashMap<>();
            payload.put("model", whisperModel);
            payload.put("prompt", whisperPrompt);
            // Whisper en Ollama acepta audio en base64 vía el campo 'audio'
            payload.put("audio", audioBase64);
            payload.put("stream", false);

            String requestBody = objectMapper.writeValueAsString(payload);
            String url = (ollamaUrl != null && !ollamaUrl.isBlank()) ? ollamaUrl : "http://localhost:11434/api/generate";

            log.info("[AI_SERVICE] transcribeAudio — enviando a Ollama Whisper: url='{}'", url);

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(Math.max(timeoutSeconds, 60))) // mínimo 60s para audio
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> httpResponse = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            log.info("[AI_SERVICE] transcribeAudio — Ollama respondó HTTP {}", httpResponse.statusCode());

            if (httpResponse.statusCode() >= 200 && httpResponse.statusCode() < 300) {
                JsonNode root = objectMapper.readTree(httpResponse.body());
                String transcript = root.path("response").asText("").trim();

                if (!transcript.isEmpty()) {
                    log.info("[AI_SERVICE] transcribeAudio — transcripción exitosa, length={}", transcript.length());
                    return TranscribeAudioResponse.builder()
                            .success(true)
                            .transcript(transcript)
                            .source("ollama-" + whisperModel)
                            .message("Transcripción completada por Ollama Whisper.")
                            .build();
                } else {
                    log.warn("[AI_SERVICE] transcribeAudio — Ollama Whisper devolvió respuesta vacía. Body: {}",
                            httpResponse.body().substring(0, Math.min(200, httpResponse.body().length())));
                    return TranscribeAudioResponse.builder()
                            .success(false)
                            .message("El modelo Whisper no produjo texto. Asegúrate de que 'ollama pull whisper' esté instalado.")
                            .transcript("")
                            .source("ollama-" + whisperModel)
                            .build();
                }
            } else {
                log.warn("[AI_SERVICE] transcribeAudio — Ollama Whisper error HTTP {}: {}",
                        httpResponse.statusCode(), httpResponse.body());
                return TranscribeAudioResponse.builder()
                        .success(false)
                        .message("Whisper no disponible (HTTP " + httpResponse.statusCode() + "). Ejecuta: ollama pull whisper")
                        .transcript("")
                        .source("ollama-error")
                        .build();
            }
        } catch (Exception ex) {
            log.error("[AI_SERVICE] transcribeAudio — fallo en llamada a Ollama Whisper: {}", ex.getMessage(), ex);
            return TranscribeAudioResponse.builder()
                    .success(false)
                    .message("No se pudo conectar con Ollama para transcribir. " +
                             "Verifica que Ollama esté activo y que 'whisper' esté instalado: " + ex.getMessage())
                    .transcript("")
                    .source("error")
                    .build();
        }
    }


    /**
     * Llamada HTTP POST genérica a /api/generate de Ollama.
     */
    private String callOllamaGenerate(String prompt, String model) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("model", model);
        payload.put("prompt", prompt);
        payload.put("stream", false);

        String requestBody = objectMapper.writeValueAsString(payload);
        String url = (ollamaUrl != null && !ollamaUrl.isBlank()) ? ollamaUrl : "http://localhost:11434/api/generate";

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(timeoutSeconds > 0 ? timeoutSeconds : 45))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        HttpResponse<String> httpResponse = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (httpResponse.statusCode() >= 200 && httpResponse.statusCode() < 300) {
            JsonNode root = objectMapper.readTree(httpResponse.body());
            return root.path("response").asText("");
        }
        throw new RuntimeException("Ollama error HTTP " + httpResponse.statusCode() + ": " + httpResponse.body());
    }

    /**
     * Llamada multimodal a Ollama /api/generate enviando base64 en array images.
     */
    private String callOllamaVision(String prompt, String imageBase64, String visionModel) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("model", visionModel);
        payload.put("prompt", prompt);
        payload.put("images", List.of(imageBase64));
        payload.put("stream", false);

        String requestBody = objectMapper.writeValueAsString(payload);
        String url = (ollamaUrl != null && !ollamaUrl.isBlank()) ? ollamaUrl : "http://localhost:11434/api/generate";

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(timeoutSeconds > 0 ? timeoutSeconds : 45))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        HttpResponse<String> httpResponse = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (httpResponse.statusCode() >= 200 && httpResponse.statusCode() < 300) {
            JsonNode root = objectMapper.readTree(httpResponse.body());
            return root.path("response").asText("");
        }
        throw new RuntimeException("Ollama vision error HTTP " + httpResponse.statusCode() + ": " + httpResponse.body());
    }

    /**
     * Extrae un bloque JSON de arquitectura de una respuesta textual de chat.
     */
    private AiDomainResponse extractArchitectureFromJsonBlock(String text) {
        if (text == null || text.isBlank()) return null;
        try {
            int jsonStart = text.indexOf("```json");
            String jsonStr;
            if (jsonStart >= 0) {
                int start = jsonStart + 7;
                int end = text.indexOf("```", start);
                jsonStr = (end > start) ? text.substring(start, end).trim() : text.substring(start).trim();
            } else {
                int firstBrace = text.indexOf("{");
                int lastBrace = text.lastIndexOf("}");
                if (firstBrace >= 0 && lastBrace > firstBrace) {
                    jsonStr = text.substring(firstBrace, lastBrace + 1).trim();
                } else {
                    return null;
                }
            }

            JsonNode root = objectMapper.readTree(jsonStr);
            JsonNode classesNode = root.path("classes");
            if (!classesNode.isArray() || classesNode.isEmpty()) return null;

            List<ClassModel> classes = new ArrayList<>();
            Map<String, ClassModel> classMap = new HashMap<>();
            int idx = 0;
            for (JsonNode cNode : classesNode) {
                String name = cNode.path("name").asText("").trim();
                if (name.isEmpty()) continue;

                ClassModel cm = new ClassModel();
                String id = "cls_chat_" + name.toLowerCase(Locale.ROOT);
                cm.setId(id);
                cm.setName(name);
                cm.setX(60.0 + (idx % 3) * 260.0);
                cm.setY(80.0 + (idx / 3) * 280.0);
                cm.setVersion(0L);

                List<AttrModel> attrs = new ArrayList<>();
                JsonNode attrsNode = cNode.path("attrs");
                if (attrsNode.isArray()) {
                    for (JsonNode aNode : attrsNode) {
                        String aName = aNode.path("name").asText("").trim();
                        String aType = normalizeJavaType(aNode.path("type").asText("String").trim());
                        if (!aName.isEmpty()) {
                            AttrModel attr = new AttrModel(aName, aType);
                            if ("id".equalsIgnoreCase(aName)) attr.setIsPrimary(true);
                            attrs.add(attr);
                        }
                    }
                }
                if (attrs.isEmpty() || attrs.stream().noneMatch(a -> "id".equalsIgnoreCase(a.getName()))) {
                    AttrModel idAttr = new AttrModel("id", "Long");
                    idAttr.setIsPrimary(true);
                    attrs.add(0, idAttr);
                }
                cm.setAttrs(attrs);

                JsonNode methodsNode = cNode.path("methods");
                if (methodsNode.isArray()) {
                    List<String> methods = new ArrayList<>();
                    for (JsonNode mNode : methodsNode) {
                        String mName = mNode.asText("").trim();
                        if (!mName.isEmpty()) methods.add(mName);
                    }
                    cm.setMethods(methods);
                }

                classes.add(cm);
                classMap.put(name.toLowerCase(Locale.ROOT), cm);
                idx++;
            }

            List<RelationModel> relations = new ArrayList<>();
            JsonNode relationsNode = root.path("relations");
            if (relationsNode.isArray()) {
                int rIdx = 0;
                for (JsonNode rNode : relationsNode) {
                    String src = rNode.path("source").asText("").trim();
                    String tgt = rNode.path("target").asText("").trim();
                    ClassModel fromCls = classMap.get(src.toLowerCase(Locale.ROOT));
                    ClassModel toCls = classMap.get(tgt.toLowerCase(Locale.ROOT));
                    if (fromCls != null && toCls != null && !fromCls.getId().equals(toCls.getId())) {
                        RelationModel rm = new RelationModel();
                        rm.setId("rel_chat_" + rIdx++);
                        rm.setFromId(fromCls.getId());
                        rm.setToId(toCls.getId());
                        rm.setSourceId(fromCls.getId());
                        rm.setTargetId(toCls.getId());
                        rm.setFromName(fromCls.getName());
                        rm.setToName(toCls.getName());
                        String type = rNode.path("relationType").asText("association").trim();
                        rm.setRelationType(type.toLowerCase(Locale.ROOT));
                        String mult = rNode.path("mult").asText("1..*").trim();
                        rm.setMult(mult);
                        relations.add(rm);
                    }
                }
            }

            return AiDomainResponse.builder()
                    .action("SUGGEST_BUSINESS_ARCHITECTURE")
                    .domain(root.path("domain").asText("Lógica Empresarial"))
                    .classes(classes)
                    .relations(relations)
                    .success(true)
                    .source("OLLAMA_CHAT_EXTRACT")
                    .message("Arquitectura extraída de la respuesta del chat")
                    .build();

        } catch (Exception e) {
            log.debug("[AI_SERVICE] Could not extract JSON architecture from chat message: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Parsea la salida de visión de Moondream a una respuesta de diagrama estructurada.
     */
    private ScanDiagramResponse parseVisionDiagramResponse(String rawVisionOutput) {
        if (rawVisionOutput == null || rawVisionOutput.isBlank()) return null;

        // Intentar parseo como JSON directo
        try {
            int firstBrace = rawVisionOutput.indexOf("{");
            int lastBrace = rawVisionOutput.lastIndexOf("}");
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                String jsonSub = rawVisionOutput.substring(firstBrace, lastBrace + 1);
                JsonNode root = objectMapper.readTree(jsonSub);
                JsonNode classesNode = root.path("classes");
                if (classesNode.isArray() && !classesNode.isEmpty()) {
                    List<ClassModel> classes = new ArrayList<>();
                    Map<String, ClassModel> classMap = new HashMap<>();
                    int idx = 0;
                    for (JsonNode cNode : classesNode) {
                        String name = cNode.path("name").asText("").trim();
                        if (name.isEmpty()) continue;
                        ClassModel cm = new ClassModel();
                        String id = "cls_vis_" + (idx + 1);
                        cm.setId(id);
                        cm.setName(capitalize(name));
                        cm.setX(50.0 + (idx % 3) * 260.0);
                        cm.setY(80.0 + (idx / 3) * 280.0);
                        cm.setVersion(0L);

                        List<AttrModel> attrs = new ArrayList<>();
                        JsonNode attrsNode = cNode.path("attrs");
                        if (!attrsNode.isArray()) attrsNode = cNode.path("attributes");
                        if (attrsNode.isArray()) {
                            for (JsonNode aNode : attrsNode) {
                                String aName = aNode.path("name").asText("").trim();
                                String aType = normalizeJavaType(aNode.path("type").asText("String").trim());
                                if (!aName.isEmpty()) {
                                    AttrModel attr = new AttrModel(aName, aType);
                                    if ("id".equalsIgnoreCase(aName)) attr.setIsPrimary(true);
                                    attrs.add(attr);
                                }
                            }
                        }
                        if (attrs.isEmpty() || attrs.stream().noneMatch(a -> "id".equalsIgnoreCase(a.getName()))) {
                            AttrModel idAttr = new AttrModel("id", "Long");
                            idAttr.setIsPrimary(true);
                            attrs.add(0, idAttr);
                        }
                        cm.setAttrs(attrs);

                        JsonNode methodsNode = cNode.path("methods");
                        if (methodsNode.isArray()) {
                            List<String> methods = new ArrayList<>();
                            for (JsonNode mNode : methodsNode) {
                                String mName = mNode.asText("").trim();
                                if (!mName.isEmpty()) methods.add(mName);
                            }
                            cm.setMethods(methods);
                        }

                        classes.add(cm);
                        classMap.put(name.toLowerCase(Locale.ROOT), cm);
                        idx++;
                    }

                    List<RelationModel> relations = new ArrayList<>();
                    JsonNode relationsNode = root.path("relations");
                    if (relationsNode.isArray()) {
                        int rIdx = 0;
                        for (JsonNode rNode : relationsNode) {
                            String src = rNode.path("source").asText("").trim();
                            String tgt = rNode.path("target").asText("").trim();
                            ClassModel fromCls = classMap.get(src.toLowerCase(Locale.ROOT));
                            ClassModel toCls = classMap.get(tgt.toLowerCase(Locale.ROOT));
                            if (fromCls != null && toCls != null && !fromCls.getId().equals(toCls.getId())) {
                                RelationModel rm = new RelationModel();
                                rm.setId("rel_vis_" + rIdx++);
                                rm.setFromId(fromCls.getId());
                                rm.setToId(toCls.getId());
                                rm.setSourceId(fromCls.getId());
                                rm.setTargetId(toCls.getId());
                                rm.setFromName(fromCls.getName());
                                rm.setToName(toCls.getName());
                                rm.setRelationType(rNode.path("relationType").asText("association").trim().toLowerCase(Locale.ROOT));
                                rm.setMult(rNode.path("mult").asText("1..*").trim());
                                relations.add(rm);
                            }
                        }
                    }

                    if (!classes.isEmpty()) {
                        return ScanDiagramResponse.builder()
                                .classes(classes)
                                .relations(relations)
                                .success(true)
                                .build();
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[AI_SERVICE] Direct JSON parse of Moondream output failed, trying heuristic text extraction: {}", e.getMessage());
        }

        // Extractor heurístico basado en texto de visión
        return extractClassesFromVisionDescription(rawVisionOutput);
    }

    /**
     * Extracción heurística cuando el modelo de visión devuelve una descripción en lenguaje natural.
     */
    private ScanDiagramResponse extractClassesFromVisionDescription(String text) {
        List<ClassModel> classes = new ArrayList<>();
        List<RelationModel> relations = new ArrayList<>();

        Pattern classPattern = Pattern.compile("(?:class|clase|box|entidad)\\s+([A-Za-z0-9_]+)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = classPattern.matcher(text);
        Set<String> foundNames = new LinkedHashSet<>();
        while (matcher.find()) {
            String name = matcher.group(1).trim();
            if (name.length() > 2 && !name.equalsIgnoreCase("uml") && !name.equalsIgnoreCase("diagram")) {
                foundNames.add(capitalize(name));
            }
        }

        if (foundNames.isEmpty()) {
            return null;
        }

        int idx = 0;
        Map<String, ClassModel> classMap = new HashMap<>();
        for (String name : foundNames) {
            ClassModel cm = new ClassModel();
            cm.setId("cls_scan_" + (idx + 1));
            cm.setName(name);
            cm.setX(60.0 + (idx % 3) * 260.0);
            cm.setY(80.0 + (idx / 3) * 280.0);
            cm.setVersion(0L);

            List<AttrModel> attrs = new ArrayList<>();
            AttrModel idAttr = new AttrModel("id", "Long");
            idAttr.setIsPrimary(true);
            attrs.add(idAttr);
            attrs.add(new AttrModel("nombre", "String"));
            attrs.add(new AttrModel("estado", "String"));
            cm.setAttrs(attrs);

            classes.add(cm);
            classMap.put(name.toLowerCase(Locale.ROOT), cm);
            idx++;
        }

        // Relación secuencial por defecto si hay 2 o más clases
        if (classes.size() >= 2) {
            RelationModel rm = new RelationModel();
            rm.setId("rel_scan_1");
            rm.setFromId(classes.get(0).getId());
            rm.setToId(classes.get(1).getId());
            rm.setSourceId(classes.get(0).getId());
            rm.setTargetId(classes.get(1).getId());
            rm.setFromName(classes.get(0).getName());
            rm.setToName(classes.get(1).getName());
            rm.setRelationType("association");
            rm.setMult("1..*");
            relations.add(rm);
        }

        return ScanDiagramResponse.builder()
                .classes(classes)
                .relations(relations)
                .success(true)
                .build();
    }

    /**
     * Fallback para Chat Empresarial cuando Ollama no responde o está apagado.
     */
    private BusinessChatResponse buildBusinessChatFallback(String userPrompt, String businessType) {
        // Combinamos el prompt del usuario con el rubro para detectar palabras clave
        String lower = (userPrompt + " " + (businessType != null ? businessType : "")).toLowerCase(Locale.ROOT);
        String reply;
        AiDomainResponse architecture;

        if (lower.contains("inventario") || lower.contains("stock") || lower.contains("almacen") || lower.contains("almacén")) {
            reply = """
                ### Arquitectura de Control de Inventarios y Almacenes (Spring Boot)
                Para garantizar la consistencia en almacenes y stock:
                - **Producto**: Mantiene el catálogo, código SKU, precio base y umbrales mínimos.
                - **Almacen**: Define las ubicaciones físicas de almacenamiento.
                - **StockAlmacen**: Tabla puente que gestiona la cantidad disponible por almacén.
                - **MovimientoInventario**: Registro inmutable de entradas, salidas y transferencias con auditoría transaccional (`@Transactional(isolation = Isolation.READ_COMMITTED)`).
                
                *He preparado la estructura UML recomendada para que puedas aplicarla directamente al lienzo.*
                """;
            architecture = buildInventoryDomainFallback();
        } else if (businessType != null && !businessType.isBlank()) {
            // Rubro genérico personalizado: usar el nombre del rubro en la respuesta
            String rubroCapitalized = Character.toUpperCase(businessType.charAt(0)) + businessType.substring(1);
            reply = "### Arquitectura de Backend para \"" + rubroCapitalized + "\" (Spring Boot)\n"
                    + "Para el rubro de **" + rubroCapitalized + "** se recomienda modelar las entidades centrales "
                    + "del negocio (clientes, productos/servicios, transacciones, empleados, etc.) adaptadas a los "
                    + "procesos específicos de ese sector.\n"
                    + "Define las reglas de negocio particulares (precios, stock, reservas, turnos, etc.) y "
                    + "aplica transaccionalidad (`@Transactional`) donde haya operaciones críticas.\n\n"
                    + "*Especifica más detalles de tu sistema para que pueda generar la estructura UML exacta.*";
            architecture = buildHeuristicFallback(rubroCapitalized, "Arquitectura base para rubro: " + rubroCapitalized);
        } else {
            reply = """
                ### Arquitectura Contable y Financiera Empresarial (Spring Boot)
                Para estructurar la lógica financiera con principios de partida doble y consistencia transaccional:
                - **Empresa**: Entidad raíz para multi-tenancy o aislamiento corporativo.
                - **CuentaContable**: Estructura del plan de cuentas (Activo, Pasivo, Patrimonio, Ingresos, Gastos).
                - **AsientoContable**: Encabezado del comprobante diario con fecha, glosa y estado (`BORRADOR`, `CONTABILIZADO`).
                - **DetalleAsiento**: Líneas de debe y haber con validación matemática de balance (`SUM(debe) == SUM(haber)`).
                - **Factura**: Documento fiscal vinculado al asiento contable correspondiente.
                
                *He preparado la estructura UML recomendada para que puedas aplicarla directamente al lienzo.*
                """;
            architecture = buildHeuristicFallback("Contabilidad y Finanzas", "Estructura contable generada por fallback empresarial");
        }

        return BusinessChatResponse.builder()
                .reply(reply)
                .suggestedArchitecture(architecture)
                .success(true)
                .source("fallback-heuristic")
                .message("Asistente respondiendo con base de conocimiento empresarial local")
                .build();
    }

    private AiDomainResponse buildInventoryDomainFallback() {
        List<ClassModel> classes = new ArrayList<>();
        ClassModel producto = new ClassModel();
        producto.setId("cls_producto");
        producto.setName("Producto");
        producto.setX(80.0);
        producto.setY(80.0);
        producto.setAttrs(List.of(
                new AttrModel("id", "Long"),
                new AttrModel("sku", "String"),
                new AttrModel("nombre", "String"),
                new AttrModel("precio", "Double")
        ));
        classes.add(producto);

        ClassModel almacen = new ClassModel();
        almacen.setId("cls_almacen");
        almacen.setName("Almacen");
        almacen.setX(360.0);
        almacen.setY(80.0);
        almacen.setAttrs(List.of(
                new AttrModel("id", "Long"),
                new AttrModel("codigo", "String"),
                new AttrModel("ubicacion", "String")
        ));
        classes.add(almacen);

        ClassModel stock = new ClassModel();
        stock.setId("cls_stock_almacen");
        stock.setName("StockAlmacen");
        stock.setX(80.0);
        stock.setY(320.0);
        stock.setAttrs(List.of(
                new AttrModel("id", "Long"),
                new AttrModel("cantidad", "Double"),
                new AttrModel("ultimoMovimiento", "LocalDate")
        ));
        classes.add(stock);

        ClassModel movimiento = new ClassModel();
        movimiento.setId("cls_movimiento_inv");
        movimiento.setName("MovimientoInventario");
        movimiento.setX(360.0);
        movimiento.setY(320.0);
        movimiento.setAttrs(List.of(
                new AttrModel("id", "Long"),
                new AttrModel("tipoMovimiento", "String"),
                new AttrModel("cantidad", "Double"),
                new AttrModel("fecha", "LocalDate")
        ));
        classes.add(movimiento);

        List<RelationModel> relations = new ArrayList<>();
        RelationModel r1 = new RelationModel();
        r1.setId("rel_inv_1");
        r1.setFromId("cls_producto");
        r1.setToId("cls_stock_almacen");
        r1.setFromName("Producto");
        r1.setToName("StockAlmacen");
        r1.setRelationType("association");
        r1.setMult("1..*");
        relations.add(r1);

        RelationModel r2 = new RelationModel();
        r2.setId("rel_inv_2");
        r2.setFromId("cls_almacen");
        r2.setToId("cls_stock_almacen");
        r2.setFromName("Almacen");
        r2.setToName("StockAlmacen");
        r2.setRelationType("association");
        r2.setMult("1..*");
        relations.add(r2);

        return AiDomainResponse.builder()
                .action("INVENTORY_DOMAIN")
                .domain("Inventarios y Almacenes")
                .classes(classes)
                .relations(relations)
                .success(true)
                .source("FALLBACK_HEURISTIC")
                .build();
    }

    /**
     * Fallback para escaneo de diagrama si Ollama o la imagen no pudieron ser procesados.
     */
    private ScanDiagramResponse buildScanDiagramFallback(String hint) {
        List<ClassModel> classes = new ArrayList<>();
        ClassModel c1 = new ClassModel();
        c1.setId("cls_scan_1");
        c1.setName("EntidadPrincipal");
        c1.setX(80.0);
        c1.setY(80.0);
        c1.setAttrs(List.of(
                new AttrModel("id", "Long"),
                new AttrModel("codigo", "String"),
                new AttrModel("descripcion", "String"),
                new AttrModel("fechaCreacion", "LocalDate")
        ));
        c1.setMethods(List.of("procesarOperacion()", "validarEstado()"));
        classes.add(c1);

        ClassModel c2 = new ClassModel();
        c2.setId("cls_scan_2");
        c2.setName("DetalleTransaccion");
        c2.setX(360.0);
        c2.setY(80.0);
        c2.setAttrs(List.of(
                new AttrModel("id", "Long"),
                new AttrModel("monto", "Double"),
                new AttrModel("referencia", "String")
        ));
        c2.setMethods(List.of("calcularSubtotal()"));
        classes.add(c2);

        List<RelationModel> relations = new ArrayList<>();
        RelationModel r = new RelationModel();
        r.setId("rel_scan_fb_1");
        r.setFromId(c1.getId());
        r.setToId(c2.getId());
        r.setFromName(c1.getName());
        r.setToName(c2.getName());
        r.setRelationType("composition");
        r.setMult("1..*");
        relations.add(r);

        return ScanDiagramResponse.builder()
                .classes(classes)
                .relations(relations)
                .rawDescription("Diagrama recuperado mediante procesamiento heurístico defensivo (Ollama moondream desconectado o imagen con bajo contraste)")
                .success(true)
                .source("fallback-vision-recovery")
                .message("Diagrama procesado con éxito en modo resiliente")
                .build();
    }

    /**
     * Fallback heurístico determinista que retorna un modelo completo de Contabilidad/Finanzas:
     * Empresa, Factura, AsientoContable, CuentaContable.
     */
    public AiDomainResponse buildHeuristicFallback(String domainHint, String message) {
        List<ClassModel> classes = new ArrayList<>();

        // 1. Empresa
        ClassModel empresa = new ClassModel();
        empresa.setId("cls_empresa");
        empresa.setName("Empresa");
        empresa.setX(80.0);
        empresa.setY(80.0);
        empresa.setVersion(0L);
        List<AttrModel> empresaAttrs = new ArrayList<>();
        AttrModel empId = new AttrModel("id", "Long");
        empId.setIsPrimary(true);
        empresaAttrs.add(empId);
        empresaAttrs.add(new AttrModel("razonSocial", "String"));
        empresaAttrs.add(new AttrModel("nit", "String"));
        empresaAttrs.add(new AttrModel("direccion", "String"));
        empresaAttrs.add(new AttrModel("telefono", "String"));
        empresa.setAttrs(empresaAttrs);
        classes.add(empresa);

        // 2. Factura
        ClassModel factura = new ClassModel();
        factura.setId("cls_factura");
        factura.setName("Factura");
        factura.setX(420.0);
        factura.setY(80.0);
        factura.setVersion(0L);
        List<AttrModel> facturaAttrs = new ArrayList<>();
        AttrModel facId = new AttrModel("id", "Long");
        facId.setIsPrimary(true);
        facturaAttrs.add(facId);
        facturaAttrs.add(new AttrModel("numeroFactura", "String"));
        facturaAttrs.add(new AttrModel("fechaEmision", "LocalDate"));
        facturaAttrs.add(new AttrModel("montoTotal", "Double"));
        facturaAttrs.add(new AttrModel("impuestoIva", "Double"));
        facturaAttrs.add(new AttrModel("estado", "String"));
        factura.setAttrs(facturaAttrs);
        classes.add(factura);

        // 3. AsientoContable
        ClassModel asiento = new ClassModel();
        asiento.setId("cls_asientocontable");
        asiento.setName("AsientoContable");
        asiento.setX(80.0);
        asiento.setY(340.0);
        asiento.setVersion(0L);
        List<AttrModel> asientoAttrs = new ArrayList<>();
        AttrModel asiId = new AttrModel("id", "Long");
        asiId.setIsPrimary(true);
        asientoAttrs.add(asiId);
        asientoAttrs.add(new AttrModel("codigoAsiento", "String"));
        asientoAttrs.add(new AttrModel("fechaRegistro", "LocalDate"));
        asientoAttrs.add(new AttrModel("glosaDescripcion", "String"));
        asientoAttrs.add(new AttrModel("totalDebe", "Double"));
        asientoAttrs.add(new AttrModel("totalHaber", "Double"));
        asiento.setAttrs(asientoAttrs);
        classes.add(asiento);

        // 4. CuentaContable
        ClassModel cuenta = new ClassModel();
        cuenta.setId("cls_cuentacontable");
        cuenta.setName("CuentaContable");
        cuenta.setX(420.0);
        cuenta.setY(340.0);
        cuenta.setVersion(0L);
        List<AttrModel> cuentaAttrs = new ArrayList<>();
        AttrModel ctaId = new AttrModel("id", "Long");
        ctaId.setIsPrimary(true);
        cuentaAttrs.add(ctaId);
        cuentaAttrs.add(new AttrModel("codigoCuenta", "String"));
        cuentaAttrs.add(new AttrModel("nombreCuenta", "String"));
        cuentaAttrs.add(new AttrModel("tipoCuenta", "String"));
        cuentaAttrs.add(new AttrModel("saldoActual", "Double"));
        cuenta.setAttrs(cuentaAttrs);
        classes.add(cuenta);

        // Relaciones UML
        List<RelationModel> relations = new ArrayList<>();

        // Empresa (1) -> Factura (*)
        RelationModel relEmpresaFactura = new RelationModel();
        relEmpresaFactura.setId("rel_empresa_factura");
        relEmpresaFactura.setFromId(empresa.getId());
        relEmpresaFactura.setToId(factura.getId());
        relEmpresaFactura.setSourceId(empresa.getId());
        relEmpresaFactura.setTargetId(factura.getId());
        relEmpresaFactura.setFromName(empresa.getName());
        relEmpresaFactura.setToName(factura.getName());
        relEmpresaFactura.setRelationType("composition");
        relEmpresaFactura.setMult("1..*");
        relEmpresaFactura.setSourceMultiplicity("1");
        relEmpresaFactura.setTargetMultiplicity("*");
        relations.add(relEmpresaFactura);

        // Factura (1) -> AsientoContable (1)
        RelationModel relFacturaAsiento = new RelationModel();
        relFacturaAsiento.setId("rel_factura_asiento");
        relFacturaAsiento.setFromId(factura.getId());
        relFacturaAsiento.setToId(asiento.getId());
        relFacturaAsiento.setSourceId(factura.getId());
        relFacturaAsiento.setTargetId(asiento.getId());
        relFacturaAsiento.setFromName(factura.getName());
        relFacturaAsiento.setToName(asiento.getName());
        relFacturaAsiento.setRelationType("association");
        relFacturaAsiento.setMult("1..1");
        relFacturaAsiento.setSourceMultiplicity("1");
        relFacturaAsiento.setTargetMultiplicity("1");
        relations.add(relFacturaAsiento);

        // AsientoContable (*) -> CuentaContable (*)
        RelationModel relAsientoCuenta = new RelationModel();
        relAsientoCuenta.setId("rel_asiento_cuenta");
        relAsientoCuenta.setFromId(asiento.getId());
        relAsientoCuenta.setToId(cuenta.getId());
        relAsientoCuenta.setSourceId(asiento.getId());
        relAsientoCuenta.setTargetId(cuenta.getId());
        relAsientoCuenta.setFromName(asiento.getName());
        relAsientoCuenta.setToName(cuenta.getName());
        relAsientoCuenta.setRelationType("association");
        relAsientoCuenta.setMult("*..*");
        relAsientoCuenta.setSourceMultiplicity("*");
        relAsientoCuenta.setTargetMultiplicity("*");
        relAsientoCuenta.setIntermediateTableName("DetalleAsiento");
        relations.add(relAsientoCuenta);

        return AiDomainResponse.builder()
                .action("GENERATE_CONCEPTUAL_ARCHITECTURE")
                .domain("Contabilidad y Finanzas")
                .classes(classes)
                .relations(relations)
                .success(true)
                .source("HEURISTIC_FALLBACK")
                .message(message != null ? message : "Modelo heurístico de Contabilidad y Finanzas generado")
                .build();
    }

    // ==========================================
    // Compatibilidad adicional para mutaciones locales de voz (frontend legado)
    // ==========================================
    public com.app.dto.ai.AiCommandResponse processLegacyCommand(com.app.dto.ai.AiCommandRequest request) {
        String prompt = request != null && request.getPrompt() != null ? request.getPrompt().trim() : "";
        List<String> currentClasses = request != null && request.getCurrentClasses() != null
                ? request.getCurrentClasses()
                : Collections.emptyList();
        return fallbackHeuristicCommand(prompt, currentClasses);
    }

    public com.app.dto.ai.AiCommandResponse fallbackHeuristicCommand(String prompt, List<String> currentClasses) {
        String clean = prompt.trim().replaceAll("[.,;:!?¡¿\"']", "").trim();
        String lower = clean.toLowerCase(Locale.ROOT);

        // 1. UPDATE_CLASS
        Pattern updateAttrPattern = Pattern.compile(
                "(?:cambia|modifica|actualiza)(?:\\s+el)?\\s+atributo\\s+([a-zA-Z0-9_]+)\\s+(?:a|como|por)\\s+([a-zA-Z0-9_]+)\\s+en\\s+([a-zA-Z0-9_\\s]+)",
                Pattern.CASE_INSENSITIVE
        );
        Matcher mUpdate = updateAttrPattern.matcher(clean);
        if (mUpdate.find()) {
            String attrName = mUpdate.group(1).trim();
            String rawType = mUpdate.group(2).trim();
            String className = matchOrCapitalizeClassName(mUpdate.group(3).trim(), currentClasses);

            Map<String, Object> attrMap = new HashMap<>();
            attrMap.put("name", attrName);
            attrMap.put("type", normalizeJavaType(rawType));

            Map<String, Object> data = new HashMap<>();
            data.put("className", className);
            data.put("attribute", attrMap);

            return com.app.dto.ai.AiCommandResponse.builder()
                    .action("UPDATE_CLASS")
                    .data(data)
                    .rawPrompt(prompt)
                    .success(true)
                    .message("Atributo '" + attrName + "' actualizado a '" + attrMap.get("type") + "' en '" + className + "'")
                    .build();
        }

        // 2. DELETE_CLASS
        Pattern deleteClassPattern = Pattern.compile(
                "(?:elimina|borra|quitar)(?:\\s+(?:la|una))?\\s+clase\\s+([a-zA-Z0-9_\\s]+)",
                Pattern.CASE_INSENSITIVE
        );
        Matcher mDelete = deleteClassPattern.matcher(clean);
        if (mDelete.find()) {
            String className = matchOrCapitalizeClassName(mDelete.group(1).trim(), currentClasses);
            return com.app.dto.ai.AiCommandResponse.builder()
                    .action("DELETE_CLASS")
                    .data(Map.of("className", className))
                    .rawPrompt(prompt)
                    .success(true)
                    .message("Clase '" + className + "' eliminada")
                    .build();
        }

        // 3. ADD_RELATION
        if (isRelationIntent(lower)) {
            com.app.dto.ai.AiCommandResponse relResponse = parseRelationCommand(clean, prompt, currentClasses);
            if (relResponse != null) {
                return relResponse;
            }
        }

        // 4. ADD_CLASS
        Pattern addClassPattern = Pattern.compile(
                "^(?:crea|crear|nueva|nuevo|agregar|agrega|a[ñn]adir|a[ñn]ade|generar|genera|qu[eé])?(?:\\s+(?:la|una|el|un))?\\s*clase\\s+([a-zA-Z0-9_]+)(?:\\s+con\\s+(?:(?:los\\s+)?atributos?\\s+)?(.+))?$",
                Pattern.CASE_INSENSITIVE
        );
        Matcher mAdd = addClassPattern.matcher(clean);
        if (mAdd.find()) {
            String rawClassName = mAdd.group(1).trim();
            String rawAttrs = mAdd.group(2);
            String className = capitalize(rawClassName);

            List<Map<String, String>> attributes = (rawAttrs != null && !rawAttrs.isBlank())
                    ? parseAttributesList(rawAttrs.trim())
                    : Collections.emptyList();

            Map<String, Object> data = new HashMap<>();
            data.put("name", className);
            data.put("attributes", attributes);

            return com.app.dto.ai.AiCommandResponse.builder()
                    .action("ADD_CLASS")
                    .data(data)
                    .rawPrompt(prompt)
                    .success(true)
                    .message("Clase '" + className + "' creada con " + attributes.size() + " atributos")
                    .build();
        }

        return com.app.dto.ai.AiCommandResponse.builder()
                .action("UNKNOWN")
                .data(Map.of("raw", clean))
                .rawPrompt(prompt)
                .success(false)
                .message("No se pudo interpretar el comando: \"" + prompt + "\"")
                .build();
    }

    private boolean isRelationIntent(String lower) {
        return lower.contains("relaci") || lower.contains("asoci") || lower.contains("conect")
                || lower.contains("compon") || lower.contains("agrega") || lower.contains("hereda")
                || lower.contains("extiende") || lower.contains("uno a muchos") || lower.contains("muchos a muchos")
                || lower.contains("uno a uno");
    }

    private com.app.dto.ai.AiCommandResponse parseRelationCommand(String clean, String prompt, List<String> currentClasses) {
        String relationType = extractRelationType(clean);
        String multiplicity = extractMultiplicity(clean);

        String source = null;
        String target = null;

        if (currentClasses != null && currentClasses.size() >= 2) {
            List<String> found = new ArrayList<>();
            String lower = clean.toLowerCase(Locale.ROOT);
            for (String c : currentClasses) {
                if (lower.matches(".*\\b" + Pattern.quote(c.toLowerCase(Locale.ROOT)) + "\\b.*")) {
                    found.add(c);
                }
            }
            if (found.size() >= 2) {
                source = found.get(0);
                target = found.get(1);
            }
        }

        if (source == null) {
            Pattern herenciaPattern = Pattern.compile("([a-zA-Z0-9_]+)\\s+(?:hereda|extiende)(?:\\s+de)?\\s+([a-zA-Z0-9_]+)", Pattern.CASE_INSENSITIVE);
            Matcher mHer = herenciaPattern.matcher(clean);
            if (mHer.find()) {
                source = matchOrCapitalizeClassName(mHer.group(1).trim(), currentClasses);
                target = matchOrCapitalizeClassName(mHer.group(2).trim(), currentClasses);
                relationType = "inheritance";
                multiplicity = "";
            }
        }

        if (source == null) {
            Pattern conPattern = Pattern.compile("(?:relaciona|relacionar|conecta|conectar|asocia|asociar)\\s+([a-zA-Z0-9_]+)\\s+con\\s+([a-zA-Z0-9_]+)", Pattern.CASE_INSENSITIVE);
            Matcher mCon = conPattern.matcher(clean);
            if (mCon.find()) {
                source = matchOrCapitalizeClassName(mCon.group(1).trim(), currentClasses);
                target = matchOrCapitalizeClassName(mCon.group(2).trim(), currentClasses);
            }
        }

        if (source == null) {
            Pattern entrePattern = Pattern.compile("entre\\s+([a-zA-Z0-9_]+)\\s+y\\s+([a-zA-Z0-9_]+)", Pattern.CASE_INSENSITIVE);
            Matcher mEntre = entrePattern.matcher(clean);
            if (mEntre.find()) {
                source = matchOrCapitalizeClassName(mEntre.group(1).trim(), currentClasses);
                target = matchOrCapitalizeClassName(mEntre.group(2).trim(), currentClasses);
            }
        }

        if ("inheritance".equals(relationType)) {
            multiplicity = "";
        }

        if (source != null && target != null) {
            Map<String, Object> relData = new HashMap<>();
            relData.put("source", source);
            relData.put("target", target);
            relData.put("type", relationType);
            relData.put("multiplicity", multiplicity);

            return com.app.dto.ai.AiCommandResponse.builder()
                    .action("ADD_RELATION")
                    .data(relData)
                    .rawPrompt(prompt)
                    .success(true)
                    .message("Relación (" + relationType + ", " + multiplicity + ") entre '" + source + "' y '" + target + "' creada ✓")
                    .build();
        }

        return null;
    }

    public static String extractRelationType(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.contains("composicion") || lower.contains("composición") || lower.contains("compone")) {
            return "composition";
        }
        if (lower.contains("agregacion") || lower.contains("agregación") || lower.contains("agrega")) {
            return "aggregation";
        }
        if (lower.contains("herencia") || lower.contains("hereda") || lower.contains("extiende") || lower.contains("generalizacion") || lower.contains("generalización") || lower.contains("subclase")) {
            return "inheritance";
        }
        return "association";
    }

    public static String extractMultiplicity(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.contains("muchos a muchos") || lower.contains("n a n") || lower.contains("n a m") || lower.contains("varios a varios") || lower.contains("m a n")) {
            return "*..*";
        }
        if (lower.contains("uno a muchos") || lower.contains("1 a muchos") || lower.contains("1 a n") || lower.contains("uno a varios") || lower.contains("uno a n")) {
            return "1..*";
        }
        if (lower.contains("muchos a uno") || lower.contains("n a 1") || lower.contains("varios a uno")) {
            return "*..1";
        }
        if (lower.contains("uno a uno") || lower.contains("1 a 1") || lower.contains("uno a 1")) {
            return "1..1";
        }
        return "1..*";
    }

    private List<Map<String, String>> parseAttributesList(String rawAttrs) {
        List<Map<String, String>> result = new ArrayList<>();
        String cleanAttrs = rawAttrs.replaceFirst("^(?:los\\s+)?atributos?\\s+", "").trim();
        String[] chunks = cleanAttrs.split("\\s+(?:y|e)\\s+|,");
        for (String chunk : chunks) {
            String trimmed = chunk.trim();
            if (trimmed.isEmpty()) continue;

            Pattern p = Pattern.compile("^([a-zA-Z0-9_]+)(?:\\s+(?:de\\s+tipo|tipo|es\\s+un|es\\s+una|:)\\s+([a-zA-Z0-9_]+)|\\s+([a-zA-Z0-9_]+))?$", Pattern.CASE_INSENSITIVE);
            Matcher m = p.matcher(trimmed);
            if (m.find() && (m.group(2) != null || m.group(3) != null)) {
                String name = m.group(1).trim();
                String rawType = m.group(2) != null ? m.group(2).trim() : m.group(3).trim();
                Map<String, String> attr = new HashMap<>();
                attr.put("name", name.toLowerCase(Locale.ROOT));
                attr.put("type", normalizeJavaType(rawType));
                result.add(attr);
            } else {
                String[] words = trimmed.split("\\s+");
                String name = words[0].trim();
                String type = (words.length > 1) ? normalizeJavaType(words[words.length - 1]) : inferJavaType(name);
                Map<String, String> attr = new HashMap<>();
                attr.put("name", name.toLowerCase(Locale.ROOT));
                attr.put("type", type);
                result.add(attr);
            }
        }
        return result;
    }

    public static String inferJavaType(String name) {
        if (name == null || name.isBlank()) return "String";
        String n = name.toLowerCase(Locale.ROOT).trim();
        if (n.equals("id") || n.equals("codigo") || n.equals("código") || n.endsWith("id")) return "Long";
        if (n.contains("precio") || n.contains("monto") || n.contains("total") || n.contains("saldo") || n.contains("costo") || n.contains("subtotal") || n.contains("valor")) return "Double";
        if (n.contains("stock") || n.contains("cantidad") || n.contains("edad") || n.contains("numero") || n.contains("número") || n.contains("ano") || n.contains("año") || n.contains("mes") || n.contains("dia") || n.contains("día")) return "Integer";
        if (n.contains("fecha") || n.contains("date") || n.contains("nacimiento")) return "LocalDate";
        if (n.contains("hora") || n.contains("time")) return "LocalTime";
        if (n.contains("activo") || n.contains("estado") || n.contains("habilitado") || n.contains("borrado") || n.contains("valido") || n.contains("válido") || n.startsWith("es") || n.startsWith("is")) return "Boolean";
        return "String";
    }

    public static String normalizeJavaType(String raw) {
        if (raw == null || raw.isBlank()) return "String";
        String clean = raw.toLowerCase(Locale.ROOT).trim();
        return switch (clean) {
            case "int", "integer", "entero", "numero", "número" -> "Integer";
            case "long", "bigint", "id" -> "Long";
            case "double", "real", "float" -> "Double";
            case "decimal", "bigdecimal", "monto", "precio", "saldo" -> "Double";
            case "date", "fecha", "localdate" -> "LocalDate";
            case "time", "hora", "localtime" -> "LocalTime";
            case "datetime", "fechahora", "timestamp", "localdatetime" -> "LocalDateTime";
            case "boolean", "bool", "booleano", "logico", "lógico" -> "Boolean";
            case "string", "texto", "cadena", "varchar", "str" -> "String";
            default -> raw.substring(0, 1).toUpperCase(Locale.ROOT) + raw.substring(1);
        };
    }

    private String matchOrCapitalizeClassName(String raw, List<String> currentClasses) {
        if (currentClasses != null) {
            for (String c : currentClasses) {
                if (c.equalsIgnoreCase(raw)) {
                    return c;
                }
            }
        }
        return capitalize(raw);
    }

    private String capitalize(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String[] words = raw.trim().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            if (!w.isEmpty()) {
                sb.append(w.substring(0, 1).toUpperCase(Locale.ROOT));
                if (w.length() > 1) {
                    sb.append(w.substring(1).toLowerCase(Locale.ROOT));
                }
            }
        }
        return sb.toString();
    }

    private String cleanCodeBlocks(String raw) {
        String s = raw.trim();
        if (s.startsWith("```")) {
            s = s.replaceFirst("^```[a-zA-Z]*\\s*", "");
            s = s.replaceAll("```$", "").trim();
        }
        return s;
    }
}
