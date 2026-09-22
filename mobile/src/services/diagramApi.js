/**
 * Cliente REST para la API de diagramas del backend Spring Boot.
 * Usa fetch nativo — sin dependencias extra.
 *
 * Endpoints:
 *   GET  /api/diagrams            → lista todos los diagramas
 *   GET  /api/diagrams/:id        → obtiene un diagrama por ID
 *   POST /api/diagrams            → crea un diagrama nuevo
 *   POST /api/ai/command          → envía un comando a la IA y recibe un schema
 *   GET  /api/export/zip          → descarga el proyecto Spring Boot como ZIP
 */
import * as FileSystem from 'expo-file-system';
import { API_BASE_URL } from '../config/api';

const BASE = `${API_BASE_URL}/api/diagrams`;

/**
 * Devuelve todos los diagramas disponibles.
 * @returns {Promise<Array<{id, name, createdAt}>>}
 */
export async function fetchDiagrams() {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`fetchDiagrams failed: ${res.status}`);
  return res.json();
}

/**
 * Obtiene un diagrama por ID, incluyendo clases y relaciones.
 * @param {number|string} id
 * @returns {Promise<{id, name, classes, relations}>}
 */
export async function fetchDiagram(id) {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error(`fetchDiagram(${id}) failed: ${res.status}`);
  return res.json();
}

/**
 * Crea un nuevo diagrama en blanco en el backend.
 * @param {string} name Nombre del diagrama
 * @returns {Promise<{id, name}>}
 */
export async function createDiagram(name) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, contentJson: '{}' }),
  });
  if (!res.ok) throw new Error(`createDiagram failed: ${res.status}`);
  return res.json();
}

const ROOMS_BASE = `${API_BASE_URL}/api/rooms`;

/**
 * Crea una nueva sala colaborativa en el backend con código único.
 * @param {string} [name] Nombre opcional de la sala
 * @returns {Promise<{id, code, name, diagramId, diagram}>}
 */
export async function createRoomApi(name) {
  const res = await fetch(ROOMS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name || 'Sala Móvil' }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Error creando sala (${res.status}): ${errorText || res.statusText}`);
  }
  return res.json();
}

/**
 * Se une a una sala por su código alfanumérico (ej. '1234').
 * @param {string} code Código de la sala
 * @returns {Promise<{id, code, name, diagramId, diagram}>}
 */
export async function joinRoomApi(code) {
  const res = await fetch(`${ROOMS_BASE}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: String(code).trim().toUpperCase() }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Error uniéndose a la sala (${res.status}): ${errorText || res.statusText}`);
  }
  return res.json();
}

/**
 * Consulta los datos de una sala por su código alfanumérico.
 * @param {string} code
 * @returns {Promise<{id, code, name, diagramId, diagram}>}
 */
export async function fetchRoomByCode(code) {
  const res = await fetch(`${ROOMS_BASE}/code/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`fetchRoomByCode failed: ${res.status}`);
  return res.json();
}

/**
 * Envía un comando de texto a la IA del backend y recibe el schema de clases.
 *
 * Estrategia de parsing defensiva:
 *   - res.classes            → formato directo (igual que snapshot STOMP)
 *   - res.schema?.classes    → esquema anidado
 *   - Array                  → lista de clases directa
 *
 * @param {string} command Texto del comando, p.ej. "Crear backend para contabilidad"
 * @returns {Promise<{ classes: Array, relations: Array }>}
 * @throws {Error} Si la red falla o el servidor responde con error HTTP
 */
