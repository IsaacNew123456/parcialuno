/**
 * Configuración de red para el cliente móvil CASE UML Mobile Studio.
 * 
 * NOTA IMPORTANTE:
 * Sustituir '192.168.1.15' por la dirección IPv4 local de la laptop/computadora
 * donde se está ejecutando el backend de Spring Boot (obtenible mediante 'ipconfig' en Windows).
 * Evitar 'localhost' o '127.0.0.1' al probar en dispositivos físicos o emuladores.
 */
export const API_BASE_URL = 'http://192.168.1.12:8080';




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
