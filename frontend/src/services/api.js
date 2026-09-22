import axios from 'axios';

/**
 * Cliente Axios configurado con baseURL apuntando a /api (proxy en vite.config.js -> localhost:8080).
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.message ||
      err.response?.data?.error ||
      err.message ||
      'Error de red o comunicación con el backend';
    return Promise.reject(new Error(message));
  }
);

/**
 * POST /api/diagrams
 */
export async function saveDiagram(data) {
  const res = await apiClient.post('/diagrams', {
    name: data.name,
    classes: data.classes,
    relations: data.relations,
    contentJson: JSON.stringify({ classes: data.classes, relations: data.relations }),
  });
  return res.data;
}

/**
 * GET /api/diagrams
 */
export async function getDiagrams() {
  const res = await apiClient.get('/diagrams');
  return res.data;
}

/**
 * GET /api/diagrams/{id}
 */
export async function getDiagramById(id) {
  const res = await apiClient.get(`/diagrams/${id}`);
  return res.data;
}

/**
 * PUT /api/diagrams/{id}
 */
export async function updateDiagram(id, data) {
  const res = await apiClient.put(`/diagrams/${id}`, {
    name: data.name,
    classes: data.classes,
    relations: data.relations,
    contentJson: JSON.stringify({ classes: data.classes, relations: data.relations }),
  });
  return res.data;
}

/**
 * DELETE /api/diagrams/{id}
 */
export async function deleteDiagram(id) {
  await apiClient.delete(`/diagrams/${id}`);
}

/**
 * POST /api/rooms - Crear una nueva sala colaborativa
 */
export async function createRoom(data = {}) {
  const res = await apiClient.post('/rooms', data);
  return res.data;
}

/**
 * POST /api/rooms/join - Unirse a una sala mediante código alfanumérico
 */
export async function joinRoom(code) {
  const res = await apiClient.post('/rooms/join', { code });
  return res.data;
}

/**
 * GET /api/rooms/code/{code} - Consultar detalles de la sala por código
 */
export async function getRoomByCode(code) {
  const res = await apiClient.get(`/rooms/code/${code}`);
  return res.data;
}

/**
 * GET /api/rooms - Listar salas disponibles
 */
export async function getRooms() {
  const res = await apiClient.get('/rooms');
  return res.data;
}

/**
 * POST /api/export/zip
 */
export async function exportBackendZip(diagramModel) {
  const res = await apiClient.post('/export/zip', diagramModel, {
    responseType: 'blob',
  });

  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'spring-boot-backend.zip';
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * POST /api/export/xmi
 * Exporta el diagrama actual en formato XMI 2.1 estándar (Enterprise Architect).
 */
export async function exportDiagramXmi(diagramModel) {
  const res = await apiClient.post('/export/xmi', diagramModel, {
    responseType: 'blob',
  });

  const name = (diagramModel.name || 'diagrama').replace(/[^a-zA-Z0-9_-]/g, '_');
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name}.xmi`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * POST /api/export/postman
 * Exporta el diagrama actual a una colección Postman v2.1.0 (JSON).
 */
export async function exportPostmanCollection(diagramModel) {
  const res = await apiClient.post('/export/postman', diagramModel, {
    responseType: 'blob',
  });

  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'postman-collection.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * POST /api/diagrams/import-xmi
 * Sube un archivo .xmi / .xml y recibe el DiagramModel estructurado.
 */
export async function importDiagramXmi(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post('/diagrams/import-xmi', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

/**
 * POST /api/ai/command
 * Envía la orden en lenguaje natural y la lista de clases actuales al backend para interpretación estructurada.
 */
export async function sendAiCommand(prompt, currentClasses = []) {
  const res = await apiClient.post('/ai/command', {
    prompt,
    currentClasses,
  });
  return res.data;
}

export default apiClient;

