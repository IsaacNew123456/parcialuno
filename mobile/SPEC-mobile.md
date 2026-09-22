# Spec: CASE UML Mobile Studio

## Objective
Proporcionar un cliente móvil nativo multiplataforma (Android / iOS) desarrollado con React Native y Expo para modelado y visualización colaborativa de diagramas UML (clases, casos de uso, secuencia, etc.), compatible con la API y WebSockets del backend Spring Boot.

## Tech Stack
- Framework: Expo (SDK ~51.0.0) / React Native (~0.74.5)
- Lenguaje: JavaScript (ES6+)
- Dependencias principales:
  - `expo`: Runtime y utilidades del framework
  - `react`: ^18.2.0
  - `react-native`: 0.74.5
  - `react-native-gesture-handler`: Soporte táctil avanzado y gestos
  - `react-native-reanimated`: Animaciones de alta velocidad a 60fps
  - `react-native-svg`: Motor de renderizado vectorial para canvas UML
  - `expo-file-system`: Manejo del sistema de archivos local para proyectos y exportaciones
  - `expo-sharing`: Compatibilidad con diálogo nativo para compartir diagramas

## Commands
- Instalación: `npm install` (en carpeta `mobile/`)
- Iniciar Expo Bundler: `npm start` o `npx expo start`
- Ejecutar en Android: `npm run android` o `npx expo start --android`
- Ejecutar en iOS: `npm run ios` o `npx expo start --ios`
- Vista previa web: `npm run web` o `npx expo start --web`

## Project Structure
```
mobile/
├── src/
│   ├── components/          → Componentes de interfaz móvil (Canvas, Toolbar, etc.)
│   ├── config/              → Configuración de entorno y red
│   │   └── api.js           → URL base de la API y endpoints
│   ├── navigation/          → Enrutamiento y pantallas de navegación
│   ├── services/            → Servicios HTTP y clientes WebSocket (STOMP)
│   └── utils/               → Funciones de utilidad y serialización
├── App.js                   → Entrada principal de la aplicación móvil
├── app.json                 → Configuración del manifiesto de Expo
├── package.json             → Declaración de dependencias y scripts
└── SPEC-mobile.md           → Esta especificación viva
```

## Code Style
- Componentes funcionales y Hooks de React (`useState`, `useEffect`, `useCallback`, `useMemo`).
- Estilos con `StyleSheet.create`, respetando tema oscuro (`#0f172a` fondo principal, `#1e293b` contenedor/tarjeta, `#38bdf8` y `#6366f1` acentos).
- Nombres de componentes en PascalCase, funciones auxiliares y utilidades en camelCase.

## Testing Strategy
- Validación sintáctica de archivos con Node.js (`node -c`).
- Pruebas unitarias con Jest / React Native Testing Library (a incorporar en slices posteriores).
- Verificación en dispositivo físico o emulador mediante Expo Go.

## Boundaries
- **Siempre:** Mantener `backend/` y `frontend/` aislados e intactos.
- **Consultar primero:** Adición de dependencias que requieran linking nativo custom o expulsión de Expo (eject / prebuild invasivo).
- **Nunca:** Hardcodear direcciones IP fijas sin opción de sobreescritura o configuración en `mobile/src/config/api.js`.

## Success Criteria
- Manifiestos de Expo (`package.json`, `app.json`) válidos y listos para instalación.
- Configuración de red modularizada en `mobile/src/config/api.js`.
- Pantalla de bienvenida `mobile/App.js` con confirmación visual de inicialización correcta.
