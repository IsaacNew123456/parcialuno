import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.90, 360);

const RELATION_TYPES = [
  { id: 'association', label: 'Asociación simple', symbol: '―', desc: 'Conexión estándar entre clases' },
  { id: 'aggregation', label: 'Agregación', symbol: '◇', desc: 'Contenedor débil (1..*)' },
  { id: 'composition', label: 'Composición', symbol: '◆', desc: 'Contenedor fuerte CASCADE (1..*)' },
  { id: 'inheritance', label: 'Herencia', symbol: '◁', desc: 'Generalización (Hija hereda de Padre)' },
];

const MULTIPLICITIES = [
  { id: '1..*', label: '1 a muchos (1..*)' },
  { id: '*..*', label: 'Muchos a muchos (*..*) [N:M]' },
  { id: '1..1', label: 'Uno a uno (1..1)' },
  { id: '0..1', label: 'Cero a uno (0..1)' },
  { id: '0..*', label: 'Cero a muchos (0..*)' },
];

/**
 * Panel lateral deslizante para crear y gestionar clases y relaciones UML.
 * Se abre como un Modal desde el lado izquierdo de la pantalla.
 *
 * Props:
 *   visible          — boolean
 *   onClose          — () => void
 *   onAddClass       — (cls: { name, attrs: [{name, type}] }) => void
 *   classes          — array de clases [{ id, name, attrs }]
 *   relations        — array de relaciones [{ id, fromId, toId, relationType, mult, ... }]
 *   onAddRelation    — (rel: { fromId, toId, relationType, mult, intermediateTableName }) => void
 *   onDeleteRelation — (id: string) => void
 */
