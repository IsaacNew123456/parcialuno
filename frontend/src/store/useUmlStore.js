import { create } from 'zustand';
import { emitDiagramEvent, onDiagramEvent } from '../services/websocketService.js';
import wsClient from '../services/wsClient.js';

let classIdCounter = 1;

function parseAttrs(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((a) => {
      if (typeof a === 'string') {
        const [name, type = 'String'] = a.split(':').map((x) => x.trim());
        return { name, type, version: 0 };
      }
      return { name: String(a.name || '').trim(), type: String(a.type || 'String').trim(), version: a.version || 0 };
    }).filter((a) => a.name);
  }
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [name, type = 'String'] = s.split(':').map((x) => x.trim());
      return { name, type, version: 0 };
    });
}

const useUmlStore = create((set, get) => ({
  classes: [],
  relations: [],
  diagramName: 'Mi Diagrama',
  diagramId: null,
  currentRoom: { id: 1, code: '1234', name: 'Sala 1234', diagramId: 1 },
  locks: {}, // elementId -> LockPayload

  setActiveRoom: (roomData, switchWs = true) => {
    if (!roomData) return;
    const diagram = roomData.diagram || {};
    const diagramId = roomData.diagramId || diagram.id || roomData.id;
    const room = {
      id: roomData.id,
      code: roomData.code,
      name: roomData.name,
      diagramId,
    };
    set({
      currentRoom: room,
      diagramId,
      diagramName: diagram.name || roomData.name || 'Mi Diagrama',
    });

    if (diagram && (Array.isArray(diagram.classes) || Array.isArray(diagram.relations))) {
      get().loadDiagram({
        id: diagramId,
        name: diagram.name || roomData.name,
        classes: diagram.classes || [],
        relations: diagram.relations || [],
      }, false);
    }

    if (switchWs) {
      wsClient.switchRoom(diagramId || roomData.id);
    }
  },

  setLock: (elementId, lockPayload) => {
    set((s) => ({
      locks: { ...s.locks, [String(elementId)]: lockPayload },
    }));
  },

  removeLock: (elementId) => {
    set((s) => {
      const next = { ...s.locks };
      delete next[String(elementId)];
      return { locks: next };
    });
  },

  requestLock: (elementId, elementType = 'CLASS') => {
    wsClient.requestLock(elementId, elementType);
  },

  releaseLock: (elementId, elementType = 'CLASS') => {
    wsClient.releaseLock(elementId, elementType);
  },

  setDiagramName: (name, broadcast = true) => {
    set({ diagramName: name });
    if (broadcast) {
      emitDiagramEvent('NAME_CHANGED', { name }, get().diagramId);
    }
  },

  addClass: (name, attrsRaw = '', broadcast = true) => {
    const attrs = parseAttrs(attrsRaw);
    const id = `cls_${Date.now()}_${classIdCounter++}`;
    const count = get().classes.length;
    const newClass = {
      id,
      name: name.trim(),
      attrs,
      x: 40 + (count % 4) * 240,
      y: 60 + Math.floor(count / 4) * 200,
      version: 0,
      roomId: get().currentRoom?.id,
    };
    set((s) => ({ classes: [...s.classes, newClass] }));
    if (broadcast) {
      wsClient.sendMutation('CLASS_CREATED', newClass);
      emitDiagramEvent('CLASS_ADDED', newClass, get().diagramId);
    }
    return newClass;
  },

  updateClass: (id, patch, broadcast = true) => {
    set((s) => ({
      classes: s.classes.map((c) => (c.id === id ? { ...c, ...patch, version: (c.version || 0) + 1 } : c)),
    }));
    if (broadcast) {
      wsClient.sendMutation('CLASS_UPDATED', { id, patch, ...patch });
      emitDiagramEvent('CLASS_UPDATED', { id, patch }, get().diagramId);
    }
  },

  updatePosition: (id, x, y, broadcast = true) => {
    set((s) => ({
      classes: s.classes.map((c) => (c.id === id ? { ...c, x, y } : c)),
    }));
    if (broadcast) {
      wsClient.sendMutation('CLASS_MOVED', { id, x, y });
      emitDiagramEvent('CLASS_MOVED', { id, x, y }, get().diagramId);
    }
  },

  deleteClass: (id, broadcast = true) => {
    set((s) => ({
      classes: s.classes.filter((c) => c.id !== id),
      relations: s.relations.filter((r) => r.fromId !== id && r.toId !== id && r.sourceId !== id && r.targetId !== id),
    }));
    if (broadcast) {
      wsClient.sendMutation('CLASS_DELETED', { id });
      emitDiagramEvent('CLASS_DELETED', { id }, get().diagramId);
      wsClient.releaseLock(id, 'CLASS');
    }
  },

  addAttribute: (classId, attr, broadcast = true) => {
    set((s) => ({
      classes: s.classes.map((c) => {
        if (c.id !== classId) return c;
        const attrs = Array.isArray(c.attrs) ? [...c.attrs, attr] : [attr];
        return { ...c, attrs, version: (c.version || 0) + 1 };
      }),
    }));
    if (broadcast) {
      wsClient.sendMutation('ATTR_ADDED', { classId, attr });
    }
  },

  updateAttribute: (classId, index, attr, broadcast = true) => {
    set((s) => ({
      classes: s.classes.map((c) => {
        if (c.id !== classId) return c;
        const nextAttrs = [...(c.attrs || [])];
        if (index >= 0 && index < nextAttrs.length) {
          nextAttrs[index] = { ...nextAttrs[index], ...attr };
        }
        return { ...c, attrs: nextAttrs, version: (c.version || 0) + 1 };
      }),
    }));
    if (broadcast) {
      wsClient.sendMutation('ATTR_UPDATED', { classId, index, attr });
    }
  },

  removeAttribute: (classId, index, attrName, broadcast = true) => {
    set((s) => ({
      classes: s.classes.map((c) => {
        if (c.id !== classId) return c;
        const filtered = (c.attrs || []).filter((a, i) => i !== index && (!attrName || a.name !== attrName));
        return { ...c, attrs: filtered, version: (c.version || 0) + 1 };
      }),
    }));
    if (broadcast) {
      wsClient.sendMutation('ATTR_REMOVED', { classId, index, attrName });
    }
  },

  addRelation: (param1, param2, mult = '1..*', relationType = 'association', intermediateTableName = '', broadcast = true) => {
    let fromId, toId, optMult, optType, optInterName, optBroadcast;

    if (typeof param1 === 'object' && param1 !== null) {
      fromId = param1.fromId || param1.sourceId;
      toId = param1.toId || param1.targetId;
      optMult = param1.mult || param1.targetMultiplicity || '1..*';
      optType = param1.relationType || 'association';
      optInterName = param1.intermediateTableName || param1.intermediateTableInfo?.tableName || '';
      optBroadcast = param1.broadcast !== false;
    } else {
      fromId = param1;
      toId = param2;
      optMult = mult || '1..*';
      optType = relationType || 'association';
      optInterName = intermediateTableName || '';
      optBroadcast = broadcast !== false;
    }

    const { classes } = get();
    const from = classes.find((c) => c.id === fromId);
    const to = classes.find((c) => c.id === toId);
    if (!from || !to) return;
    if (from.id === to.id) return;

    const exists = get().relations.some(
      (r) => (r.fromId === fromId || r.sourceId === fromId) && (r.toId === toId || r.targetId === toId)
    );
    if (exists) return;

    if (optType === 'composition' || optType === 'aggregation') {
      optMult = '1..*';
    }

    const defaultInterName = `${from.name}_${to.name}`;
    const resolvedInterName = optMult === '*..*' ? (optInterName.trim() || defaultInterName) : undefined;

    const isInheritance = optType === 'inheritance';
    const isContainerRel = optType === 'composition' || optType === 'aggregation';

    const newRelation = {
      id: `rel_${Date.now()}`,
      fromId,
      toId,
      sourceId: fromId,
      targetId: toId,
      fromName: from.name,
      toName: to.name,
      mult: optMult,
      relationType: optType, // 'association' | 'aggregation' | 'composition' | 'inheritance'
      sourceMultiplicity: isInheritance ? '' : (isContainerRel ? '1' : (optMult.includes('..') ? optMult.split('..')[0] : '1')),
      targetMultiplicity: isInheritance ? '' : (isContainerRel ? '*' : (optMult.includes('..') ? optMult.split('..')[1] : optMult)),
      intermediateTableName: resolvedInterName,
      intermediateTableInfo: resolvedInterName ? {
        tableName: resolvedInterName,
        sourceForeignKey: `${from.name.toLowerCase()}_id`,
        targetForeignKey: `${to.name.toLowerCase()}_id`,
      } : undefined,
      roomId: get().currentRoom?.id,
    };

    set((s) => ({
      relations: [...s.relations, newRelation],
    }));

    if (optBroadcast) {
      wsClient.sendMutation('RELATION_CREATED', newRelation);
      emitDiagramEvent('RELATION_ADDED', newRelation, get().diagramId);
    }
  },

  deleteRelation: (id, broadcast = true) => {
    set((s) => ({ relations: s.relations.filter((r) => r.id !== id) }));
    if (broadcast) {
      wsClient.sendMutation('RELATION_DELETED', { id });
      emitDiagramEvent('RELATION_DELETED', { id }, get().diagramId);
    }
  },

  applyAiMutation: (mutation) => {
    if (!mutation) return { success: false, message: 'Mutación inválida' };
    const action = String(mutation.action || mutation.data?.action || '').toUpperCase();
    const data = mutation.data || mutation;
    const { classes, deleteClass, addAttribute, updateAttribute, addRelation } = get();

    switch (action) {
      case 'ADD_CLASS': {
        const name = (data?.name || data?.className || '').trim();
        if (!name) return { success: false, message: 'Nombre de clase requerido' };

        // Verificar si la clase ya existe
        const existing = classes.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          if (Array.isArray(data.attributes)) {
            data.attributes.forEach((attr) => {
              const attrName = typeof attr === 'object' ? attr.name : String(attr);
              const attrType = typeof attr === 'object' ? (attr.type || 'String') : 'String';
              const attrExists = (existing.attrs || []).some((a) => a.name.toLowerCase() === attrName.toLowerCase());
              if (!attrExists) {
                addAttribute(existing.id, { name: attrName, type: attrType, version: 0 });
              }
            });
          }
          return { success: true, message: `Clase "${existing.name}" actualizada con nuevos atributos ✓` };
        }

        // Creación atómica sin reiniciar el estado global
        const attrsList = Array.isArray(data.attributes)
          ? data.attributes.map((a) => ({
              name: String(a.name || a).trim(),
              type: String(a.type || 'String').trim(),
              version: 0,
            }))
          : [];

        const count = classes.length;
        const newClassId = `cls_${Date.now()}_${classIdCounter++}`;
        const newClass = {
          id: newClassId,
          name,
          attrs: attrsList,
          x: 150 + count * 30,
          y: 150 + count * 30,
          version: 0,
        };

        set((s) => ({ classes: [...s.classes, newClass] }));
        wsClient.sendMutation('CLASS_CREATED', newClass);
        emitDiagramEvent('CLASS_ADDED', newClass, get().diagramId);

        return { success: true, message: `Clase "${name}" agregada incrementalmente ✓` };
      }


      case 'UPDATE_CLASS': {
        const targetName = (data?.className || data?.name || '').trim();
        const attr = data?.attribute;
        if (!targetName) return { success: false, message: 'Nombre de clase requerido' };

        const targetClass = classes.find((c) => c.name.toLowerCase() === targetName.toLowerCase());
        if (!targetClass) {
          return { success: false, message: `Clase "${targetName}" no encontrada en el lienzo` };
        }

        if (attr && attr.name) {
          const attrIndex = (targetClass.attrs || []).findIndex(
            (a) => a.name.toLowerCase() === String(attr.name).toLowerCase()
          );

          if (attrIndex >= 0) {
            // Modificar tipo del atributo existente
            updateAttribute(targetClass.id, attrIndex, {
              type: attr.type || targetClass.attrs[attrIndex].type,
            });
            return { success: true, message: `Atributo "${attr.name}" actualizado a ${attr.type} en "${targetClass.name}" ✓` };
          } else {
            // Agregar nuevo atributo si no existía
            addAttribute(targetClass.id, {
              name: attr.name,
              type: attr.type || 'String',
              version: 0,
            });
            return { success: true, message: `Atributo "${attr.name}: ${attr.type || 'String'}" agregado a "${targetClass.name}" ✓` };
          }
        }
        return { success: false, message: 'No se especificó atributo a modificar' };
      }

      case 'DELETE_CLASS': {
        const targetName = (data?.className || data?.name || '').trim();
        if (!targetName) return { success: false, message: 'Nombre de clase requerido' };

        const targetClass = classes.find((c) => c.name.toLowerCase() === targetName.toLowerCase());
        if (!targetClass) {
          return { success: false, message: `Clase "${targetName}" no encontrada para eliminar` };
        }

        deleteClass(targetClass.id);
        return { success: true, message: `Clase "${targetClass.name}" eliminada ✓` };
      }

      case 'ADD_RELATION': {
        const sourceName = (data?.source || data?.from || '').trim();
        const targetName = (data?.target || data?.to || '').trim();
        if (!sourceName || !targetName) {
          return { success: false, message: 'Se requiere origen y destino para la relación' };
        }

        const sourceClass = classes.find((c) => c.name.toLowerCase() === sourceName.toLowerCase());
        const targetClass = classes.find((c) => c.name.toLowerCase() === targetName.toLowerCase());

        if (!sourceClass || !targetClass) {
          return { success: false, message: `No se encontraron clases para relacionar: "${sourceName}" -> "${targetName}"` };
        }

        const relType = data?.type || data?.relationType || 'association';
        const mult = data?.multiplicity || data?.mult || '1..*';

        addRelation(sourceClass.id, targetClass.id, mult, relType);
        return { success: true, message: `Relación entre "${sourceClass.name}" y "${targetClass.name}" creada ✓` };
      }

      default:
        return { success: false, message: `Acción no soportada: ${action}` };
    }
  },

  loadDiagram: (diagramResponse, broadcast = false) => {

    const { id, name, classes = [], relations = [] } = diagramResponse;

    const hydratedClasses = classes.map((cls, i) => ({
      id: cls.id || `cls_${Date.now()}_${i}`,
      name: cls.name,
      attrs: cls.attrs || [],
      x: cls.x ?? (40 + (i % 3) * 260),
      y: cls.y ?? (60 + Math.floor(i / 3) * 220),
      version: cls.version || 0,
    }));

    const hydratedRelations = relations.map((rel, i) => {
      const fromId = rel.fromId || rel.sourceId;
      const toId = rel.toId || rel.targetId;
      const relationType = rel.relationType || 'association';
      const mult = rel.mult || rel.targetMultiplicity || '1..*';
      const interName = rel.intermediateTableName || rel.intermediateTableInfo?.tableName || (mult === '*..*' ? `${rel.fromName || 'Origen'}_${rel.toName || 'Destino'}` : undefined);

      return {
        id: rel.id || `rel_${Date.now()}_${i}`,
        fromId,
        toId,
        sourceId: fromId,
        targetId: toId,
        fromName: rel.fromName,
        toName: rel.toName,
        mult,
        relationType,
        sourceMultiplicity: rel.sourceMultiplicity || (relationType === 'inheritance' ? '' : (mult.includes('..') ? mult.split('..')[0] : '1')),
        targetMultiplicity: rel.targetMultiplicity || (relationType === 'inheritance' ? '' : (mult.includes('..') ? mult.split('..')[1] : mult)),
        intermediateTableName: interName,
        intermediateTableInfo: rel.intermediateTableInfo || (interName ? {
          tableName: interName,
          sourceForeignKey: `${(rel.fromName || 'origen').toLowerCase()}_id`,
          targetForeignKey: `${(rel.toName || 'destino').toLowerCase()}_id`,
        } : undefined),
      };
    });

    set({
      diagramId: id,
      diagramName: name,
      classes: hydratedClasses,
      relations: hydratedRelations,
    });

    if (broadcast) {
      emitDiagramEvent('DIAGRAM_LOADED', diagramResponse, id);
    }
  },

  resetCanvas: (broadcast = true) => {
    set({ classes: [], relations: [], diagramName: 'Mi Diagrama', diagramId: null });
    if (broadcast) {
      emitDiagramEvent('CANVAS_RESET', {}, 'global');
    }
  },

  applyRemoteEvent: (event) => {
    if (!event || !event.eventType) return;

    // Si el evento fue emitido por el mismo usuario local, no re-aplicar para evitar parpadeos/saltos
    if (event.senderId && event.senderId === wsClient.userId) {
      return;
    }

    const { eventType, payload } = event;

    switch (eventType) {
      case 'CLASS_MOVED': {
        const { id, x, y } = payload || {};
        if (id !== undefined) {
          set((s) => ({
            classes: s.classes.map((c) => (c.id === id ? { ...c, x: Number(x), y: Number(y) } : c)),
          }));
        }
        break;
      }
      case 'CLASS_CREATED':
      case 'CLASS_ADDED': {
        if (payload && payload.id) {
          set((s) => {
            const exists = s.classes.some((c) => c.id === payload.id);
            if (exists) {
              return {
                classes: s.classes.map((c) => (c.id === payload.id ? { ...c, ...payload } : c)),
              };
            }
            return { classes: [...s.classes, payload] };
          });
        }
        break;
      }
      case 'CLASS_UPDATED': {
        const id = payload?.id;
        const patch = payload?.patch || payload;
        if (id) {
          set((s) => ({
            classes: s.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          }));
        }
        break;
      }
      case 'CLASS_DELETED': {
        const id = payload?.id;
        if (id) {
          set((s) => ({
            classes: s.classes.filter((c) => c.id !== id),
            relations: s.relations.filter((r) => r.fromId !== id && r.toId !== id && r.sourceId !== id && r.targetId !== id),
          }));
        }
        break;
      }
      case 'ATTR_ADDED': {
        const { classId, attr } = payload || {};
        if (classId && attr) {
          set((s) => ({
            classes: s.classes.map((c) => {
              if (c.id !== classId) return c;
              const attrs = Array.isArray(c.attrs) ? [...c.attrs, attr] : [attr];
              return { ...c, attrs };
            }),
          }));
        }
        break;
      }
      case 'ATTR_UPDATED': {
        const { classId, index, attr, attrs } = payload || {};
        if (classId) {
          set((s) => ({
            classes: s.classes.map((c) => {
              if (c.id !== classId) return c;
              if (attrs) {
                return { ...c, attrs };
              }
              if (index !== undefined && index >= 0 && c.attrs && c.attrs[index]) {
                const nextAttrs = [...c.attrs];
                nextAttrs[index] = { ...nextAttrs[index], ...attr };
                return { ...c, attrs: nextAttrs };
              }
              return c;
            }),
          }));
        }
        break;
      }
      case 'ATTR_REMOVED': {
        const { classId, index, attrName } = payload || {};
        if (classId) {
          set((s) => ({
            classes: s.classes.map((c) => {
              if (c.id !== classId) return c;
              if (index !== undefined && index >= 0 && c.attrs) {
                return { ...c, attrs: c.attrs.filter((_, i) => i !== index) };
              }
              if (attrName && c.attrs) {
                return { ...c, attrs: c.attrs.filter((a) => a.name !== attrName) };
              }
              return c;
            }),
          }));
        }
        break;
      }
      case 'RELATION_CREATED':
      case 'RELATION_ADDED': {
        if (payload && payload.id) {
          set((s) => {
            const exists = s.relations.some((r) => r.id === payload.id);
            if (exists) {
              return {
                relations: s.relations.map((r) => (r.id === payload.id ? { ...r, ...payload } : r)),
              };
            }
            return { relations: [...s.relations, payload] };
          });
        }
        break;
      }
      case 'RELATION_DELETED': {
        const id = payload?.id;
        if (id) {
          set((s) => ({ relations: s.relations.filter((r) => r.id !== id) }));
        }
        break;
      }
      case 'DIAGRAM_LOADED': {
        if (payload) {
          get().loadDiagram(payload, false);
        }
        break;
      }
      case 'CANVAS_RESET': {
        get().resetCanvas(false);
        break;
      }
      case 'NAME_CHANGED': {
        if (payload && payload.name) {
          get().setDiagramName(payload.name, false);
        }
        break;
      }
      default:
        break;
    }
  },
}));

// Registrar automáticamente la recepción de eventos remotos (mock/local y STOMP real)
onDiagramEvent((event) => {
  useUmlStore.getState().applyRemoteEvent(event);
});

wsClient.onEvent((event) => {
  useUmlStore.getState().applyRemoteEvent(event);
});

// Sincronizar bloqueos de concurrencia y snapshots de sesión desde wsClient
wsClient.onLock((lock, isLocked) => {
  if (!lock || !lock.elementId) return;
  if (isLocked) {
    useUmlStore.getState().setLock(lock.elementId, lock);
  } else {
    useUmlStore.getState().removeLock(lock.elementId);
  }
});

wsClient.onSnapshot((snapshotModel) => {
  if (snapshotModel) {
    const store = useUmlStore.getState();
    store.loadDiagram({
      id: snapshotModel.id || store.diagramId,
      name: snapshotModel.name || store.diagramName,
      classes: snapshotModel.classes || [],
      relations: snapshotModel.relations || [],
    }, false);
  }
});

export default useUmlStore;
