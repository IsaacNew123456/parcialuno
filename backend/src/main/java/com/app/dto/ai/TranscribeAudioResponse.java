package com.app.dto.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Respuesta del endpoint POST /api/ai/transcribe-audio.
 * Contiene el texto transcrito del audio recibido y metadatos del proceso.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TranscribeAudioResponse {

    /** Texto transcrito del audio. Vacío si la transcripción falló. */
    private String transcript;

    /** true si la transcripción fue exitosa; false en caso de error. */
    private boolean success;

    /** Mensaje descriptivo del resultado o del error ocurrido. */
    private String message;

    /** Modelo o fuente que realizó la transcripción (p.ej. "ollama-whisper"). */
    private String source;
}
