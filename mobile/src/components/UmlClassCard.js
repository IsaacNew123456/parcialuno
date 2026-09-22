import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  PanResponder,
  Animated,
  StyleSheet,
} from 'react-native';

const CARD_WIDTH = 180;

/**
 * Tarjeta UML rectangular con arrastre táctil.
 * Props:
 *   cls       — { id, name, attrs: [{ name, type }], x, y }
 *   onMove    — (id, x, y) => void  — posición final tras soltar
 *   onDelete  — (id) => void
 *   onUpdate  — (id, patch) => void — patch: { name } | { attrs }
 */
export default function UmlClassCard({ cls, onMove, onDelete, onUpdate }) {
  // Animated position seeded from the class position in state
  const pan = useRef(new Animated.ValueXY({ x: cls.x, y: cls.y })).current;
  const lastPos = useRef({ x: cls.x, y: cls.y });

  // Sync position if parent state changes (e.g. after add)
  React.useEffect(() => {
    pan.setValue({ x: cls.x, y: cls.y });
    lastPos.current = { x: cls.x, y: cls.y };
  }, [cls.id]); // Only on mount / id change, not on every drag update

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(cls.name);
  const [editingAttrIdx, setEditingAttrIdx] = useState(null);
  const [attrInputs, setAttrInputs] = useState(cls.attrs || []);

  // Keep local attr inputs in sync when parent updates the class
  React.useEffect(() => {
    setNameInput(cls.name);
    setAttrInputs(cls.attrs || []);
  }, [cls.name, cls.attrs]);

  // ── PanResponder ────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Capture current animated value so delta is relative to it
        pan.setOffset({ x: lastPos.current.x, y: lastPos.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gesture) => {
        const newX = lastPos.current.x + gesture.dx;
        const newY = lastPos.current.y + gesture.dy;
        pan.flattenOffset();
        lastPos.current = { x: newX, y: newY };
        onMove?.(cls.id, newX, newY);
      },
    })
  ).current;

  // ── Name editing ─────────────────────────────────────────────────
  const finishEditName = useCallback(() => {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== cls.name) {
      onUpdate?.(cls.id, { name: trimmed });
    }
  }, [nameInput, cls.id, cls.name, onUpdate]);

  // ── Attribute editing ─────────────────────────────────────────────
  const handleAttrChange = useCallback((idx, field, value) => {
    setAttrInputs(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  const finishEditAttr = useCallback((idx) => {
    setEditingAttrIdx(null);
    onUpdate?.(cls.id, { attrs: attrInputs });
  }, [cls.id, attrInputs, onUpdate]);

  const handleAddAttr = useCallback(() => {
    const next = [...attrInputs, { name: `campo${attrInputs.length + 1}`, type: 'String' }];
    setAttrInputs(next);
    onUpdate?.(cls.id, { attrs: next });
    setEditingAttrIdx(next.length - 1);
  }, [attrInputs, cls.id, onUpdate]);

  const handleRemoveAttr = useCallback((idx) => {
    const next = attrInputs.filter((_, i) => i !== idx);
    setAttrInputs(next);
    onUpdate?.(cls.id, { attrs: next });
  }, [attrInputs, cls.id, onUpdate]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={[styles.card, { left: pan.x, top: pan.y }]}
      {...panResponder.panHandlers}
      accessibilityRole="none"
      accessibilityLabel={`Clase UML ${cls.name}`}
    >
      {/* ── Cabecera ── */}
      <View style={styles.header}>
        <Text style={styles.badge}>«entity»</Text>

        {editingName ? (
          <TextInput
            style={styles.nameInput}
            value={nameInput}
            onChangeText={setNameInput}
            onBlur={finishEditName}
            onSubmitEditing={finishEditName}
            autoFocus
            selectTextOnFocus
            accessibilityLabel="Editar nombre de clase"
          />
        ) : (
          <TouchableOpacity onLongPress={() => setEditingName(true)} activeOpacity={0.7}>
            <Text style={styles.className} numberOfLines={1}>{cls.name}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => onDelete?.(cls.id)}
          style={styles.deleteBtn}
          accessibilityLabel={`Eliminar clase ${cls.name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.deleteBtnText}>×</Text>
        </TouchableOpacity>
      </View>

      {/* ── Divisor ── */}
      <View style={styles.divider} />

      {/* ── Cuerpo: atributos ── */}
      <View style={styles.body}>
        {attrInputs.length === 0 && (
          <Text style={styles.emptyAttrs}>Sin atributos</Text>
        )}

        {attrInputs.map((attr, idx) =>
          editingAttrIdx === idx ? (
            <View key={idx} style={styles.attrEditRow}>
              <TextInput
                style={[styles.attrInput, { flex: 1.4 }]}
                value={attr.name}
                onChangeText={v => handleAttrChange(idx, 'name', v)}
                onBlur={() => finishEditAttr(idx)}
                onSubmitEditing={() => finishEditAttr(idx)}
                autoFocus
                placeholder="nombre"
                placeholderTextColor="#475569"
                accessibilityLabel="Nombre de atributo"
              />
              <Text style={styles.attrColon}>:</Text>
              <TextInput
                style={[styles.attrInput, { flex: 1 }]}
                value={attr.type}
                onChangeText={v => handleAttrChange(idx, 'type', v)}
                onBlur={() => finishEditAttr(idx)}
                onSubmitEditing={() => finishEditAttr(idx)}
                placeholder="Tipo"
                placeholderTextColor="#475569"
                accessibilityLabel="Tipo de atributo"
              />
            </View>
          ) : (
            <View key={idx} style={styles.attrRow}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onLongPress={() => setEditingAttrIdx(idx)}
                accessibilityLabel={`Atributo ${attr.name}: ${attr.type}`}
              >
                <Text style={styles.attrText} numberOfLines={1}>
                  <Text style={styles.attrPlus}>+ </Text>
                  <Text style={styles.attrName}>{attr.name}</Text>
                  <Text style={styles.attrTypePunct}>: </Text>
                  <Text style={styles.attrType}>{attr.type}</Text>
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemoveAttr(idx)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel={`Eliminar atributo ${attr.name}`}
              >
                <Text style={styles.removeAttrText}>×</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Botón añadir atributo */}
        <TouchableOpacity onPress={handleAddAttr} style={styles.addAttrBtn} accessibilityLabel="Añadir atributo">
          <Text style={styles.addAttrText}>+ Atributo</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  // ── Header ──────────────────────────────
  header: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  badge: {
    color: '#64748b',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  className: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  nameInput: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#38bdf8',
    paddingVertical: 2,
    minWidth: 100,
  },
  deleteBtn: {
    position: 'absolute',
    top: 6,
    right: 8,
  },
  deleteBtnText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 18,
  },
  // ── Divider ─────────────────────────────
  divider: {
    height: 1,
    backgroundColor: '#334155',
  },
  // ── Body ────────────────────────────────
  body: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  emptyAttrs: {
    color: '#475569',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 4,
  },
  // Attribute row (read mode)
  attrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
  },
  attrText: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  attrPlus: {
    color: '#64748b',
  },
  attrName: {
    color: '#e2e8f0',
  },
  attrTypePunct: {
    color: '#64748b',
  },
  attrType: {
    color: '#38bdf8',
  },
  removeAttrText: {
    color: '#475569',
    fontSize: 14,
    paddingHorizontal: 4,
  },
  // Attribute row (edit mode)
  attrEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  attrInput: {
    color: '#f8fafc',
    fontSize: 11,
    fontFamily: 'monospace',
    borderBottomWidth: 1,
    borderBottomColor: '#38bdf8',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  attrColon: {
    color: '#64748b',
    fontSize: 11,
  },
  // Add attribute button
  addAttrBtn: {
    marginTop: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    borderRadius: 3,
    alignItems: 'center',
  },
  addAttrText: {
    color: '#475569',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
