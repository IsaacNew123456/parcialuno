/**
 * LoginScreen — Pantalla de inicio de sesión del modelador UML móvil.
 *
 * Características:
 *   - Campos prellenados con credenciales de prueba: isaac / 123456
 *   - Validación básica antes de llamar al backend
 *   - Al éxito llama a onLoginSuccess() para que App.js cambie la vista a HomeScreen
 *   - Aislado: no toca estado global, WebSockets, ni el resto de módulos
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

// ── Credenciales de acceso rápido para pruebas ──────────────────────
const DEFAULT_USERNAME = 'isaac';
const DEFAULT_PASSWORD = '123456';

/**
 * @param {{ onLoginSuccess: () => void }} props
 */
export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // ── Handler principal de login (fachada directa al lienzo) ────────
  function handleLogin() {
    onLoginSuccess?.();
  }

  // ── Acceso alternativo (fachada directa al lienzo) ─────────────────
  function handleOfflineAccess() {
    onLoginSuccess?.();
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#080f1e" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <View style={styles.container}>

          {/* ── Logo / Branding ── */}
          <View style={styles.brandingBlock}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>UML</Text>
            </View>
            <Text style={styles.appName}>CASE UML Studio</Text>
            <Text style={styles.appTagline}>Modelado colaborativo en tiempo real</Text>
          </View>

          {/* ── Card de login ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Iniciar sesión</Text>

            {/* Campo usuario */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Usuario</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputIcon}>👤</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Nombre de usuario"
                  placeholderTextColor="#334155"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="next"
                  accessibilityLabel="Campo de nombre de usuario"
                />
              </View>
            </View>

            {/* Campo contraseña */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Contraseña"
                  placeholderTextColor="#334155"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  accessibilityLabel="Campo de contraseña"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  style={styles.eyeBtn}
                  accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Mensaje de error */}
            {error !== null && (
              <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Text style={styles.errorIcon}>⚠</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Botón principal */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              accessibilityLabel="Ingresar a la aplicación"
              accessibilityRole="button"
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.loginBtnText}>Ingresar →</Text>
              }
            </TouchableOpacity>

            {/* Divisor */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Acceso offline */}
            <TouchableOpacity
              style={styles.offlineBtn}
              onPress={handleOfflineAccess}
              disabled={loading}
              accessibilityLabel="Continuar sin conexión"
              accessibilityRole="button"
            >
              <Text style={styles.offlineBtnText}>Continuar sin conexión</Text>
            </TouchableOpacity>
          </View>

          {/* ── Hint de credenciales de prueba ── */}
          <View style={styles.hintBox}>
            <Text style={styles.hintIcon}>💡</Text>
            <Text style={styles.hintText}>
              Campos prellenados con credenciales de prueba:{' '}
              <Text style={styles.hintCode}>isaac / 123456</Text>
            </Text>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080f1e' },
  flex: { flex: 1 },

  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 24,
  },

  // ── Branding ────────────────────────────────────────────────────
  brandingBlock: {
    alignItems: 'center',
    gap: 8,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  logoText: {
    color: '#38bdf8',
    fontSize: 22,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  },
  appName: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  appTagline: {
    color: '#475569',
    fontSize: 12,
    letterSpacing: 0.3,
  },

  // ── Card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },

  // ── Fields ──────────────────────────────────────────────────────
  fieldGroup: { gap: 6 },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  inputIcon: { fontSize: 15 },
  input: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    height: '100%',
  },
  eyeBtn: {
    paddingLeft: 4,
  },
  eyeIcon: { fontSize: 16 },

  // ── Error ───────────────────────────────────────────────────────
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(127,29,29,0.4)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  errorIcon: { fontSize: 14, marginTop: 1 },
  errorText: {
    flex: 1,
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 18,
  },

  // ── Login button ────────────────────────────────────────────────
  loginBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  loginBtnDisabled: {
    backgroundColor: '#312e81',
    opacity: 0.7,
    shadowOpacity: 0,
    elevation: 0,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // ── Divider ─────────────────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e293b',
  },
  dividerText: {
    color: '#334155',
    fontSize: 12,
  },

  // ── Offline button ───────────────────────────────────────────────
  offlineBtn: {
    borderRadius: 10,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  offlineBtnText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Hint ────────────────────────────────────────────────────────
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(56,189,248,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  hintIcon: { fontSize: 13, marginTop: 1 },
  hintText: {
    flex: 1,
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
  },
  hintCode: {
    color: '#38bdf8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
  },
});
