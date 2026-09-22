import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { scanDiagramApi } from '../services/diagramApi';

export default function ScanDiagramModal({
  visible,
  onClose,
  onApplyDiagram,
}) {
  const [selectedImage, setSelectedImage] = useState(null); // { uri, base64 }
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { classes, relations, rawDescription, success, message }
  const [errorMsg, setErrorMsg] = useState(null);

  const handlePickFromGallery = async () => {
    setErrorMsg(null);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Se necesita permiso para acceder a la galería de fotos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedImage({
          uri: asset.uri,
          base64: asset.base64,
        });
        setScanResult(null);
      }
    } catch (err) {
      setErrorMsg('Error al abrir la galería: ' + err.message);
    }
  };

  const handleTakePhoto = async () => {
    setErrorMsg(null);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Se necesita permiso de cámara para fotografiar diagramas.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedImage({
          uri: asset.uri,
          base64: asset.base64,
        });
        setScanResult(null);
      }
    } catch (err) {
      setErrorMsg('Error al abrir la cámara: ' + err.message);
    }
  };

  const handleProcessImage = async () => {
    if (!selectedImage?.base64) {
      Alert.alert('Imagen requerida', 'Por favor toma una foto o selecciona una imagen de un diagrama UML.');
      return;
    }

    setScanning(true);
    setErrorMsg(null);

    try {
      const res = await scanDiagramApi(selectedImage.base64);
      setScanResult(res);

      if (res.classes && res.classes.length > 0) {
        // Notificación de éxito
      } else {
        setErrorMsg('Moondream no detectó clases legibles en la imagen. Intenta con mayor iluminación.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error al procesar la imagen con Moondream en Ollama.');
    } finally {
      setScanning(false);
    }
  };

  const handleApplyToCanvas = () => {
    if (!scanResult?.classes || scanResult.classes.length === 0) {
      Alert.alert('Sin datos', 'No hay clases detectadas para aplicar.');
      return;
    }

    Alert.alert(
      'Renderizar en el Lienzo',
      `¿Deseas volcar ${scanResult.classes.length} clases y ${(scanResult.relations || []).length} relaciones reconocidas por Moondream en el canvas?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, renderizar',
          onPress: () => {
            onApplyDiagram?.(scanResult.classes, scanResult.relations || []);
            // Limpiar estado y cerrar
            setSelectedImage(null);
            setScanResult(null);
            onClose?.();
          },
        },
      ]
    );
  };

  const handleReset = () => {
    setSelectedImage(null);
    setScanResult(null);
    setErrorMsg(null);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* ── Encabezado ── */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadgeRow}>
              <Text style={styles.headerTitle}>📷 Escanear Diagrama UML</Text>
              <View style={styles.modelBadge}>
                <Text style={styles.modelBadgeText}>moondream · Visión Local</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>
              Fotografía o sube un diagrama dibujado y conviértelo en clases interactivas
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Cerrar escáner"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* ── Botones de captura / selección ── */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cameraBtn]}
              onPress={handleTakePhoto}
              disabled={scanning}
            >
              <Text style={styles.actionBtnIcon}>📸</Text>
              <Text style={styles.actionBtnText}>Tomar Foto</Text>
              <Text style={styles.actionBtnSub}>Cámara nativa</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.galleryBtn]}
              onPress={handlePickFromGallery}
              disabled={scanning}
            >
              <Text style={styles.actionBtnIcon}>🖼️</Text>
              <Text style={styles.actionBtnText}>Elegir Galería</Text>
              <Text style={styles.actionBtnSub}>Foto existente</Text>
            </TouchableOpacity>
          </View>

          {/* ── Banner de error si aplica ── */}
          {errorMsg && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠ {errorMsg}</Text>
            </View>
          )}

          {/* ── Vista previa de imagen seleccionada ── */}
          {selectedImage && (
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>Vista previa de la imagen</Text>
                <TouchableOpacity onPress={handleReset} disabled={scanning}>
                  <Text style={styles.previewResetText}>Cambiar foto</Text>
                </TouchableOpacity>
              </View>
              <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} resizeMode="contain" />

              {!scanResult && (
                <TouchableOpacity
                  style={[styles.processBtn, scanning && styles.processBtnDisabled]}
                  onPress={handleProcessImage}
                  disabled={scanning}
                >
                  {scanning ? (
                    <View style={styles.scanningWrap}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={styles.processBtnText}>Analizando con Moondream en Ollama...</Text>
                    </View>
                  ) : (
                    <Text style={styles.processBtnText}>🔍 Procesar Diagrama con Moondream</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Estado de escaneo activo ── */}
          {scanning && (
            <View style={styles.scanningInfoCard}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.scanningInfoTitle}>Modelo de Visión Activo</Text>
              <Text style={styles.scanningInfoBody}>
                Moondream está reconociendo cajas de clases, atributos tipados y flechas de relación en el diagrama...
              </Text>
            </View>
          )}

          {/* ── Resultado del escaneo ── */}
          {scanResult && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View>
                  <Text style={styles.resultTitle}>✅ Reconocimiento Completado</Text>
                  <Text style={styles.resultSubtitle}>
                    {scanResult.classes.length} clases · {(scanResult.relations || []).length} relaciones
                  </Text>
                </View>
                <View style={styles.resultSourceBadge}>
                  <Text style={styles.resultSourceText}>{scanResult.source || 'moondream'}</Text>
                </View>
              </View>

              {/* Lista de clases detectadas */}
              <View style={styles.classList}>
                {scanResult.classes.map((cls, i) => (
                  <View key={cls.id || i} style={styles.classItem}>
                    <Text style={styles.classNameText}>📦 {cls.name}</Text>
                    {cls.attrs && cls.attrs.length > 0 && (
                      <View style={styles.attrsWrap}>
                        {cls.attrs.map((a, j) => (
                          <Text key={j} style={styles.attrItemText}>
                            • {a.name}: <Text style={styles.attrTypeText}>{a.type || 'String'}</Text>
                          </Text>
                        ))}
                      </View>
                    )}
                    {cls.methods && cls.methods.length > 0 && (
                      <View style={styles.methodsWrap}>
                        {cls.methods.map((m, k) => (
                          <Text key={k} style={styles.methodItemText}>
                            ⚙ {m}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* Botón principal de volcado al canvas */}
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={handleApplyToCanvas}
              >
                <Text style={styles.applyBtnIcon}>✨</Text>
                <Text style={styles.applyBtnText}>Renderizar en el Lienzo Principal</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
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
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: '#9333ea',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modelBadgeText: {
    color: '#c084fc',
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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cameraBtn: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
  },
  galleryBtn: {
    borderColor: '#818cf8',
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  actionBtnIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  actionBtnText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  actionBtnSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  errorBanner: {
    backgroundColor: '#450a0a',
    borderColor: '#7f1d1d',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 16,
  },
  previewCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  previewResetText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  processBtn: {
    marginTop: 12,
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processBtnDisabled: {
    backgroundColor: '#4c1d95',
    opacity: 0.7,
  },
  processBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  scanningWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanningInfoCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  scanningInfoTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  scanningInfoBody: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  resultCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0284c7',
    padding: 16,
    gap: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  resultTitle: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '800',
  },
  resultSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  resultSourceBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resultSourceText: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  classList: {
    gap: 8,
  },
  classItem: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 10,
  },
  classNameText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  attrsWrap: {
    gap: 2,
  },
  attrItemText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  attrTypeText: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  methodsWrap: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 4,
    gap: 2,
  },
  methodItemText: {
    color: '#c084fc',
    fontSize: 11,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
    marginTop: 4,
  },
  applyBtnIcon: {
    fontSize: 16,
  },
  applyBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
