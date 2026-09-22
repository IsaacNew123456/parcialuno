import { useState, useEffect, useRef, useCallback } from 'react';
import { sendAiCommand } from '../services/api.js';
import useUmlStore from '../store/useUmlStore.js';

/**
 * Normaliza nombres de tipos de datos en español/inglés a tipos Java/JPA estándar.
 */
export function normalizeTypeName(raw) {
  if (!raw) return 'String';
  const clean = raw.toLowerCase().trim();
  if (['string', 'texto', 'cadena', 'varchar', 'str'].includes(clean)) return 'String';
  if (['int', 'integer', 'entero', 'numero', 'número'].includes(clean)) return 'Integer';
  if (['long', 'bigint', 'id'].includes(clean)) return 'Long';
  if (['double', 'float', 'decimal', 'bigdecimal', 'monto', 'precio', 'saldo', 'real'].includes(clean)) return 'BigDecimal';
  if (['date', 'fecha', 'localdate', 'time', 'timestamp'].includes(clean)) return 'LocalDate';
  if (['boolean', 'booleano', 'bool', 'logico', 'lógico'].includes(clean)) return 'Boolean';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Convierte un nombre de clase a PascalCase (ej: "detalle pedido" -> "DetallePedido").
 */
export function capitalizeClassName(raw) {
  if (!raw) return '';
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Infiere el tipo de dato Java cuando el usuario no lo especifica explícitamente en el comando.
 */
export function inferJavaType(name) {
  if (!name) return 'String';
  const n = name.toLowerCase().trim();
  if (n === 'id' || n === 'codigo' || n === 'código' || n.endsWith('id')) return 'Long';
  if (n.includes('precio') || n.includes('monto') || n.includes('total') || n.includes('saldo') || n.includes('costo') || n.includes('subtotal') || n.includes('valor')) return 'Double';
  if (n.includes('stock') || n.includes('cantidad') || n.includes('edad') || n.includes('numero') || n.includes('número') || n.includes('ano') || n.includes('año') || n.includes('mes') || n.includes('dia') || n.includes('día')) return 'Integer';
  if (n.includes('fecha') || n.includes('date') || n.includes('nacimiento')) return 'LocalDate';
  if (n.includes('hora') || n.includes('time')) return 'LocalTime';
  if (n.includes('activo') || n.includes('estado') || n.includes('habilitado') || n.includes('borrado') || n.includes('valido') || n.includes('válido') || n.startsWith('es') || n.startsWith('is')) return 'Boolean';
  return 'String';
}

export function extractRelationType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('composicion') || lower.includes('composición') || lower.includes('compone')) return 'composition';
  if (lower.includes('agregacion') || lower.includes('agregación') || lower.includes('agrega')) return 'aggregation';
  if (lower.includes('herencia') || lower.includes('hereda') || lower.includes('extiende') || lower.includes('generalizacion') || lower.includes('generalización')) return 'inheritance';
  return 'association';
}

export function extractMultiplicity(text) {
  const lower = text.toLowerCase();
  if (lower.includes('muchos a muchos') || lower.includes('n a n') || lower.includes('n a m') || lower.includes('varios a varios') || lower.includes('m a n')) return '*..*';
  if (lower.includes('uno a muchos') || lower.includes('1 a muchos') || lower.includes('1 a n') || lower.includes('uno a varios') || lower.includes('uno a n')) return '1..*';
  if (lower.includes('muchos a uno') || lower.includes('n a 1') || lower.includes('varios a uno')) return '*..1';
  if (lower.includes('uno a uno') || lower.includes('1 a 1') || lower.includes('uno a 1')) return '1..1';
  return '1..*';
}

/**
 * Parsea un texto hablado para identificar comandos de UML.
 * Retorna un objeto con `{ command, params, originalText }` o `null` si no coincide.
 */
