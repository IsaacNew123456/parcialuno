/**
 * Configuración de red para el cliente móvil CASE UML Mobile Studio.
 * 
 * NOTA IMPORTANTE:
 * URL base del backend en AWS: http://3.14.3.4:8080
 */
export const API_BASE_URL = 'http://3.14.3.4:8080';




export const API_ENDPOINTS = {
  DIAGRAMS: `${API_BASE_URL}/api/diagrams`,
  AI_COMMANDS: `${API_BASE_URL}/api/ai`,
  EXPORT: `${API_BASE_URL}/api/export`,
  WS_BROKER: `${API_BASE_URL}/ws`,
};

export default {
  API_BASE_URL,
  API_ENDPOINTS,
};
