import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { sendBusinessChat, transcribeAudio } from '../services/diagramApi';

const DOMAIN_CHIPS = [
  { id: 'contabilidad', label: '📊 Contabilidad y Asientos', prompt: 'Estructura la lógica de backend para un sistema contable con partida doble, plan de cuentas, asientos diarios y balance general.' },
  { id: 'inventarios', label: '📦 Inventarios y Almacén', prompt: 'Diseña la arquitectura de backend para gestión de inventarios multialmacén, control de stock mínimo y movimientos de entrada/salida.' },
  { id: 'transacciones', label: '💳 Transacciones y Pagos', prompt: 'Modela el backend para transacciones financieras seguras, estados de pago (PENDIENTE, APROBADO, RECHAZADO) y conciliación bancaria.' },
  { id: 'facturacion', label: '📑 Facturación Electrónica', prompt: 'Define el modelo de datos y reglas de negocio para facturación con clientes, detalles de ítem, impuestos y emisión fiscal.' },
];

const VOICE_PRESETS = [
  'Crear sistema contable con partida doble',
  'Estructurar inventario con productos y almacenes',
  'Diseñar pasarela de transacciones y pagos',
  'Generar libro diario y cuentas contables',
];

export default function BusinessChatModal({
  visible,
  onClose,
  onApplyArchitecture,
}) {
  const [messages, setMessages] = useState([
    {
      id: 'init_1',
      role: 'assistant',
      content: '¡Hola! Soy tu Asistente de Arquitectura Empresarial impulsado por el modelo local **Gemma 2 (2B)**.\n\nPuedes dictarme por voz o escribir para diseñar la lógica de tu backend: contabilidad, inventarios, transacciones financieras y reglas de negocio.\n\n¿Qué módulo empresarial deseas estructurar hoy?',
      source: 'gemma2:2b',
      suggestedArchitecture: null,
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('contabilidad');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const scrollViewRef = useRef(null);
  const recordingRef = useRef(null); // expo-av Recording instance

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 300);
    }
  }, [visible, messages]);

  const handleSendMessage = useCallback(async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    setErrorMsg(null);
    setInputText('');
    setIsListening(false);

    const userMessageId = `user_${Date.now()}`;
    const newMessages = [
      ...messages,
      { id: userMessageId, role: 'user', content: text },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Formatear historial para el backend
      const history = newMessages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await sendBusinessChat({
        message: text,
        history,
        domainContext: selectedDomain,
      });

      const assistantMsg = {
        id: `ast_${Date.now()}`,
        role: 'assistant',
        content: res.reply || 'He procesado tu consulta empresarial.',
        source: res.source || 'ollama-gemma2:2b',
        suggestedArchitecture: res.suggestedArchitecture || null,
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo comunicar con el modelo gemma2:2b.');
    } finally {
      setLoading(false);
    }
  }, [inputText, loading, messages, selectedDomain]);

  const handleSelectChip = (chip) => {
    setSelectedDomain(chip.id);
    setInputText(chip.prompt);
  };

  // ── Audio Recording (expo-av) ─────────────────────────────────────────────

  /**
   * Solicita permisos de micrófono y comienza a grabar.
   * Aísla completamente el flujo de audio — no toca chat ni lienzo.
   */
  const startRecording = useCallback(async () => {
    console.log('[BusinessChatModal] startRecording — solicitando permisos de micrófono...');
    setErrorMsg(null);

    try {
      // 1. Solicitar/verificar permiso de micrófono en tiempo de ejecución
      const { status } = await Audio.requestPermissionsAsync();
      console.log('[BusinessChatModal] Permiso de micrófono:', status);

      if (status !== 'granted') {
        const msg = 'Se necesita permiso de micrófono para grabar audio. Otórgalo desde Ajustes del dispositivo.';
        console.warn('[BusinessChatModal] Permiso denegado:', status);
        setErrorMsg(msg);
        Alert.alert('Permiso denegado', msg);
        return;
      }

      // 2. Configurar modo de audio
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      console.log('[BusinessChatModal] Modo de audio configurado.');

      // 3. Crear y preparar la grabación con preset de alta calidad
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsListening(true);
      console.log('[BusinessChatModal] Grabación iniciada. Estado:', await recording.getStatusAsync());
    } catch (err) {
      console.error('[BusinessChatModal] startRecording — error:', err.message, err);
      setErrorMsg('No se pudo iniciar la grabación: ' + err.message);
      setIsListening(false);
    }
  }, []);

  /**
   * Detiene la grabación, obtiene la URI y la envía al backend para transcripción.
   * El resultado se inyecta en handleSendMessage() para continuar el flujo normal del chat.
   */
  const stopRecording = useCallback(async () => {
    console.log('[BusinessChatModal] stopRecording — deteniendo grabación...');
    setIsListening(false);
    setIsTranscribing(true);
    setErrorMsg(null);

    const rec = recordingRef.current;
    recordingRef.current = null;

    if (!rec) {
      console.warn('[BusinessChatModal] stopRecording — no hay grabación activa en recordingRef.');
      setIsTranscribing(false);
      return;
    }

    try {
      // 1. Detener y descargar la grabación
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      console.log('[BusinessChatModal] Grabación detenida. URI:', uri);

      if (!uri) {
        throw new Error('La URI de la grabación es nula — expo-av no produjo el archivo.');
      }

      // 2. Restaurar modo de audio normal
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      // 3. Transcribir audio → texto
      console.log('[BusinessChatModal] Enviando audio para transcripción...');
      const transcript = await transcribeAudio(uri);
      console.log('[BusinessChatModal] Transcripción recibida:', transcript);

      if (transcript && transcript.trim()) {
        setInputText(transcript.trim());
        // Auto-enviar el mensaje transcrito
        handleSendMessage(transcript.trim());
      } else {
        setErrorMsg('La transcripción devolvió texto vacío. Intenta hablar más fuerte o más cerca.');
      }
    } catch (err) {
      console.error('[BusinessChatModal] stopRecording — error en transcripción:', err.message, err);
      setErrorMsg('Error al transcribir: ' + err.message);
    } finally {
      setIsTranscribing(false);
    }
  }, [handleSendMessage]);

  /**
   * Toggle del botón 🎤 — alterna entre startRecording y stopRecording.
   */
  const handleVoiceToggle = useCallback(() => {
    if (isListening) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isListening, startRecording, stopRecording]);

  const handleVoicePresetSelect = (presetText) => {
    setInputText(presetText);
    setIsListening(false);
    handleSendMessage(presetText);
  };

  const handleApplyToCanvas = (arch) => {
    if (!arch || !Array.isArray(arch.classes) || arch.classes.length === 0) {
      Alert.alert('Aviso', 'No se encontraron clases para transferir al lienzo.');
      return;
    }

    Alert.alert(
      'Aplicar al Lienzo',
      `¿Deseas volcar ${arch.classes.length} clases y ${(arch.relations || []).length} relaciones al lienzo principal?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, aplicar',
          onPress: () => {
            onApplyArchitecture?.(arch.classes, arch.relations || []);
            onClose?.();
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Encabezado ── */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadgeRow}>
              <Text style={styles.headerTitle}>🤖 Chatbot IA Empresarial</Text>
              <View style={styles.modelBadge}>
                <Text style={styles.modelBadgeText}>gemma2:2b · Local</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>Lógica de backend, contabilidad, inventarios y transacciones</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Cerrar chatbot"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* ── Chips de contexto temático ── */}
        <View style={styles.chipsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
            {DOMAIN_CHIPS.map(chip => {
              const active = selectedDomain === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => handleSelectChip(chip)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Panel de estado de voz ── */}
        {(isListening || isTranscribing) && (
          <View style={styles.voicePanel}>
            <View style={styles.voiceHeaderRow}>
              <View style={[styles.voicePulseDot, isTranscribing && { backgroundColor: '#f59e0b' }]} />
              <Text style={styles.voicePanelTitle}>
                {isTranscribing ? '⏳ Transcribiendo audio...' : '🔴 Grabando — habla ahora'}
              </Text>
              {!isTranscribing && (
                <TouchableOpacity onPress={stopRecording}>
                  <Text style={styles.voiceCloseText}>⏹ Detener</Text>
                </TouchableOpacity>
              )}
            </View>
            {!isTranscribing && (
              <Text style={styles.voiceHelpText}>
                Habla claramente. Toca ⏹ Detener o el botón 🔴 al terminar.
              </Text>
            )}
            {isTranscribing && (
              <ActivityIndicator size="small" color="#f59e0b" style={{ marginTop: 6 }} />
            )}
            <Text style={styles.voiceHelpText}>
              O usa frases rápidas:
            </Text>
            <View style={styles.voicePresetsWrap}>
              {!isTranscribing && VOICE_PRESETS.map((preset, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.voicePresetBtn}
                  onPress={() => handleVoicePresetSelect(preset)}
                >
                  <Text style={styles.voicePresetText}>🎤 "{preset}"</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Banner de error ── */}
        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠ {errorMsg}</Text>
            <TouchableOpacity onPress={() => setErrorMsg(null)}>
              <Text style={styles.errorClose}>×</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Mensajes del chat ── */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <View
                key={m.id}
                style={[
                  styles.messageBubble,
                  isUser ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                {!isUser && (
                  <View style={styles.msgHeader}>
                    <Text style={styles.assistantLabel}>Gemma 2:2b (IA Local)</Text>
                    {m.source && (
                      <Text style={styles.sourceLabel}>{m.source}</Text>
                    )}
                  </View>
                )}
                <Text style={isUser ? styles.userText : styles.assistantText}>
                  {m.content}
                </Text>

                {/* Botón para volcar arquitectura al lienzo si viene en la respuesta */}
                {!isUser && m.suggestedArchitecture?.classes?.length > 0 && (
                  <TouchableOpacity
                    style={styles.applyCanvasBtn}
                    onPress={() => handleApplyToCanvas(m.suggestedArchitecture)}
                  >
                    <Text style={styles.applyCanvasBtnIcon}>⚡</Text>
                    <Text style={styles.applyCanvasBtnText}>
                      Aplicar al Lienzo ({m.suggestedArchitecture.classes.length} clases)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {loading && (
            <View style={[styles.messageBubble, styles.assistantBubble, styles.loadingBubble]}>
              <ActivityIndicator size="small" color="#38bdf8" />
              <Text style={styles.loadingBubbleText}>Gemma 2:2b está pensando y estructurando...</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Barra de entrada inferior ── */}
        <View style={styles.inputBar}>
          {/* Botón de micrófono */}
          <TouchableOpacity
            style={[
              styles.micBtn,
              isListening && styles.micBtnActive,
              isTranscribing && styles.micBtnTranscribing,
            ]}
            onPress={handleVoiceToggle}
            disabled={isTranscribing || loading}
            accessibilityLabel={isListening ? 'Detener grabación de voz' : 'Activar grabación de voz'}
          >
            <Text style={styles.micBtnIcon}>
              {isTranscribing ? '⏳' : isListening ? '🔴' : '🎤'}
            </Text>
          </TouchableOpacity>

          {/* Campo de texto */}
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Pregunta o describe la lógica empresarial..."
            placeholderTextColor="#64748b"
            multiline
            maxLength={1200}
            editable={!loading}
            returnKeyType="send"
            onSubmitEditing={() => handleSendMessage()}
          />

          {/* Botón de envío */}
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => handleSendMessage()}
            disabled={!inputText.trim() || loading}
            accessibilityLabel="Enviar mensaje"
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 14,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  modelBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#0284c7',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modelBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeBtnText: {
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '700',
  },
  chipsContainer: {
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingVertical: 8,
  },
  chipsContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  chipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#38bdf8',
  },
  chipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  voicePanel: {
    backgroundColor: '#1e1b4b',
    borderBottomWidth: 1,
    borderBottomColor: '#4338ca',
    padding: 12,
  },
  voiceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  voicePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f43f5e',
    marginRight: 6,
  },
  voicePanelTitle: {
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  voiceCloseText: {
    color: '#a5b4fc',
    fontSize: 11,
    fontWeight: '600',
  },
  voiceHelpText: {
    color: '#818cf8',
    fontSize: 11,
    marginBottom: 8,
  },
  voicePresetsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  voicePresetBtn: {
    backgroundColor: '#312e81',
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  voicePresetText: {
    color: '#e0e7ff',
    fontSize: 11,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#450a0a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#7f1d1d',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    flex: 1,
  },
  errorClose: {
    color: '#f87171',
    fontSize: 18,
    fontWeight: '700',
    paddingLeft: 8,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageBubble: {
    maxWidth: '88%',
    borderRadius: 12,
    padding: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 2,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderBottomLeftRadius: 2,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  assistantLabel: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  sourceLabel: {
    color: '#64748b',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  userText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
  },
  assistantText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 19,
  },
  applyCanvasBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  applyCanvasBtnIcon: {
    fontSize: 14,
  },
  applyCanvasBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  loadingBubbleText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: '#4338ca',
    borderColor: '#6366f1',
  },
  micBtnIcon: {
    fontSize: 18,
  },
  textInput: {
    flex: 1,
    maxHeight: 100,
    minHeight: 40,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f8fafc',
    fontSize: 13,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#1e293b',
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