export function parseVoiceCommand(transcript, currentClasses = []) {
  if (!transcript || typeof transcript !== 'string') return null;

  // Limpiar puntuación final y espacios
  const clean = transcript
    .trim()
    .replace(/[.,;:!?¡¿"']/g, '')
    .trim();

  const lower = clean.toLowerCase();

  // 1. Relaciones: asociación, agregación, composición, herencia, multiplicidades
  if (lower.includes('relaci') || lower.includes('asoci') || lower.includes('conect') ||
      lower.includes('compon') || lower.includes('agrega') || lower.includes('hereda') ||
      lower.includes('uno a muchos') || lower.includes('muchos a muchos') || lower.includes('uno a uno')) {
    
    let relationType = extractRelationType(lower);
    let multiplicity = extractMultiplicity(lower);
    let source = null;
    let target = null;

    // Buscar si hay clases conocidas mencionadas en el texto
    if (currentClasses && currentClasses.length >= 2) {
      const found = [];
      for (const c of currentClasses) {
        const regex = new RegExp(`\\b${c}\\b`, 'i');
        if (regex.test(clean)) {
          found.push(c);
        }
      }
      if (found.length >= 2) {
        source = found[0];
        target = found[1];
      }
    }

    // Herencia: "[A] hereda de [B]"
    if (!source) {
      const matchHer = clean.match(/([a-záéíóúñ0-9_]+)\s+(?:hereda|extiende)(?:\s+de)?\s+([a-záéíóúñ0-9_]+)/i);
      if (matchHer) {
        source = capitalizeClassName(matchHer[1]);
        target = capitalizeClassName(matchHer[2]);
        relationType = 'inheritance';
        multiplicity = '';
      }
    }

    // "entre [A] y [B]"
    if (!source) {
      const matchEntre = clean.match(/entre\s+([a-záéíóúñ0-9_]+)\s+y\s+([a-záéíóúñ0-9_]+)/i);
      if (matchEntre) {
        source = capitalizeClassName(matchEntre[1]);
        target = capitalizeClassName(matchEntre[2]);
      }
    }

    // "conectar/asociar/relacionar [A] con [B]"
    if (!source) {
      const matchCon = clean.match(/(?:relaciona|relacionar|conecta|conectar|asocia|asociar)\s+([a-záéíóúñ0-9_]+)\s+con\s+([a-záéíóúñ0-9_]+)/i);
      if (matchCon) {
        source = capitalizeClassName(matchCon[1]);
        target = capitalizeClassName(matchCon[2]);
      }
    }

    if (relationType === 'inheritance') {
      multiplicity = '';
    }

    if (source && target) {
      return {
        command: 'ADD_RELATION',
        params: {
          source,
          target,
          type: relationType,
          multiplicity,
        },
        originalText: clean,
      };
    }
  }

  // 2. Crear clase con o sin atributos:
  // Soporta: "crear clase...", "crea la clase...", "qué clase...", "nueva clase...", "clase [Nombre] con atributos..."
  const classWithAttrRegex = /^(?:crear|crea|nueva|nuevo|agregar|agrega|añadir|añade|generar|genera|qué|que)?(?:\s+(?:la|una|el|un))?\s*clase\s+([a-záéíóúñ0-9_]+)(?:\s+con\s+(?:(?:los\s+)?atributos?\s+)?(.+))?$/i;
  const matchWithAttrs = clean.match(classWithAttrRegex);

  if (matchWithAttrs) {
    const rawClassName = matchWithAttrs[1].trim();
    const rawAttrsText = matchWithAttrs[2] ? matchWithAttrs[2].trim() : '';
    const className = capitalizeClassName(rawClassName);

    const attrs = [];

    if (rawAttrsText) {
      const cleanAttrs = rawAttrsText.replace(/^(?:los\s+)?atributos?\s+/i, '').trim();
      const attrChunks = cleanAttrs.split(/\s+(?:y|e)\s+|,/i);
      for (const chunk of attrChunks) {
        const trimmedChunk = chunk.trim();
        if (!trimmedChunk) continue;

        // Patrón tipo explícito "nombre tipo Tipo" o "nombre de tipo Tipo" o "nombre:Tipo"
        const typeMatch = trimmedChunk.match(/^([a-záéíóúñ0-9_]+)(?:\s+(?:de\s+tipo|tipo|es\s+un|es\s+una|:)\s+([a-záéíóúñ0-9_]+))?$/i);
        if (typeMatch && typeMatch[2]) {
          const attrName = typeMatch[1].trim().toLowerCase();
          const rawType = typeMatch[2].trim();
          attrs.push({
            name: attrName,
            type: normalizeTypeName(rawType),
          });
        } else {
          // Si no tiene tipo explícito o tiene dos palabras
          const words = trimmedChunk.split(/\s+/);
          const attrName = words[0].trim().toLowerCase();
          const rawType = words.length > 1 ? normalizeTypeName(words[words.length - 1]) : inferJavaType(attrName);
          attrs.push({
            name: attrName,
            type: rawType,
          });
        }
      }
    }

    return {
      command: attrs.length > 0 ? 'CREATE_CLASS_WITH_ATTRS' : 'CREATE_CLASS',
      params: {
        className,
        attrs,
      },
      originalText: clean,
    };
  }

  // 3. Atajos directos
  if (/^(?:guardar|salvar)(?:\s+(?:el|este|mi))?\s+diagrama/i.test(lower) ||
      /^guardar\s+(?:en\s+bd|en\s+base\s+de\s+datos|cambios)/i.test(lower)) {
    return {
      command: 'SAVE_DIAGRAM',
      params: {},
      originalText: clean,
    };
  }

  if (/^(?:descargar|generar|exportar)(?:\s+(?:el|un))?\s+(?:proyecto|backend|zip|codigo|código)/i.test(lower)) {
    return {
      command: 'DOWNLOAD_PROJECT',
      params: {},
      originalText: clean,
    };
  }

  if (/^(?:exportar|descargar)(?:\s+(?:el|un))?\s+(?:xmi|xml|enterprise\s+architect)/i.test(lower)) {
    return {
      command: 'EXPORT_XMI',
      params: {},
      originalText: clean,
    };
  }

  if (/^(?:nuevo|limpiar|reiniciar)(?:\s+(?:el|un))?\s+(?:diagrama|lienzo|canvas)/i.test(lower)) {
    return {
      command: 'RESET_CANVAS',
      params: {},
      originalText: clean,
    };
  }

  return {
    command: 'UNKNOWN',
    params: { text: clean },
    originalText: clean,
  };
}


/**
 * Hook `useSpeechRecognition` para controlar el micrófono y procesar comandos de voz.
 * Soporta 3 estados visuales: 'idle', 'listening', 'processing'.
 */
export function useSpeechRecognition({
  currentClasses = [],
  onApplyMutation,
  onAddClass,
  onSaveDiagram,
  onDownloadProject,
  onExportXmi,
  onResetCanvas,
  onToast,
} = {}) {
  const [voiceState, setVoiceState] = useState('idle'); // 'idle' | 'listening' | 'processing'
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef(null);
  const handlersRef = useRef({});

  // Mantener actualizadas las referencias sin reconstruir el reconocimiento de voz
  useEffect(() => {
    handlersRef.current = {
      currentClasses,
      onApplyMutation,
      onAddClass,
      onSaveDiagram,
      onDownloadProject,
      onExportXmi,
      onResetCanvas,
      onToast,
    };
  });

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      console.warn('Web Speech API no disponible en este navegador');
      return;
    }

    setIsSupported(true);
    const rec = new SpeechRecognition();
    rec.lang = 'es-ES';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.log('[SpeechRecognition] Micrófono activo y escuchando...');
      setVoiceState('listening');
    };

    rec.onspeechstart = () => {
      console.log('[SpeechRecognition] Voz detectada');
    };

    rec.onspeechend = () => {
      console.log('[SpeechRecognition] Fin de captura de voz');
    };

    rec.onresult = async (event) => {
      const transcriptText = event.results?.[0]?.[0]?.transcript || '';
      console.log("Comando recibido en hook:", transcriptText);
      setTranscript(transcriptText);
      setVoiceState('processing');

      const { onToast, onSaveDiagram, onDownloadProject, onExportXmi, onResetCanvas, onApplyMutation, onAddClass } = handlersRef.current;

      if (onToast) {
        onToast(`Voz: "${transcriptText}"`, 'info', 2500);
      }

      // 1. Atajos rápidos de la aplicación
      const lower = transcriptText.toLowerCase().trim();
      if (/^(?:guardar|salvar)(?:\s+(?:el|este|mi))?\s+diagrama/i.test(lower) ||
          /^guardar\s+(?:en\s+bd|en\s+base\s+de\s+datos|cambios)/i.test(lower)) {
        if (onSaveDiagram) onSaveDiagram();
        setVoiceState('idle');
        return;
      }
      if (/^(?:descargar|generar|exportar)(?:\s+(?:el|un))?\s+(?:proyecto|backend|zip|codigo|código)/i.test(lower)) {
        if (onDownloadProject) onDownloadProject();
        setVoiceState('idle');
        return;
      }
      if (/^(?:exportar|descargar)(?:\s+(?:el|un))?\s+(?:xmi|xml|enterprise\s+architect)/i.test(lower)) {
        if (onExportXmi) onExportXmi();
        setVoiceState('idle');
        return;
      }
      if (/^(?:nuevo|limpiar|reiniciar)(?:\s+(?:el|un))?\s+(?:diagrama|lienzo|canvas)/i.test(lower)) {
        if (onResetCanvas) onResetCanvas();
        setVoiceState('idle');
        return;
      }

      // 2. Enviar a sendAiCommand
      try {
        const store = useUmlStore.getState();
        const currentClassesList = (handlersRef.current.currentClasses && handlersRef.current.currentClasses.length > 0)
          ? handlersRef.current.currentClasses
          : (store.classes || []).map((c) => c.name);

        const data = await sendAiCommand(transcriptText, currentClassesList);
        console.log("Respuesta de IA recibida:", data);

        let mutationApplied = false;
        const applyMutationFn = onApplyMutation || store.applyAiMutation;
        if (data && data.success && data.action && data.action !== 'UNKNOWN') {
          if (applyMutationFn) {
            const res = applyMutationFn(data);
            mutationApplied = res?.success !== false;
            if (onToast) {
              const msg = res?.message || data?.message || `Comando ejecutado con éxito ✓`;
              onToast(msg, mutationApplied ? 'success' : 'warning', 3500);
            }
          }
        }

        // Si el backend devolvió UNKNOWN o no aplicó mutación, intentar fallback local
        if (!mutationApplied) {
          const localParsed = parseVoiceCommand(transcriptText, currentClassesList);
          if (localParsed && localParsed.command !== 'UNKNOWN') {
            if (localParsed.command === 'CREATE_CLASS_WITH_ATTRS' || localParsed.command === 'CREATE_CLASS') {
              const res = store.applyAiMutation({
                action: 'ADD_CLASS',
                data: {
                  name: localParsed.params.className,
                  attributes: localParsed.params.attrs || [],
                }
              });
              if (onToast) onToast(res?.message || `Clase "${localParsed.params.className}" creada ✓`, 'success');
            } else if (localParsed.command === 'ADD_RELATION') {
              const res = store.applyAiMutation({
                action: 'ADD_RELATION',
                data: {
                  source: localParsed.params.source,
                  target: localParsed.params.target,
                  type: localParsed.params.type,
                  multiplicity: localParsed.params.multiplicity,
                }
              });
              if (onToast) onToast(res?.message || `Relación creada ✓`, 'success');
            }
          } else if (onToast && !data?.success) {
            onToast(data?.message || `No se pudo interpretar el comando: "${transcriptText}"`, 'warning', 4000);
          }
        }
      } catch (err) {
        console.error("Error al procesar comando por IA, ejecutando fallback local:", err);

        // Fallback local robusto
        const store = useUmlStore.getState();
        const currentClassesList = (handlersRef.current.currentClasses && handlersRef.current.currentClasses.length > 0)
          ? handlersRef.current.currentClasses
          : (store.classes || []).map((c) => c.name);

        const localParsed = parseVoiceCommand(transcriptText, currentClassesList);
        if (localParsed && localParsed.command !== 'UNKNOWN') {
          if (localParsed.command === 'CREATE_CLASS_WITH_ATTRS' || localParsed.command === 'CREATE_CLASS') {
            const res = store.applyAiMutation({
              action: 'ADD_CLASS',
              data: {
                name: localParsed.params.className,
                attributes: localParsed.params.attrs || [],
              }
            });
            if (onToast) onToast(res?.message || `Clase "${localParsed.params.className}" creada ✓`, 'success');
          } else if (localParsed.command === 'ADD_RELATION') {
            const res = store.applyAiMutation({
              action: 'ADD_RELATION',
              data: {
                source: localParsed.params.source,
                target: localParsed.params.target,
                type: localParsed.params.type,
                multiplicity: localParsed.params.multiplicity,
              }
            });
            if (onToast) onToast(res?.message || `Relación creada ✓`, 'success');
          }
        } else if (onToast) {
          onToast(`Error al procesar comando: ${err.message}`, 'error', 4000);
        }
      } finally {
        setVoiceState('idle');
      }

    };

    rec.onerror = (event) => {
      console.warn("SpeechRecognition error:", event.error, event);
      setVoiceState('idle');
      const { onToast } = handlersRef.current;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        if (onToast) onToast('Permiso de micrófono bloqueado. Habilita el permiso en el navegador', 'error', 5000);
      } else if (event.error === 'no-speech') {
        if (onToast) onToast('No se detectó voz. Vuelve a hacer clic y habla claro al micrófono', 'warning', 3500);
      } else if (event.error !== 'aborted') {
        if (onToast) onToast(`Error de micrófono (${event.error})`, 'error', 4000);
      }
    };

    rec.onend = () => {
      console.log('[SpeechRecognition] Sesión finalizada');
      setVoiceState((prev) => (prev === 'listening' ? 'idle' : prev));
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []); // Sin dependencias que destruyan la instancia en cada render

  const startListening = useCallback(() => {
    if (!isSupported) {
      const { onToast } = handlersRef.current;
      if (onToast) onToast('Tu navegador no soporta Web Speech API (usa Chrome o Edge)', 'warning');
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setVoiceState('listening');
        const { onToast } = handlersRef.current;
        if (onToast) {
          onToast('Escuchando… Di: "crear clase Factura con total double y fecha date"', 'info', 3500);
        }
      } catch (err) {
        if (err.name === 'InvalidStateError') {
          console.debug('[SpeechRecognition] Ya estaba iniciado');
        } else {
          console.warn('[SpeechRecognition] Error al iniciar:', err);
        }
      }
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setVoiceState('idle');
  }, []);

  const toggleListening = useCallback(() => {
    if (voiceState === 'listening') {
      stopListening();
    } else if (voiceState === 'idle') {
      startListening();
    }
  }, [voiceState, startListening, stopListening]);

  return {
    voiceState,
    isListening: voiceState === 'listening',
    isProcessing: voiceState === 'processing',
    transcript,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
  };
}

export default useSpeechRecognition;
