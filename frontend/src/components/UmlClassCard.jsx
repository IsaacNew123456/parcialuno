import { useState, useEffect, memo } from 'react';
import useUmlStore from '../store/useUmlStore.js';
import wsClient from '../services/wsClient.js';

function UmlClassCard({ cls, onMouseDown }) {
  const {
    deleteClass,
    updateClass,
    updateAttribute,
    addAttribute,
    removeAttribute,
    locks,
    requestLock,
    releaseLock,
  } = useUmlStore();
  const [isDragging, setIsDragging] = useState(false);

  // Estados locales para edición reactiva
  const [isEditingName, setIsEditingName] = useState(false);
  const [classNameInput, setClassNameInput] = useState(cls.name);
  const [editingAttrIndex, setEditingAttrIndex] = useState(null);
  const [attrInputs, setAttrInputs] = useState(cls.attrs || []);

  useEffect(() => {
    setClassNameInput(cls.name);
    setAttrInputs(cls.attrs || []);
  }, [cls.name, cls.attrs]);

  // Verificar estado de bloqueo del elemento de clase
  const classLock = locks[cls.id];
  const isLockedByOther = classLock && classLock.locked && classLock.lockedByUserId !== wsClient.userId;
  const isLockedByMe = classLock && classLock.locked && classLock.lockedByUserId === wsClient.userId;

  function handleMouseDown(e) {
    if (isLockedByOther) return; // Impedir drag si otro usuario tiene el bloqueo
    requestLock(cls.id, 'CLASS');
    setIsDragging(true);
    onMouseDown(e);
    window.addEventListener('mouseup', () => setIsDragging(false), { once: true });
  }

  // --- Handlers de Bloqueo y Edición de Nombre ---
  function startEditingName() {
    if (isLockedByOther) return;
    setIsEditingName(true);
    requestLock(cls.id, 'CLASS');
  }

  function finishEditingName() {
    setIsEditingName(false);
    const trimmed = classNameInput.trim();
    if (trimmed && trimmed !== cls.name) {
      updateClass(cls.id, { name: trimmed });
    }
    releaseLock(cls.id, 'CLASS');
  }

  // --- Handlers de Bloqueo y Edición de Atributos ---
  function startEditingAttr(index) {
    const attrElementId = `${cls.id}_attr_${index}`;
    const attrLock = locks[attrElementId];
    if (attrLock && attrLock.locked && attrLock.lockedByUserId !== wsClient.userId) {
      return;
    }
    setEditingAttrIndex(index);
    requestLock(attrElementId, 'ATTR');
  }

  function finishEditingAttr(index) {
    const attrElementId = `${cls.id}_attr_${index}`;
    setEditingAttrIndex(null);
    const updated = attrInputs[index];
    if (updated) {
      updateAttribute(cls.id, index, updated);
    }
    releaseLock(attrElementId, 'ATTR');
  }

  function handleAddAttr(e) {
    e.stopPropagation();
    if (isLockedByOther) return;
    const newAttr = {
      name: `campo_${(cls.attrs?.length || 0) + 1}`,
      type: 'String',
      version: 0,
    };
    addAttribute(cls.id, newAttr);
  }

  function handleRemoveAttr(e, index, attrName) {
    e.stopPropagation();
    if (isLockedByOther) return;
    const attrElementId = `${cls.id}_attr_${index}`;
    if (locks[attrElementId]?.locked && locks[attrElementId]?.lockedByUserId !== wsClient.userId) {
      return;
    }
    removeAttribute(cls.id, index, attrName);
    releaseLock(attrElementId, 'ATTR');
  }

  function handleAttrChange(index, field, value) {
    const next = [...attrInputs];
    next[index] = { ...next[index], [field]: value };
    setAttrInputs(next);
  }

  const cardClasses = [
    'uml-card',
    isDragging ? 'dragging' : '',
    isLockedByOther ? 'locked-by-other' : '',
    isLockedByMe ? 'locked-by-me' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClasses}
      style={{ left: cls.x, top: cls.y }}
      onMouseDown={handleMouseDown}
      role="figure"
      aria-label={`Clase ${cls.name}`}
      data-class-id={cls.id}
    >
      {/* Banner visual de bloqueo por otro usuario */}
      {isLockedByOther && (
        <div className="uml-lock-banner" title={`Bloqueado por ${classLock.lockedByUsername || classLock.lockedByUserId}`}>
          <LockIcon />
          <span>Editando: {classLock.lockedByUsername || classLock.lockedByUserId}</span>
        </div>
      )}

      {/* Banner visual cuando el usuario local tiene el bloqueo */}
      {isLockedByMe && (
        <div className="uml-lock-banner-me">
          <EditIcon />
          <span>Editando (bloqueo activo)</span>
        </div>
      )}

      <div className="uml-card-header">
        {isEditingName ? (
          <input
            className="uml-card-input"
            value={classNameInput}
            onChange={(e) => setClassNameInput(e.target.value)}
            onBlur={finishEditingName}
            autoFocus
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Enter' && finishEditingName()}
          />
        ) : (
          <span
            className="uml-card-title"
            title={isLockedByOther ? `Bloqueado por ${classLock.lockedByUsername}` : 'Doble click para editar'}
            onDoubleClick={startEditingName}
          >
            {cls.name}
          </span>
        )}
        <span className="uml-card-badge">«entity»</span>
        <button
          className="uml-card-delete"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => !isLockedByOther && deleteClass(cls.id)}
          disabled={isLockedByOther}
          aria-label={`Eliminar clase ${cls.name}`}
          title={isLockedByOther ? 'No disponible: elemento bloqueado' : 'Eliminar'}
        >
          <DeleteIcon />
        </button>
      </div>

      <div className="uml-card-body">
        {attrInputs.length === 0 ? (
          <div className="uml-card-attr" style={{ color: 'var(--color-text-3)', fontStyle: 'italic' }}>
            Sin atributos
          </div>
        ) : (
          attrInputs.map((attr, i) => {
            const attrElementId = `${cls.id}_attr_${i}`;
            const attrLock = locks[attrElementId];
            const isAttrLockedByOther = attrLock && attrLock.locked && attrLock.lockedByUserId !== wsClient.userId;

            return (
              <div
                key={i}
                className="uml-card-attr"
                style={isAttrLockedByOther ? { opacity: 0.5, borderLeft: '2px solid #f59e0b', paddingLeft: '4px' } : {}}
              >
                {editingAttrIndex === i ? (
                  <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                    <input
                      className="uml-card-input"
                      style={{ width: '60%' }}
                      value={attr.name}
                      onChange={(e) => handleAttrChange(i, 'name', e.target.value)}
                      onBlur={() => finishEditingAttr(i)}
                      autoFocus
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.key === 'Enter' && finishEditingAttr(i)}
                    />
                    <input
                      className="uml-card-input"
                      style={{ width: '40%' }}
                      value={attr.type}
                      onChange={(e) => handleAttrChange(i, 'type', e.target.value)}
                      onBlur={() => finishEditingAttr(i)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.key === 'Enter' && finishEditingAttr(i)}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: isAttrLockedByOther ? 'not-allowed' : 'pointer'
                    }}
                    onDoubleClick={() => !isAttrLockedByOther && !isLockedByOther && startEditingAttr(i)}
                    title={isAttrLockedByOther ? `Atributo bloqueado por ${attrLock.lockedByUsername}` : 'Doble click para editar'}
                  >
                    <div style={{ display: 'flex', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span className="uml-card-attr-name">+{attr.name}</span>
                      <span className="uml-card-attr-type">: {attr.type}</span>
                    </div>
                    {!isAttrLockedByOther && !isLockedByOther && (
                      <button
                        type="button"
                        className="uml-card-attr-remove"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-text-3)',
                          cursor: 'pointer',
                          padding: '0 2px',
                          fontSize: '11px',
                          opacity: 0.6,
                        }}
                        onClick={(e) => handleRemoveAttr(e, i, attr.name)}
                        title="Eliminar atributo"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Botón rápido para agregar atributo atómico */}
        {!isLockedByOther && (
          <button
            type="button"
            className="uml-card-add-attr-btn"
            style={{
              width: '100%',
              marginTop: '4px',
              padding: '2px 6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px dashed var(--color-border)',
              borderRadius: '4px',
              color: 'var(--color-text-2)',
              fontSize: '11px',
              cursor: 'pointer',
              textAlign: 'center'
            }}
            onClick={handleAddAttr}
          >
            + Atributo
          </button>
        )}
      </div>
    </div>
  );
}

function DeleteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export default memo(UmlClassCard);
