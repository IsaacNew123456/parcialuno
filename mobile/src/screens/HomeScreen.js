/**
 * HomeScreen — pantalla principal del modelador UML móvil.
 *
 * Flujo:
 *   1. Al montar, carga la lista de diagramas del backend (REST).
 *   2. El usuario selecciona un diagrama (o crea uno nuevo) en DiagramPicker.
 *   3. Conecta al broker STOMP y recibe el snapshot inicial del diagrama.
 *   4. Las mutaciones locales se aplican de manera optimista y se publican vía STOMP.
 *   5. Las mutaciones de otros colaboradores se aplican cuando llegan por /topic/diagrams/{id}.
 *   6. La barra de control inferior permite dictar comandos a la IA y descargar el ZIP.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Sharing from 'expo-sharing';

import UmlClassCard from '../components/UmlClassCard';
import RelationsLayer from '../components/RelationsLayer';
import ClassDrawer from '../components/ClassDrawer';
import BusinessChatModal from '../components/BusinessChatModal';
import ScanDiagramModal from '../components/ScanDiagramModal';
import wsClient from '../services/wsClient';
import {
  fetchDiagrams,
  createDiagram,
  sendAiCommand,
  downloadZip,
  createRoomApi,
  joinRoomApi,
  fetchRoomByCode,
} from '../services/diagramApi';
import { API_BASE_URL } from '../config/api';
import { generateIntermediateClassName, isManyToMany } from '../utils/namingUtils';

// ── Canvas dimensions ──────────────────────────────────────────────
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 2000;

// Simple incrementing local ID for offline / before server assigns one
let _localId = 1;
function nextLocalId() { return `local_${_localId++}`; }

// ── Component ──────────────────────────────────────────────────────
export default function HomeScreen({ onLogout }) {
  // ── Logout handler (fachada directa al Login) ──────────────────
  const handleLogout = useCallback(() => {
    Alert.alert(
      'Cerrar sesión',
      '¿Deseas salir y volver a la pantalla de inicio de sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: () => onLogout?.() },
      ]
    );
  }, [onLogout]);

  // ── Room & Diagram selection ───────────────────────────────────
  const [activeRoom, setActiveRoom] = useState({ id: 1, code: '1234', name: 'Sala Principal', diagramId: 1 });
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomLoading, setRoomLoading] = useState(false);

  const [diagrams, setDiagrams] = useState([]);      // list from REST
  const [activeDiagramId, setActiveDiagramId] = useState(null);
  const [loadingDiagrams, setLoadingDiagrams] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Canvas state ───────────────────────────────────────────────
  const [classes, setClasses] = useState([]);
  const [relations, setRelations] = useState([]);
  const [connected, setConnected] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [businessChatOpen, setBusinessChatOpen] = useState(false);
  const [scanDiagramOpen, setScanDiagramOpen] = useState(false);

  // ── AI command bar state ───────────────────────────────────────
  const [commandText, setCommandText] = useState('');
  const [aiLoading, setAiLoading]     = useState(false);
  /** @type {[string|null, Function]} */
  const [netError, setNetError]       = useState(null);

  // ── Remote mutation reducer (definido antes de activateDiagram) ──
  const applyRemoteMutation = useCallback((eventType, payload) => {
    if (!payload) return;
    switch (eventType) {
      case 'CLASS_CREATED':
        setClasses(prev => {
          if (prev.some(c => String(c.id) === String(payload.id))) return prev;
          return [...prev, {
            id: String(payload.id),
            name: payload.name,
            attrs: payload.attrs || [],
            x: payload.x ?? 40,
            y: payload.y ?? 80,
          }];
        });
        break;
      case 'CLASS_MOVED':
        setClasses(prev => prev.map(c =>
          String(c.id) === String(payload.id) ? { ...c, x: payload.x, y: payload.y } : c
        ));
        break;
      case 'CLASS_UPDATED':
        setClasses(prev => prev.map(c => {
          if (String(c.id) !== String(payload.id)) return c;
          return {
            ...c,
            ...(payload.name && { name: payload.name }),
            ...(payload.attrs && { attrs: payload.attrs }),
          };
        }));
        break;
      case 'CLASS_DELETED':
        setClasses(prev => prev.filter(c => String(c.id) !== String(payload.id)));
        break;
      case 'RELATION_CREATED':
        setRelations(prev => {
          if (prev.some(r => String(r.id) === String(payload.id))) return prev;
          return [...prev, {
            id: String(payload.id),
            fromId: String(payload.fromClassId ?? payload.fromId),
            toId: String(payload.toClassId ?? payload.toId),
            label: payload.relationType ?? payload.label ?? '',
          }];
        });
        break;
      case 'RELATION_DELETED':
        setRelations(prev => prev.filter(r => String(r.id) !== String(payload.id)));
        break;
      default:
        break;
    }
  }, []);

  // ── STOMP connection & Room Activation ─────────────────────────
  const activateDiagram = useCallback((id, name, initialModel = null) => {
    setActiveDiagramId(id);

    if (initialModel && initialModel.classes) {
      setClasses(initialModel.classes.map(c => ({
        id: String(c.id),
        name: c.name,
        attrs: (c.attrs || []).map(a => ({ name: a.name, type: a.type })),
        x: c.x ?? 40,
        y: c.y ?? 80,
      })));
    } else {
      setClasses([]);
    }

    if (initialModel && initialModel.relations) {
      setRelations(initialModel.relations.map(r => ({
        id: String(r.id),
        fromId: String(r.fromClassId ?? r.fromId),
        toId: String(r.toClassId ?? r.toId),
        label: r.relationType ?? r.label ?? '',
      })));
    } else {
      setRelations([]);
    }

    wsClient.setCallbacks({
      onSnapshot: (model) => {
        // Hydrate canvas from the server snapshot
        if (model.classes) {
          setClasses(model.classes.map(c => ({
            id: String(c.id),
            name: c.name,
            attrs: (c.attrs || []).map(a => ({ name: a.name, type: a.type })),
            x: c.x ?? 40,
            y: c.y ?? 80,
          })));
        }
        if (model.relations) {
          setRelations(model.relations.map(r => ({
            id: String(r.id),
            fromId: String(r.fromClassId ?? r.fromId),
            toId: String(r.toClassId ?? r.toId),
            label: r.relationType ?? r.label ?? '',
          })));
        }
      },

      onMutation: ({ eventType, payload }) => {
        applyRemoteMutation(eventType, payload);
      },

      onStatusChange: (isConnected) => setConnected(isConnected),
    });

    wsClient.connect(id);
  }, [applyRemoteMutation]);

  // ── Auto-join default room 1234 on mount ────────────────────────
  useEffect(() => {
    joinRoomApi('1234')
      .then(room => {
        setActiveRoom({
          id: room.id,
          code: room.code,
          name: room.name,
          diagramId: room.diagramId || room.id,
        });
        const targetId = room.diagramId || room.id;
        activateDiagram(targetId, room.name, room.diagram);
      })
      .catch(() => {
        // Fallback en caso de que backend no tenga salas aún o esté offline
        fetchDiagrams()
          .then(list => {
            setDiagrams(list);
            if (list.length > 0) {
              activateDiagram(list[0].id, list[0].name);
            }
          })
          .catch(() => {
            console.warn('[HomeScreen] Backend unreachable, running in offline mode');
          });
      })
      .finally(() => setLoadingDiagrams(false));
  }, [activateDiagram]);

  // ── Room Action Handlers ───────────────────────────────────────
  const handleCreateRoom = useCallback(async () => {
    setRoomLoading(true);
    try {
      const room = await createRoomApi(`Sala Móvil ${Date.now().toString(36).toUpperCase()}`);
      setActiveRoom({
        id: room.id,
        code: room.code,
        name: room.name,
        diagramId: room.diagramId || room.id,
      });
      activateDiagram(room.diagramId || room.id, room.name, room.diagram);
      Alert.alert(
        '¡Sala Creada Exitosamente!',
        `Código único: ${room.code}\n\nComparte este código para colaborar en tiempo real desde Web o Mobile.`
      );
    } catch (err) {
      Alert.alert('Error al crear sala', err.message || 'Verifica la conexión con el backend.');
    } finally {
      setRoomLoading(false);
    }
  }, [activateDiagram]);

  const handleJoinDefaultRoom = useCallback(async () => {
    setRoomLoading(true);
    try {
      const room = await joinRoomApi('1234');
      setActiveRoom({
        id: room.id,
        code: room.code,
        name: room.name,
        diagramId: room.diagramId || room.id,
      });
      activateDiagram(room.diagramId || room.id, room.name, room.diagram);
      Alert.alert('Conexión Exitosa', 'Te has unido a la sala por defecto 1234.');
    } catch (err) {
      Alert.alert('Error al unirse', err.message || 'No se pudo conectar a la sala 1234.');
    } finally {
      setRoomLoading(false);
    }
  }, [activateDiagram]);

  const handleJoinByCode = useCallback(async () => {
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) {
      Alert.alert('Código requerido', 'Por favor escribe un código de sala.');
      return;
    }
    setRoomLoading(true);
    try {
      const room = await joinRoomApi(code);
      setActiveRoom({
        id: room.id,
        code: room.code,
        name: room.name,
        diagramId: room.diagramId || room.id,
      });
      activateDiagram(room.diagramId || room.id, room.name, room.diagram);
      setRoomCodeInput('');
      Alert.alert('Conexión Exitosa', `Te has unido a la sala ${room.code} ("${room.name}").`);
    } catch (err) {
      Alert.alert('No se pudo unir', err.message || `No existe la sala con código: ${code}`);
    } finally {
      setRoomLoading(false);
    }
  }, [roomCodeInput, activateDiagram]);

  // Disconnect on unmount
  useEffect(() => () => wsClient.disconnect(), []);

  // ── Local (optimistic) mutation handlers ───────────────────────
  const handleAddClass = useCallback((newCls) => {
    const id = nextLocalId();
    const x = 40 + ((classes.length % 4) * 220);
    const y = 80 + (Math.floor(classes.length / 4) * 280);
    const cls = { id, name: newCls.name, attrs: newCls.attrs, x, y, roomId: activeRoom?.id };

    setClasses(prev => [...prev, cls]);
    wsClient.publishClassCreated(cls);
  }, [classes.length, activeRoom?.id]);

  const handleDeleteClass = useCallback((id) => {
    setClasses(prev => prev.filter(c => c.id !== id));
    setRelations(prev => prev.filter(r => String(r.fromId) !== String(id) && String(r.toId) !== String(id)));
    wsClient.publishClassDeleted(id);
  }, []);

  const handleMoveClass = useCallback((id, x, y) => {
    setClasses(prev => prev.map(c => c.id === id ? { ...c, x, y } : c));
    wsClient.publishClassMoved(id, x, y);
  }, []);

  const handleUpdateClass = useCallback((id, patch) => {
    setClasses(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    wsClient.publishClassUpdated(id, patch);
  }, []);

  const handleAddRelation = useCallback((relData) => {
    const id = `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fromClass = classes.find(c => String(c.id) === String(relData.fromId));
    const toClass = classes.find(c => String(c.id) === String(relData.toId));
    if (!fromClass || !toClass) return;

    const relType = relData.relationType || 'association';
    const mult = relData.mult || '1..*';
    const isInheritance = relType === 'inheritance';
    const isContainer = relType === 'composition' || relType === 'aggregation';

    let srcMult = isInheritance ? '' : (isContainer ? '1' : (relData.sourceMultiplicity || (mult.includes('..') ? mult.split('..')[0] : '0..*')));
    let tgtMult = isInheritance ? '' : (isContainer ? '*' : (relData.targetMultiplicity || (mult.includes('..') ? mult.split('..')[1] : '1..*')));

    const isNM = !isInheritance && !isContainer && isManyToMany(srcMult, tgtMult, mult);

    let resolvedInterName = '';
    let resolvedInterClassId = relData.intermediateClassId;

    if (isNM) {
      resolvedInterName = (relData.intermediateTableName || '').trim() || generateIntermediateClassName(fromClass.name, toClass.name);

      let interClass = resolvedInterClassId ? classes.find(c => String(c.id) === String(resolvedInterClassId)) : null;
      if (!interClass) {
        interClass = classes.find(c => c.name?.toLowerCase() === resolvedInterName.toLowerCase());
      }

      if (!interClass) {
        const interId = `cls_inter_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
        const midX = Math.round(((fromClass.x || 0) + (toClass.x || 0)) / 2);
        const midY = Math.round(((fromClass.y || 0) + (toClass.y || 0)) / 2 + 100);

        interClass = {
          id: interId,
          name: resolvedInterName,
          attrs: [{ name: 'id', type: 'Long' }],
          x: midX,
          y: midY,
          version: 0,
          isIntermediate: true,
        };

        setClasses(prev => [...prev, interClass]);
        wsClient.publishClassCreated(interClass);
      }

      resolvedInterClassId = interClass.id;
      resolvedInterName = interClass.name;
    }

    const newRelation = {
      id,
      fromId: relData.fromId,
      toId: relData.toId,
      sourceId: relData.fromId,
      targetId: relData.toId,
      fromName: fromClass.name,
      toName: toClass.name,
      relationType: relType,
      mult: `${srcMult}..${tgtMult}`,
      sourceMultiplicity: srcMult,
      targetMultiplicity: tgtMult,
      intermediateClassId: resolvedInterClassId || undefined,
      intermediateClassName: resolvedInterName || undefined,
      intermediateTableName: resolvedInterName || '',
      label: isInheritance ? 'Herencia' : `${srcMult}..${tgtMult}`,
      version: 0,
      roomId: activeRoom?.id,
    };

    setRelations(prev => {
      const exists = prev.some(r =>
        String(r.fromId) === String(newRelation.fromId) &&
        String(r.toId) === String(newRelation.toId) &&
        r.relationType === newRelation.relationType
      );
      if (exists) return prev;
      return [...prev, newRelation];
    });

    wsClient.publishRelationCreated(newRelation);
  }, [classes, activeRoom?.id]);

  const handleDeleteRelation = useCallback((id) => {
    setRelations(prev => prev.filter(r => String(r.id) !== String(id)));
    wsClient.publishRelationDeleted(id);
  }, []);

  const handleClearCanvas = useCallback(() => {
    Alert.alert(
      'Limpiar canvas',
      '¿Eliminar todas las clases y relaciones del canvas local?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpiar', style: 'destructive', onPress: () => {
          setClasses([]);
          setRelations([]);
        }},
      ]
    );
  }, []);

  // ── AI command handler ─────────────────────────────────────────
  /**
   * Envía el texto del campo de comando a la IA del backend.
   * Aplica parsing defensivo sobre la respuesta y posiciona las
   * clases resultantes en una grilla ordenada.
   *
   * Manejo de errores (debugging-and-error-recovery):
   *   - TypeError (fetch failure) → backend apagado o IP incorrecta
   *   - Error HTTP (4xx/5xx)     → fallo en el servidor
   *   - Error de parsing         → respuesta inesperada de la IA
   */
  const handleAiCommand = useCallback(async () => {
    const cmd = commandText.trim();
    if (!cmd) return;

    setAiLoading(true);
    setNetError(null);

    try {
      const schema = await sendAiCommand(cmd);

      // Posicionar clases en grilla: 4 columnas, 240px horizontal, 300px vertical
      const positioned = (schema.classes ?? []).map((cls, index) => ({
        id:    String(cls.id ?? `ai_${index}`),
        name:  cls.name ?? `Clase${index + 1}`,
        attrs: Array.isArray(cls.attrs) ? cls.attrs : [],
        x:     40 + (index % 4) * 240,
        y:     80 + Math.floor(index / 4) * 300,
      }));

      const positionedRelations = (schema.relations ?? []).map(r => ({
        id:     String(r.id ?? `rel_${Math.random().toString(36).slice(2)}`),
        fromId: String(r.fromClassId ?? r.fromId ?? ''),
        toId:   String(r.toClassId   ?? r.toId   ?? ''),
        label:  r.relationType ?? r.label ?? '',
      }));

      // Limpiar canvas anterior y aplicar el schema generado por la IA
      setClasses(positioned);
      setRelations(positionedRelations);
      setCommandText('');
    } catch (err) {
      // Distinguir fallo de red de error HTTP / parsing
      if (err instanceof TypeError) {
        // TypeError: Network request failed → backend no alcanzable
        setNetError(
          `⚠ No se puede conectar con el servidor.\n` +
          `Verifica que el backend esté encendido en:\n${API_BASE_URL}`
        );
      } else {
        setNetError(`⚠ Error: ${err.message}`);
      }
    } finally {
      setAiLoading(false);
    }
  }, [commandText]);

  // ── Aplicar arquitectura o diagrama generado por IA al lienzo ──
  const handleApplyAiSchema = useCallback((newClasses, newRelations = []) => {
    if (!newClasses || !Array.isArray(newClasses) || newClasses.length === 0) return;

    // Posicionar clases en grilla ordenada
    const positioned = newClasses.map((cls, index) => ({
      id:      String(cls.id ?? `cls_ai_${Date.now()}_${index}`),
      name:    cls.name ?? `Clase${index + 1}`,
      attrs:   Array.isArray(cls.attrs) ? cls.attrs : [],
      methods: Array.isArray(cls.methods) ? cls.methods : [],
      x:       cls.x ?? (50 + (index % 3) * 260),
      y:       cls.y ?? (80 + Math.floor(index / 3) * 280),
    }));

    // Mapear relaciones resolviendo IDs si venían con nombres de clases
    const nameToIdMap = new Map();
    positioned.forEach(c => nameToIdMap.set(c.name.toLowerCase(), c.id));

    const positionedRelations = (newRelations || []).map((r, rIdx) => {
      let from = r.fromId || r.sourceId || r.from || r.source;
      let to = r.toId || r.targetId || r.to || r.target;

      if (from && nameToIdMap.has(String(from).toLowerCase())) {
        from = nameToIdMap.get(String(from).toLowerCase());
      }
      if (to && nameToIdMap.has(String(to).toLowerCase())) {
        to = nameToIdMap.get(String(to).toLowerCase());
      }

      return {
        id:     String(r.id ?? `rel_ai_${Date.now()}_${rIdx}`),
        fromId: String(from ?? ''),
        toId:   String(to ?? ''),
        label:  r.relationType ?? r.label ?? 'association',
      };
    }).filter(r => r.fromId && r.toId && r.fromId !== r.toId);

    setClasses(positioned);
    setRelations(positionedRelations);

    // Sincronizar con colaboradores vía STOMP si estamos en una sala activa
    if (connected && wsClient) {
      positioned.forEach(c => {
        try { wsClient.publishClassCreated(c); } catch (e) { /* noop */ }
      });
      positionedRelations.forEach(r => {
        try { wsClient.publishRelationCreated(r); } catch (e) { /* noop */ }
      });
    }

    Alert.alert(
      '¡Lienzo Actualizado!',
      `Se han renderizado ${positioned.length} clases y ${positionedRelations.length} relaciones en el lienzo principal.`
    );
  }, [connected]);

  // ── ZIP download handler ───────────────────────────────────────
  /**
   * Descarga el proyecto como ZIP y abre el diálogo nativo de compartir.
   * Permite guardar en el teléfono, WhatsApp, Drive, etc.
   */
  const handleDownloadZip = useCallback(async () => {
    setNetError(null);
    try {
      const localUri = await downloadZip(activeRoom?.diagramId);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'application/zip',
          dialogTitle: 'Guardar proyecto Spring Boot',
          UTI: 'public.zip-archive',   // iOS
        });
      } else {
        // Sharing no disponible (emulador sin apps de destino)
        Alert.alert(
          'Archivo descargado',
          `El ZIP se guardó temporalmente en:\n${localUri}\n\nCompartir no está disponible en este dispositivo.`
        );
      }
    } catch (err) {
      if (err instanceof TypeError) {
        setNetError(
          `⚠ No se puede descargar el ZIP.\n` +
          `Verifica la conexión con:\n${API_BASE_URL}`
        );
      } else {
        setNetError(`⚠ Error al descargar: ${err.message}`);
      }
    }
  }, []);

  const handleCreateDiagram = useCallback(async () => {
    try {
      const created = await createDiagram(`Diagrama ${diagrams.length + 1}`);
      setDiagrams(prev => [...prev, created]);
      activateDiagram(created.id, created.name);
      setPickerOpen(false);
    } catch {
      Alert.alert('Error', 'No se pudo crear el diagrama. Verifica la conexión con el backend.');
    }
  }, [diagrams.length, activateDiagram]);

  // ── Active diagram name ────────────────────────────────────────
  const activeName = diagrams.find(d => d.id === activeDiagramId)?.name ?? 'Sin diagrama';

  // ── Render ─────────────────────────────────────────────────────
  if (loadingDiagrams) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Conectando al backend…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => setDrawerOpen(true)}
          style={styles.topBarBtn}
          accessibilityLabel="Abrir panel de clases"
          accessibilityRole="button"
        >
          <MenuIcon />
        </TouchableOpacity>

        {/* Diagram selector button */}
        <TouchableOpacity
          style={styles.topBarTitleGroup}
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Seleccionar diagrama"
          accessibilityRole="button"
        >
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {activeName}
          </Text>
          <View style={styles.topBarSubtitleRow}>
            <View style={[styles.statusDot, connected ? styles.statusDotOnline : styles.statusDotOffline]} />
            <Text style={styles.topBarSubtitle}>
              {connected ? 'EN LÍNEA' : 'SIN CONEXIÓN'} · {classes.length} clases · {relations.length} rel
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleClearCanvas}
          style={styles.topBarBtn}
          accessibilityLabel="Limpiar canvas"
          accessibilityRole="button"
        >
          <Text style={styles.trashIcon}>🗑</Text>
        </TouchableOpacity>

        {onLogout && (
          <TouchableOpacity
            onPress={handleLogout}
            style={[styles.topBarBtn, styles.logoutBtn]}
            accessibilityLabel="Cerrar sesión"
            accessibilityRole="button"
          >
            <Text style={styles.logoutIcon}>🚪</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Collaborative Room Bar (Parte superior del lienzo) ── */}
      <View style={styles.roomBar}>
        <View style={styles.roomBadge}>
          <View style={[styles.statusDot, connected ? styles.statusDotOnline : styles.statusDotOffline]} />
          <Text style={styles.roomBadgeLabel}>SALA:</Text>
          <Text style={styles.roomBadgeCode}>{activeRoom?.code || '1234'}</Text>
        </View>

        <View style={styles.roomActionsRow}>
          <TouchableOpacity
            style={styles.roomBtnCreate}
            onPress={handleCreateRoom}
            disabled={roomLoading}
            accessibilityLabel="Crear nueva sala colaborativa"
          >
            <Text style={styles.roomBtnCreateText}>➕ Crear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.roomBtnDefault}
            onPress={handleJoinDefaultRoom}
            disabled={roomLoading}
            accessibilityLabel="Unirse a sala por defecto 1234"
          >
            <Text style={styles.roomBtnDefaultText}>⚡ 1234</Text>
          </TouchableOpacity>

          <View style={styles.roomJoinInputWrap}>
            <TextInput
              style={styles.roomInput}
              placeholder="Código..."
              placeholderTextColor="#64748b"
              value={roomCodeInput}
              onChangeText={text => setRoomCodeInput(text.toUpperCase())}
              maxLength={10}
              autoCapitalize="characters"
              accessibilityLabel="Código de sala"
            />
            <TouchableOpacity
              style={[styles.roomBtnJoin, (!roomCodeInput.trim() || roomLoading) && styles.roomBtnDisabled]}
              onPress={handleJoinByCode}
              disabled={roomLoading || !roomCodeInput.trim()}
              accessibilityLabel="Unirse a sala"
            >
              <Text style={styles.roomBtnJoinText}>Unir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Canvas ── */}
      <ScrollView
        horizontal
        style={{ flex: 1 }}
        contentContainerStyle={{ width: CANVAS_WIDTH }}
        showsHorizontalScrollIndicator={false}
        bounces={false}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.canvas}>
            <RelationsLayer
              classes={classes}
              relations={relations}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
            />

            {classes.length === 0 ? (
              <EmptyCanvas connected={connected} activeDiagramId={activeDiagramId} />
            ) : (
              classes.map(cls => (
                <UmlClassCard
                  key={cls.id}
                  cls={cls}
                  onMove={handleMoveClass}
                  onDelete={handleDeleteClass}
                  onUpdate={handleUpdateClass}
                />
              ))
            )}
          </View>
        </ScrollView>
      </ScrollView>

      {/* ── Diagram picker ── */}
      {pickerOpen && (
        <DiagramPicker
          diagrams={diagrams}
          activeDiagramId={activeDiagramId}
          onSelect={(id, name) => { activateDiagram(id, name); setPickerOpen(false); }}
          onCreateNew={handleCreateDiagram}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* ── Network error banner ── */}
      {netError !== null && (
        <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.errorBannerText}>{netError}</Text>
          <TouchableOpacity
            onPress={() => setNetError(null)}
            style={styles.errorBannerClose}
            accessibilityLabel="Cerrar mensaje de error"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.errorBannerCloseText}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Bottom command bar ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <View style={styles.commandBar}>
          <TextInput
            style={styles.commandInput}
            value={commandText}
            onChangeText={setCommandText}
            placeholder="Describe el backend (ej: contabilidad y finanzas)…"
            placeholderTextColor="#475569"
            returnKeyType="send"
            onSubmitEditing={handleAiCommand}
            editable={!aiLoading}
            accessibilityLabel="Campo de comando para la IA"
            accessibilityHint="Escribe el tipo de backend que deseas generar y presiona el botón de micrófono o Enter"
          />

          {/* Botón de envío / micrófono */}
          <TouchableOpacity
            style={[styles.micBtn, aiLoading && styles.micBtnDisabled]}
            onPress={handleAiCommand}
            disabled={aiLoading}
            accessibilityLabel="Enviar comando a la IA"
            accessibilityRole="button"
          >
            {aiLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.micBtnIcon}>🎤</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── ZIP download FAB — visible sólo cuando hay clases ── */}
      {classes.length > 0 && (
        <TouchableOpacity
          style={styles.zipFab}
          onPress={handleDownloadZip}
          accessibilityLabel="Descargar proyecto como ZIP"
          accessibilityRole="button"
        >
          <Text style={styles.zipFabIcon}>📦</Text>
          <Text style={styles.zipFabLabel}>ZIP</Text>
        </TouchableOpacity>
      )}

      {/* ── Class and Relations drawer con sección de IA ── */}
      <ClassDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAddClass={handleAddClass}
        classes={classes}
        relations={relations}
        onAddRelation={handleAddRelation}
        onDeleteRelation={handleDeleteRelation}
        onOpenBusinessChat={() => setBusinessChatOpen(true)}
        onOpenScanDiagram={() => setScanDiagramOpen(true)}
        onLogout={onLogout ? () => { setDrawerOpen(false); handleLogout(); } : undefined}
      />

      {/* ── Chatbot de IA Empresarial (gemma2:2b) ── */}
      <BusinessChatModal
        visible={businessChatOpen}
        onClose={() => setBusinessChatOpen(false)}
        onApplyArchitecture={handleApplyAiSchema}
      />

      {/* ── Escáner de Diagramas UML (moondream) ── */}
      <ScanDiagramModal
        visible={scanDiagramOpen}
        onClose={() => setScanDiagramOpen(false)}
        onApplyDiagram={handleApplyAiSchema}
      />
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function EmptyCanvas({ connected, activeDiagramId }) {
  if (!activeDiagramId) {
    return (
      <View style={styles.emptyCanvas}>
        <Text style={styles.emptyIcon}>◇</Text>
        <Text style={styles.emptyTitle}>Sin diagrama activo</Text>
        <Text style={styles.emptyBody}>Toca el nombre en la barra superior para seleccionar o crear un diagrama.</Text>
      </View>
    );
  }
  return (
    <View style={styles.emptyCanvas}>
      <Text style={styles.emptyIcon}>□</Text>
      <Text style={styles.emptyTitle}>Canvas vacío</Text>
      <Text style={styles.emptyBody}>
        {connected
          ? 'Toca ☰ para agregar tu primera clase UML.'
          : 'Sin conexión — las clases que agregues se guardarán localmente.'}
      </Text>
    </View>
  );
}