export async function sendAiCommand(command) {
  const res = await fetch(`${API_BASE_URL}/api/ai/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  });

  if (!res.ok) {
    throw new Error(`AI command failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // Parsing defensivo — distintos formatos posibles de respuesta
  if (data && Array.isArray(data.classes)) {
    return { classes: data.classes, relations: data.relations ?? [] };
  }
  if (data?.schema && Array.isArray(data.schema.classes)) {
    return { classes: data.schema.classes, relations: data.schema.relations ?? [] };
  }
  if (Array.isArray(data)) {
    return { classes: data, relations: [] };
  }

  // Respuesta inesperada — propagar como error descriptivo
  throw new Error(
    `Respuesta inesperada del servidor IA: ${JSON.stringify(data).slice(0, 120)}`
  );
}

/**
 * Descarga el proyecto generado como ZIP desde el backend y devuelve la URI
 * local del archivo en el directorio de caché de Expo.
 *
 * El archivo se guarda en `FileSystem.cacheDirectory + 'backend.zip'`.
 * El llamante es responsable de abrir el diálogo de compartir con expo-sharing.
 *
 * @returns {Promise<string>} URI local del archivo ZIP descargado
 * @throws {Error} Si la red falla, el servidor responde con error, o el almacenamiento falla
 */
export async function downloadZip(diagramId) {
  const localUri = FileSystem.cacheDirectory + 'backend.zip';
  const query = diagramId ? `?diagramId=${encodeURIComponent(diagramId)}` : '';

  const { status, uri } = await FileSystem.downloadAsync(
    `${API_BASE_URL}/api/export/zip${query}`,
    localUri
  );

  if (status !== 200) {
    throw new Error(`ZIP download failed with HTTP ${status}`);
  }

  return uri;
}

/**
 * Envía una consulta al Chatbot de IA Empresarial (gemma2:2b).
 * @param {{ message: string, history?: Array<{role: string, content: string}>, domainContext?: string }} param0
 * @returns {Promise<{ reply: string, suggestedArchitecture?: { classes: Array, relations: Array }, success: boolean, source: string, message?: string }>}
 */
export async function sendBusinessChat({ message, history = [], domainContext = '' }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout para modelo local

  try {
    const res = await fetch(`${API_BASE_URL}/api/ai/business-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, domainContext }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Error en el chatbot (${res.status}): ${errBody || res.statusText}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('La consulta tomó más tiempo del esperado (timeout 60s). Ollama local está ocupado procesando.');
    }
    throw err;
  }
}

/**
 * Envía una imagen en base64 al backend para procesar el diagrama UML con el modelo multimodal moondream.
 * @param {string} imageBase64 Cadena base64 de la imagen seleccionada o capturada
 * @returns {Promise<{ classes: Array, relations: Array, rawDescription?: string, success: boolean, message?: string, source?: string }>}
 */
export async function scanDiagramApi(imageBase64) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 75000); // 75s timeout para modelo de visión

  try {
    const res = await fetch(`${API_BASE_URL}/api/ai/scan-diagram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Error escaneando diagrama (${res.status}): ${errBody || res.statusText}`);
    }

    const data = await res.json();
    return {
      classes: Array.isArray(data.classes) ? data.classes : [],
      relations: Array.isArray(data.relations) ? data.relations : [],
      rawDescription: data.rawDescription || '',
      success: data.success ?? true,
      message: data.message || '',
      source: data.source || 'ollama-moondream',
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('El modelo de visión tardó demasiado tiempo en responder (timeout 75s).');
    }
    throw err;
  }
}

/**
 * Envía un archivo de audio al backend para transcripción STT mediante Ollama/Whisper.
 *
 * @param {string} audioUri  URI local del archivo de audio (producida por expo-av)
 * @returns {Promise<string>} Texto transcrito del audio
 * @throws {Error} Con mensaje descriptivo si la red falla, el archivo está vacío,
 *                 o Whisper no está disponible en Ollama.
 */
export async function transcribeAudio(audioUri) {
  console.log('[transcribeAudio] Iniciando subida de audio:', audioUri);

  if (!audioUri) {
    throw new Error('URI de audio vacía: el archivo no fue grabado correctamente.');
  }

  // Validar que el archivo existe y no está vacío antes de subir
  let fileInfo;
  try {
    fileInfo = await FileSystem.getInfoAsync(audioUri);
    console.log('[transcribeAudio] Info del archivo:', JSON.stringify(fileInfo));
  } catch (infoErr) {
    console.error('[transcribeAudio] Error obteniendo info del archivo:', infoErr);
    throw new Error('No se pudo acceder al archivo de audio grabado: ' + infoErr.message);
  }

  if (!fileInfo.exists) {
    throw new Error('El archivo de audio no existe en la URI especificada: ' + audioUri);
  }
  if (fileInfo.size === 0) {
    throw new Error('El archivo de audio está vacío (0 bytes). La grabación falló silenciosamente.');
  }

  console.log('[transcribeAudio] Archivo válido. Tamaño:', fileInfo.size, 'bytes. Enviando al backend...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s — Whisper puede tardar

  try {
    // Construir form-data con el campo 'audio' que espera el backend
    const formData = new FormData();
    const fileName = audioUri.split('/').pop() || 'recording.m4a';
    const mimeType = fileName.endsWith('.wav') ? 'audio/wav'
                   : fileName.endsWith('.ogg') ? 'audio/ogg'
                   : 'audio/m4a';

    formData.append('audio', {
      uri: audioUri,
      name: fileName,
      type: mimeType,
    });

    console.log('[transcribeAudio] FormData construido — fileName=%s, type=%s', fileName, mimeType);

    const res = await fetch(`${API_BASE_URL}/api/ai/transcribe-audio`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      // NO incluir Content-Type manualmente — fetch lo genera con el boundary correcto
    });

    clearTimeout(timeoutId);
    console.log('[transcribeAudio] Respuesta HTTP:', res.status);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[transcribeAudio] Error HTTP del servidor:', res.status, errBody);
      throw new Error(`Error en la transcripción (HTTP ${res.status}): ${errBody || res.statusText}`);
    }

    const data = await res.json();
    console.log('[transcribeAudio] Respuesta JSON:', JSON.stringify(data));

    if (!data.success) {
      throw new Error(data.message || 'El servicio de transcripción devolvió un error sin mensaje.');
    }

    if (!data.transcript || data.transcript.trim() === '') {
      throw new Error('La transcripción está vacía. Habla más cerca del micrófono o verifica que Whisper esté instalado en Ollama.');
    }

    console.log('[transcribeAudio] Transcripción exitosa:', data.transcript);
    return data.transcript.trim();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[transcribeAudio] Timeout de 90s superado.');
      throw new Error('La transcripción tomó demasiado tiempo (90s). Whisper está ocupado o no está disponible.');
    }
    console.error('[transcribeAudio] Error inesperado:', err.message);
    throw err;
  }
}
