/**
 * Polyfill de TextEncoding (TextDecoder y TextEncoder) para React Native / Expo.
 *
 * Resuelve: "ReferenceError: Property 'TextDecoder' doesn't exist"
 * Requerido por @stomp/stompjs v6+ para decodificar frames binarios y texto UTF-8.
 */
import 'fast-text-encoding';

if (typeof global !== 'undefined') {
  if (typeof global.TextDecoder === 'undefined' && typeof TextDecoder !== 'undefined') {
    global.TextDecoder = TextDecoder;
  }
  if (typeof global.TextEncoder === 'undefined' && typeof TextEncoder !== 'undefined') {
    global.TextEncoder = TextEncoder;
  }
}

if (typeof globalThis !== 'undefined') {
  if (typeof globalThis.TextDecoder === 'undefined' && typeof TextDecoder !== 'undefined') {
    globalThis.TextDecoder = TextDecoder;
  }
  if (typeof globalThis.TextEncoder === 'undefined' && typeof TextEncoder !== 'undefined') {
    globalThis.TextEncoder = TextEncoder;
  }
}