function DiagramPicker({ diagrams, activeDiagramId, onSelect, onCreateNew, onClose }) {
  return (
    <View style={pickerStyles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
      <View style={pickerStyles.sheet}>
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.title}>Mis diagramas</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={pickerStyles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {diagrams.length === 0 ? (
            <Text style={pickerStyles.emptyText}>No hay diagramas en el servidor.</Text>
          ) : (
            diagrams.map(d => (
              <TouchableOpacity
                key={d.id}
                style={[pickerStyles.item, d.id === activeDiagramId && pickerStyles.itemActive]}
                onPress={() => onSelect(d.id, d.name)}
                accessibilityLabel={`Seleccionar diagrama ${d.name}`}
              >
                <Text style={[pickerStyles.itemName, d.id === activeDiagramId && pickerStyles.itemNameActive]}>
                  {d.name}
                </Text>
                {d.id === activeDiagramId && <Text style={pickerStyles.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        <TouchableOpacity
          style={pickerStyles.createBtn}
          onPress={onCreateNew}
          accessibilityLabel="Crear nuevo diagrama"
          accessibilityRole="button"
        >
          <Text style={pickerStyles.createBtnText}>+ Nuevo diagrama</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MenuIcon() {
  return (
    <View style={{ gap: 4 }} accessibilityHidden>
      {[18, 14, 18].map((w, i) => (
        <View key={i} style={{ width: w, height: 2, backgroundColor: '#94a3b8', borderRadius: 1 }} />
      ))}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },

  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#64748b', fontSize: 13 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  topBarBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, backgroundColor: '#334155',
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  logoutIcon: { fontSize: 16 },
  topBarTitleGroup: { flex: 1 },
  topBarTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  topBarSubtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotOnline: { backgroundColor: '#10b981' },
  statusDotOffline: { backgroundColor: '#f59e0b' },
  topBarSubtitle: { color: '#64748b', fontSize: 10, letterSpacing: 0.5 },
  trashIcon: { fontSize: 16 },

  // ── Collaborative room bar (Top of canvas) ────────────────────
  roomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#131e32',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(56, 189, 248, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0f172a',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  roomBadgeLabel: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  roomBadgeCode: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  roomActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomBtnCreate: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  roomBtnCreateText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  roomBtnDefault: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roomBtnDefaultText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  roomJoinInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  roomInput: {
    width: 60,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 11,
    color: '#f8fafc',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  roomBtnJoin: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roomBtnJoinText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  roomBtnDisabled: {
    opacity: 0.4,
  },

  canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundColor: '#0f172a' },

  emptyCanvas: {
    position: 'absolute', left: 0, right: 0, top: '30%',
    alignItems: 'center', paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 48, color: '#1e293b', marginBottom: 12 },
  emptyTitle: { color: '#334155', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: { color: '#475569', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // ── Network error banner ──────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#450a0a',
    borderTopWidth: 1,
    borderTopColor: '#7f1d1d',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorBannerClose: {
    width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  errorBannerCloseText: { color: '#f87171', fontSize: 20, lineHeight: 22, fontWeight: '700' },

  // ── Bottom command bar ────────────────────────────────────────
  commandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  commandInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    color: '#f8fafc',
    fontSize: 13,
  },
  micBtn: {
    width: 40, height: 40,
    borderRadius: 8,
    backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnDisabled: { backgroundColor: '#312e81', opacity: 0.7 },
  micBtnIcon: { fontSize: 18 },

  // ── ZIP FAB ───────────────────────────────────────────────────
  zipFab: {
    position: 'absolute',
    bottom: 70,           // justo encima de la command bar
    right: 16,
    backgroundColor: '#0369a1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
  },
  zipFabIcon: { fontSize: 18 },
  zipFabLabel: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
});

const pickerStyles = StyleSheet.create({
  overlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderTopColor: '#334155',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  title: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },
  closeText: { color: '#64748b', fontSize: 22, fontWeight: '600' },
  emptyText: { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  itemActive: { backgroundColor: 'rgba(56,189,248,0.06)' },
  itemName: { color: '#e2e8f0', fontSize: 14 },
  itemNameActive: { color: '#38bdf8', fontWeight: '600' },
  checkmark: { color: '#38bdf8', fontSize: 16, fontWeight: '700' },
  createBtn: {
    marginHorizontal: 20, marginTop: 16,
    backgroundColor: '#6366f1', borderRadius: 8,
    paddingVertical: 13, alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
});