export default function ClassDrawer({
  visible,
  onClose,
  onAddClass,
  classes = [],
  relations = [],
  onAddRelation,
  onDeleteRelation,
  onOpenBusinessChat,
  onOpenScanDiagram,
}) {
  const [activeTab, setActiveTab] = useState('classes'); // 'classes' | 'relations'

  // ── Form states: Clases ──
  const [className, setClassName] = useState('');
  const [attrs, setAttrs] = useState([{ name: 'id', type: 'Long' }]);

  // ── Form states: Relaciones ──
  const [relType, setRelType] = useState('association');
  const [relFrom, setRelFrom] = useState('');
  const [relTo, setRelTo] = useState('');
  const [relMult, setRelMult] = useState('1..*');
  const [intermediateTable, setIntermediateTable] = useState('');
  const [pickerModal, setPickerModal] = useState(null); // null | { title, field, options }

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // Animate drawer in/out when visibility changes
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  // Sync initial class pickers if available
  useEffect(() => {
    if (classes.length >= 2) {
      if (!relFrom || !classes.some(c => String(c.id) === String(relFrom))) {
        setRelFrom(classes[0].id);
      }
      if (!relTo || !classes.some(c => String(c.id) === String(relTo)) || String(relTo) === String(classes[0]?.id)) {
        const nextTo = classes.find(c => String(c.id) !== String(classes[0]?.id));
        if (nextTo) setRelTo(nextTo.id);
      }
    }
  }, [classes, relFrom, relTo]);

  // Suggested bridge table name for *..*
  const getSuggestedBridgeName = useCallback((fromId, toId) => {
    const fromCls = classes.find(c => String(c.id) === String(fromId));
    const toCls = classes.find(c => String(c.id) === String(toId));
    if (!fromCls || !toCls) return '';
    return `${fromCls.name}_${toCls.name}`;
  }, [classes]);

  // ── Attribute helpers ────────────────────────────────────────────
  const addAttr = useCallback(() => {
    setAttrs(prev => [...prev, { name: `campo${prev.length + 1}`, type: 'String' }]);
  }, []);

  const removeAttr = useCallback((idx) => {
    setAttrs(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateAttr = useCallback((idx, field, value) => {
    setAttrs(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  // ── Submit Class ─────────────────────────────────────────────────
  const handleSubmitClass = useCallback(() => {
    const trimmed = className.trim();
    if (!trimmed) return;

    onAddClass?.({
      name: trimmed,
      attrs: attrs.filter(a => a.name.trim()),
    });

    // Reset form
    setClassName('');
    setAttrs([{ name: 'id', type: 'Long' }]);
    onClose?.();
  }, [className, attrs, onAddClass, onClose]);

  // ── Submit Relation ──────────────────────────────────────────────
  const handleSubmitRelation = useCallback(() => {
    if (!relFrom || !relTo || String(relFrom) === String(relTo)) return;

    const isContainer = relType === 'aggregation' || relType === 'composition';
    const effectiveMult = relType === 'inheritance' ? '1..1' : (isContainer ? '1..*' : relMult);

    const suggested = getSuggestedBridgeName(relFrom, relTo);
    const finalTable = (effectiveMult === '*..*' && relType !== 'inheritance')
      ? (intermediateTable.trim() || suggested || 'Tabla_Intermedia')
      : '';

    onAddRelation?.({
      fromId: relFrom,
      toId: relTo,
      relationType: relType,
      mult: effectiveMult,
      intermediateTableName: finalTable,
    });

    // Reset intermediate table name
    setIntermediateTable('');
  }, [relFrom, relTo, relType, relMult, intermediateTable, getSuggestedBridgeName, onAddRelation]);

  const fromClassName = classes.find(c => String(c.id) === String(relFrom))?.name || 'Seleccionar...';
  const toClassName = classes.find(c => String(c.id) === String(relTo))?.name || 'Seleccionar...';
  const activeRelTypeObj = RELATION_TYPES.find(r => r.id === relType) || RELATION_TYPES[0];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Dimmed overlay — tap to close */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          activeOpacity={1}
          accessibilityLabel="Cerrar panel lateral"
        />

        {/* Sliding drawer panel */}
        <Animated.View
          style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
          accessibilityViewIsModal
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            {/* ── Drawer header ── */}
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerTitle}>Modelado UML</Text>
                <Text style={styles.drawerSubtitle}>Gestión de Clases y Relaciones</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityLabel="Cerrar panel"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            {/* ── SECCIÓN INTERACTIVA: IA LOCAL (OLLAMA) ── */}
            <View style={styles.aiSection}>
              <View style={styles.aiSectionHeader}>
                <Text style={styles.aiSectionTitle}>✨ IA FUERA DEL LIENZO (OLLAMA)</Text>
                <View style={styles.aiLocalBadge}>
                  <Text style={styles.aiLocalBadgeText}>LOCAL</Text>
                </View>
              </View>

              <View style={styles.aiButtonsRow}>
                {/* a) Chatbot de IA Empresarial (Voz y Texto) */}
                <TouchableOpacity
                  style={styles.aiCardBtn}
                  onPress={() => {
                    onClose?.();
                    onOpenBusinessChat?.();
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Abrir Chatbot de IA Empresarial"
                >
                  <View style={styles.aiCardTop}>
                    <Text style={styles.aiCardIcon}>🤖</Text>
                    <View style={styles.aiModelBadge}>
                      <Text style={styles.aiModelBadgeText}>gemma2:2b</Text>
                    </View>
                  </View>
                  <Text style={styles.aiCardTitle}>Chat Empresarial</Text>
                  <Text style={styles.aiCardDesc}>Voz & Texto · Lógica ERP</Text>
                </TouchableOpacity>

                {/* b) Escanear Diagrama */}
                <TouchableOpacity
                  style={[styles.aiCardBtn, styles.aiCardBtnVision]}
                  onPress={() => {
                    onClose?.();
                    onOpenScanDiagram?.();
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Abrir Escáner de Diagrama UML"
                >
                  <View style={styles.aiCardTop}>
                    <Text style={styles.aiCardIcon}>📷</Text>
                    <View style={[styles.aiModelBadge, styles.aiModelBadgeVision]}>
                      <Text style={[styles.aiModelBadgeText, styles.aiModelBadgeTextVision]}>moondream</Text>
                    </View>
                  </View>
                  <Text style={styles.aiCardTitle}>Escanear UML</Text>
                  <Text style={styles.aiCardDesc}>Cámara/Galería · Visión</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Tabs bar ── */}
            <View style={styles.tabsContainer}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'classes' && styles.tabBtnActive]}
                onPress={() => setActiveTab('classes')}
              >
                <Text style={[styles.tabBtnText, activeTab === 'classes' && styles.tabBtnTextActive]}>
                  Clases ({classes.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'relations' && styles.tabBtnActive]}
                onPress={() => setActiveTab('relations')}
              >
                <Text style={[styles.tabBtnText, activeTab === 'relations' && styles.tabBtnTextActive]}>
                  Relaciones ({relations.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Tab Content: CLASES ── */}
            {activeTab === 'classes' && (
              <>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.formContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.sectionHeaderTitle}>NUEVA CLASE</Text>

                  {/* Class name field */}
                  <Text style={styles.fieldLabel}>NOMBRE DE LA CLASE</Text>
                  <TextInput
                    style={styles.textInput}
                    value={className}
                    onChangeText={setClassName}
                    placeholder="Ej: Usuario, Producto..."
                    placeholderTextColor="#475569"
                    autoCapitalize="words"
                    returnKeyType="next"
                    accessibilityLabel="Nombre de la clase"
                  />

                  {/* Attributes section */}
                  <View style={styles.attrSectionHeader}>
                    <Text style={styles.fieldLabel}>ATRIBUTOS</Text>
                    <Text style={styles.fieldHint}>nombre: Tipo</Text>
                  </View>

                  {attrs.map((attr, idx) => (
                    <View key={idx} style={styles.attrRow}>
                      <TextInput
                        style={[styles.attrInput, { flex: 1.4 }]}
                        value={attr.name}
                        onChangeText={v => updateAttr(idx, 'name', v)}
                        placeholder="nombre"
                        placeholderTextColor="#475569"
                        returnKeyType="next"
                        accessibilityLabel={`Nombre del atributo ${idx + 1}`}
                      />
                      <Text style={styles.attrColon}>:</Text>
                      <TextInput
                        style={[styles.attrInput, { flex: 1 }]}
                        value={attr.type}
                        onChangeText={v => updateAttr(idx, 'type', v)}
                        placeholder="String"
                        placeholderTextColor="#475569"
                        returnKeyType="done"
                        accessibilityLabel={`Tipo del atributo ${idx + 1}`}
                      />
                      <TouchableOpacity
                        onPress={() => removeAttr(idx)}
                        style={styles.removeAttrBtn}
                        accessibilityLabel={`Eliminar atributo ${attr.name}`}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        disabled={attrs.length === 1}
                      >
                        <Text style={[styles.removeAttrText, attrs.length === 1 && { opacity: 0.3 }]}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    onPress={addAttr}
                    style={styles.addAttrBtn}
                    accessibilityLabel="Añadir atributo"
                  >
                    <Text style={styles.addAttrText}>+ Añadir atributo</Text>
                  </TouchableOpacity>

                  <View style={styles.hintBox}>
                    <Text style={styles.hintText}>
                      💡 Mantén pulsado el nombre o atributo en el canvas para editarlo directamente.
                    </Text>
                  </View>
                </ScrollView>

                <View style={styles.footer}>
                  <TouchableOpacity
                    onPress={handleSubmitClass}
                    style={[styles.submitBtn, !className.trim() && styles.submitBtnDisabled]}
                    disabled={!className.trim()}
                    accessibilityLabel="Agregar clase al diagrama"
                    accessibilityRole="button"
                  >
                    <Text style={styles.submitBtnText}>+ Agregar Clase</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── Tab Content: RELACIONES ── */}
            {activeTab === 'relations' && (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
              >
                {classes.length < 2 ? (
                  <View style={styles.emptyStateBox}>
                    <Text style={styles.emptyStateIcon}>◇ ― ◁</Text>
                    <Text style={styles.emptyStateTitle}>Requiere al menos 2 clases</Text>
                    <Text style={styles.emptyStateText}>
                      Para crear asociaciones, herencias o composiciones necesitas tener dos o más clases en el diagrama.
                    </Text>
                    <TouchableOpacity
                      style={styles.emptyStateBtn}
                      onPress={() => setActiveTab('classes')}
                    >
                      <Text style={styles.emptyStateBtnText}>Ir a crear clases</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={styles.sectionHeaderTitle}>NUEVA RELACIÓN</Text>

                    {/* Selector de Tipo de Relación */}
                    <Text style={styles.fieldLabel}>TIPO DE RELACIÓN UML</Text>
                    <View style={styles.relationTypeGrid}>
                      {RELATION_TYPES.map(rt => {
                        const isSelected = relType === rt.id;
                        return (
                          <TouchableOpacity
                            key={rt.id}
                            style={[styles.relTypeCard, isSelected && styles.relTypeCardSelected]}
                            onPress={() => {
                              setRelType(rt.id);
                              if (rt.id === 'aggregation' || rt.id === 'composition') {
                                setRelMult('1..*');
                              }
                            }}
                          >
                            <Text style={[styles.relTypeSymbol, isSelected && styles.relTypeSymbolSelected]}>
                              {rt.symbol}
                            </Text>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.relTypeLabel, isSelected && styles.relTypeLabelSelected]}>
                                {rt.label}
                              </Text>
                              <Text style={styles.relTypeDesc}>{rt.desc}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Origen */}
                    <Text style={styles.fieldLabel}>
                      {relType === 'inheritance' ? 'CLASE HIJA (SUBCLASE)' : 'CLASE ORIGEN / CONTENEDOR'}
                    </Text>
                    <TouchableOpacity
                      style={styles.pickerSelector}
                      onPress={() => {
                        setPickerModal({
                          title: relType === 'inheritance' ? 'Selecciona Clase Hija' : 'Selecciona Clase Origen',
                          field: 'relFrom',
                          options: classes.map(c => ({ id: c.id, label: c.name })),
                        });
                      }}
                    >
                      <Text style={styles.pickerSelectorText}>{fromClassName}</Text>
                      <Text style={styles.pickerSelectorArrow}>▼</Text>
                    </TouchableOpacity>

                    {/* Destino */}
                    <Text style={styles.fieldLabel}>
                      {relType === 'inheritance' ? 'CLASE PADRE (SUPERCLASE)' : 'CLASE DESTINO'}
                    </Text>
                    <TouchableOpacity
                      style={styles.pickerSelector}
                      onPress={() => {
                        const destOptions = classes
                          .filter(c => String(c.id) !== String(relFrom))
                          .map(c => ({ id: c.id, label: c.name }));
                        setPickerModal({
                          title: relType === 'inheritance' ? 'Selecciona Clase Padre' : 'Selecciona Clase Destino',
                          field: 'relTo',
                          options: destOptions,
                        });
                      }}
                    >
                      <Text style={styles.pickerSelectorText}>{toClassName}</Text>
                      <Text style={styles.pickerSelectorArrow}>▼</Text>
                    </TouchableOpacity>

                    {/* Multiplicidad / Explicación */}
                    {relType === 'inheritance' ? (
                      <View style={styles.inheritanceNote}>
                        <Text style={styles.inheritanceNoteText}>
                          ◁ <Text style={{ fontWeight: '700' }}>Generalización UML:</Text> La subclase hereda atributos y se conecta con flecha triangular vacía hacia la superclase.
                        </Text>
                      </View>
                    ) : (relType === 'aggregation' || relType === 'composition') ? (
                      <View style={styles.lockedMultBox}>
                        <Text style={styles.fieldLabel}>MULTIPLICIDAD</Text>
                        <View style={styles.lockedMultRow}>
                          <Text style={styles.lockedMultValue}>1..* (1 a muchos)</Text>
                          <Text style={styles.lockedMultTag}>Fija por regla UML</Text>
                        </View>
                        <Text style={styles.lockedMultDesc}>
                          {relType === 'composition' ? '◆' : '◇'} En {relType === 'composition' ? 'composición' : 'agregación'} la regla es estrictamente 1 a muchos: el contenedor posee los componentes.
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.fieldLabel}>MULTIPLICIDAD</Text>
                        <TouchableOpacity
                          style={styles.pickerSelector}
                          onPress={() => {
                            setPickerModal({
                              title: 'Selecciona Multiplicidad',
                              field: 'relMult',
                              options: MULTIPLICITIES,
                            });
                          }}
                        >
                          <Text style={styles.pickerSelectorText}>
                            {MULTIPLICITIES.find(m => m.id === relMult)?.label || relMult}
                          </Text>
                          <Text style={styles.pickerSelectorArrow}>▼</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {/* Tabla intermedia en caso N:M (*..*) */}
                    {relMult === '*..*' && relType !== 'inheritance' && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.fieldLabel}>TABLA INTERMEDIA (N:M)</Text>
                        <TextInput
                          style={styles.textInput}
                          value={intermediateTable}
                          onChangeText={setIntermediateTable}
                          placeholder={getSuggestedBridgeName(relFrom, relTo) || 'Origen_Destino'}
                          placeholderTextColor="#475569"
                          autoCapitalize="words"
                        />
                        <Text style={styles.bridgeNote}>
                          Generará tabla puente con clave primaria compuesta y dos claves foráneas.
                        </Text>
                      </View>
                    )}

                    {/* Botón de crear relación */}
                    <TouchableOpacity
                      onPress={handleSubmitRelation}
                      style={[
                        styles.submitRelBtn,
                        (!relFrom || !relTo || String(relFrom) === String(relTo)) && styles.submitBtnDisabled,
                      ]}
                      disabled={!relFrom || !relTo || String(relFrom) === String(relTo)}
                    >
                      <Text style={styles.submitRelBtnText}>
                        + Conectar {fromClassName} {activeRelTypeObj.symbol} {toClassName}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── Lista de relaciones existentes ── */}
                <View style={styles.existingRelationsSection}>
                  <Text style={styles.sectionHeaderTitle}>
                    RELACIONES EN DIAGRAMA ({relations.length})
                  </Text>

                  {relations.length === 0 ? (
                    <Text style={styles.noRelationsText}>No hay relaciones creadas en este diagrama.</Text>
                  ) : (
                    relations.map((rel, index) => {
                      const fromName = rel.fromName || classes.find(c => String(c.id) === String(rel.fromId))?.name || 'Origen';
                      const toName = rel.toName || classes.find(c => String(c.id) === String(rel.toId))?.name || 'Destino';
                      const rType = rel.relationType || 'association';

                      return (
                        <View key={rel.id || index} style={styles.relationItemCard}>
                          <View style={{ flex: 1 }}>
                            <View style={styles.relationItemHeader}>
                              <Text style={styles.relationItemNames}>
                                {fromName} → {toName}
                              </Text>
                              <View style={[styles.relTypeBadge, styles[`badge_${rType}`]]}>
                                <Text style={styles.relTypeBadgeText}>
                                  {rType === 'composition' && '◆ Composición'}
                                  {rType === 'aggregation' && '◇ Agregación'}
                                  {rType === 'inheritance' && '◁ Herencia'}
                                  {rType === 'association' && '― Asociación'}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.relationItemMeta}>
                              {rType !== 'inheritance' && (
                                <Text style={styles.relationItemMult}>Mult: {rel.mult || '1..*'}</Text>
                              )}
                              {rel.intermediateTableName ? (
                                <Text style={styles.relationItemBridge}>[{rel.intermediateTableName}]</Text>
                              ) : null}
                            </View>
                          </View>

                          <TouchableOpacity
                            onPress={() => onDeleteRelation?.(rel.id)}
                            style={styles.deleteRelBtn}
                            accessibilityLabel={`Eliminar relación ${fromName} a ${toName}`}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.deleteRelBtnIcon}>🗑</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                </View>
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </Animated.View>
      </View>

      {/* ── Modal Picker genérico para selección táctil ── */}
      {pickerModal && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setPickerModal(null)}
        >
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setPickerModal(null)}
          >
            <View style={styles.pickerContent} onStartShouldSetResponder={() => true}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>{pickerModal.title}</Text>
                <TouchableOpacity onPress={() => setPickerModal(null)}>
                  <Text style={styles.pickerCloseBtn}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 300 }}>
                {pickerModal.options.map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    style={styles.pickerOption}
                    onPress={() => {
                      if (pickerModal.field === 'relFrom') {
                        setRelFrom(opt.id);
                        if (String(opt.id) === String(relTo)) {
                          const nextTo = classes.find(c => String(c.id) !== String(opt.id));
                          if (nextTo) setRelTo(nextTo.id);
                        }
                      } else if (pickerModal.field === 'relTo') {
                        setRelTo(opt.id);
                      } else if (pickerModal.field === 'relMult') {
                        setRelMult(opt.id);
                      }
                      setPickerModal(null);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#0f172a',
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  drawerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  drawerSubtitle: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#334155',
  },
  closeBtnText: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
  // ── Tabs ──
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
  },
  tabBtnText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  // ── Form Content ──
  formContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 8,
  },
  sectionHeaderTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  fieldLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 6,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#f8fafc',
    fontSize: 13,
  },
  // ── Attributes ──
  attrSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
  fieldHint: {
    color: '#475569',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  attrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  attrInput: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    color: '#f8fafc',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  attrColon: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  removeAttrBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeAttrText: {
    color: '#64748b',
    fontSize: 18,
    lineHeight: 20,
  },
  addAttrBtn: {
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  addAttrText: {
    color: '#475569',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  hintBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderRadius: 6,
    padding: 10,
    marginTop: 4,
  },
  hintText: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 15,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  submitBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // ── Relations Tab Elements ──
  emptyStateBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyStateIcon: {
    fontSize: 24,
    color: '#38bdf8',
    marginBottom: 10,
  },
  emptyStateTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyStateText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyStateBtn: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  emptyStateBtnText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  relationTypeGrid: {
    gap: 6,
    marginBottom: 6,
  },
  relTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  relTypeCardSelected: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  relTypeSymbol: {
    fontSize: 16,
    color: '#94a3b8',
    width: 24,
    textAlign: 'center',
  },
  relTypeSymbolSelected: {
    color: '#38bdf8',
    fontWeight: 'bold',
  },
  relTypeLabel: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  relTypeLabelSelected: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  relTypeDesc: {
    color: '#64748b',
    fontSize: 10,
  },
  pickerSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerSelectorText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '500',
  },
  pickerSelectorArrow: {
    color: '#64748b',
    fontSize: 10,
  },
  inheritanceNote: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 4,
  },
  inheritanceNoteText: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
  },
  lockedMultBox: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 4,
  },
  lockedMultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  lockedMultValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  lockedMultTag: {
    color: '#38bdf8',
    fontSize: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lockedMultDesc: {
    color: '#64748b',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  bridgeNote: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 3,
  },
  submitRelBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  submitRelBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // ── Existing Relations Section ──
  existingRelationsSection: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 16,
  },
  noRelationsText: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  relationItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  relationItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  relationItemNames: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  relTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#334155',
  },
  badge_association: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  badge_aggregation: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
  },
  badge_composition: {
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
  },
  badge_inheritance: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  relTypeBadgeText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '600',
  },
  relationItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  relationItemMult: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  relationItemBridge: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  deleteRelBtn: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteRelBtnIcon: {
    color: '#ef4444',
    fontSize: 14,
  },
  // ── Picker Modal ──
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  pickerTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  pickerCloseBtn: {
    color: '#94a3b8',
    fontSize: 20,
    fontWeight: '700',
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  pickerOptionText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '500',
  },
  // ── Sección Interactiva de IA Local ──
  aiSection: {
    backgroundColor: '#090e1a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aiSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  aiSectionTitle: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  aiLocalBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  aiLocalBadgeText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '800',
  },
  aiButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  aiCardBtn: {
    flex: 1,
    backgroundColor: '#131d31',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
  },
  aiCardBtnVision: {
    borderColor: '#3b2063',
    backgroundColor: '#16132b',
  },
  aiCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  aiCardIcon: {
    fontSize: 18,
  },
  aiModelBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aiModelBadgeVision: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
  },
  aiModelBadgeText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '700',
  },
  aiModelBadgeTextVision: {
    color: '#c084fc',
  },
  aiCardTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  aiCardDesc: {
    color: '#64748b',
    fontSize: 10,
    lineHeight: 13,
  },
});
