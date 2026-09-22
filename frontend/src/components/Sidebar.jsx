import { useState } from 'react';
import useUmlStore from '../store/useUmlStore.js';
import { saveDiagram, updateDiagram, exportBackendZip, exportPostmanCollection } from '../services/api.js';
import { generateLocalZip } from '../services/zipExporter.js';
import { useToast } from '../context/ToastContext.jsx';
import CodeModal from './CodeModal.jsx';
import { generateIntermediateClassName, isManyToMany } from '../utils/namingUtils.js';

export default function Sidebar() {
  const {
    classes, relations, diagramName, diagramId,
    addClass, addRelation, deleteClass, deleteRelation,
  } = useUmlStore();
  const addToast = useToast();

  const [className, setClassName] = useState('');
  const [classAttrs, setClassAttrs] = useState('');

  const [relFrom, setRelFrom] = useState('');
  const [relTo, setRelTo] = useState('');
  const [relType, setRelType] = useState('association');
  const [relMult, setRelMult] = useState('0..*..1..*');
  const [intermediateTable, setIntermediateTable] = useState('');

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPostman, setExportingPostman] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  function getSuggestedTableName(fromId, toId) {
    const from = classes.find((c) => c.id === fromId);
    const to = classes.find((c) => c.id === toId);
    if (from && to) return generateIntermediateClassName(from.name, to.name);
    return '';
  }

  function handleAddClass(e) {
    e.preventDefault();
    if (!className.trim()) return;
    addClass(className.trim(), classAttrs);
    setClassName('');
    setClassAttrs('');
    addToast(`Clase "${className.trim()}" agregada`, 'success');
  }

  function handleAddRelation(e) {
    e.preventDefault();
    if (!relFrom || !relTo) {
      addToast('Selecciona origen y destino para la relación', 'warning');
      return;
    }
    if (relFrom === relTo) {
      addToast('El origen y destino deben ser clases distintas', 'warning');
      return;
    }

    const isContainer = relType === 'aggregation' || relType === 'composition';
    const effectiveMult = relType === 'inheritance' ? '1..1' : (isContainer ? '1..*' : relMult);

    let srcMult = '1';
    let tgtMult = '1..*';

    if (effectiveMult === '0..*..1..*') {
      srcMult = '0..*';
      tgtMult = '1..*';
    } else if (effectiveMult === '1..*..1..*') {
      srcMult = '1..*';
      tgtMult = '1..*';
    } else if (effectiveMult === '0..*..0..*') {
      srcMult = '0..*';
      tgtMult = '0..*';
    } else if (effectiveMult === '*..*') {
      srcMult = '0..*';
      tgtMult = '1..*';
    } else if (effectiveMult.includes('..')) {
      const parts = effectiveMult.split('..');
      srcMult = parts[0] || '1';
      tgtMult = parts[1] || '*';
    }

    const isNM = isManyToMany(srcMult, tgtMult, effectiveMult) && relType !== 'inheritance' && !isContainer;
    const suggested = getSuggestedTableName(relFrom, relTo);
    const finalTable = isNM ? (intermediateTable.trim() || suggested || 'Detalle_Intermedia') : '';

    addRelation({
      fromId: relFrom,
      toId: relTo,
      sourceMultiplicity: srcMult,
      targetMultiplicity: tgtMult,
      mult: `${srcMult}..${tgtMult}`,
      relationType: relType,
      intermediateTableName: finalTable,
    });

    const typeNames = {
      association: isNM ? 'Muchos a Muchos (con Clase Intermedia)' : 'Asociación',
      aggregation: 'Agregación',
      composition: 'Composición',
      inheritance: 'Herencia',
    };
    addToast(`Relación de ${typeNames[relType] || relType} creada`, 'success');
    setRelFrom('');
    setRelTo('');
    setIntermediateTable('');
  }

  async function handleSave() {
    if (!diagramName.trim()) {
      addToast('Asigna un nombre al diagrama antes de guardar', 'warning');
      return;
    }
    setSaving(true);
    const payload = { name: diagramName, classes, relations };
    try {
      if (diagramId) {
        await updateDiagram(diagramId, payload);
        addToast('Diagrama actualizado en PostgreSQL ✓', 'success');
      } else {
        await saveDiagram(payload);
        addToast('Diagrama guardado en PostgreSQL ✓', 'success');
      }
    } catch (err) {
      addToast(`Error al guardar en BD: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleExportZip() {
    if (classes.length === 0) {
      addToast('Agrega al menos una clase antes de exportar', 'warning');
      return;
    }
    setExporting(true);
    const model = { name: diagramName, classes, relations };
    try {
      await exportBackendZip(model);
      addToast('ZIP descargado desde el backend Spring Boot ✓', 'success');
    } catch {
      addToast('Backend inactivo o no disponible — usando generador local JSZip…', 'warning', 2500);
      try {
        await generateLocalZip(model);
        addToast('ZIP descargado localmente con éxito ✓', 'success');
      } catch (localErr) {
        addToast(`Error en la generación local: ${localErr.message}`, 'error');
      }
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPostman() {
    if (classes.length === 0) {
      addToast('Agrega al menos una clase antes de exportar', 'warning');
      return;
    }
    setExportingPostman(true);
    const model = { name: diagramName, classes, relations };
    try {
      await exportPostmanCollection(model);
      addToast('Colección de Postman descargada con éxito (v2.1.0) ✓', 'success');
    } catch (err) {
      addToast(`Error al exportar a Postman: ${err.message}`, 'error');
    } finally {
      setExportingPostman(false);
    }
  }

  return (
    <>
      <aside className="sidebar" aria-label="Panel de herramientas">
        {/* Formulario Nueva Clase */}
        <section className="sidebar-section">
          <p className="sidebar-label">Nueva Clase</p>
          <form onSubmit={handleAddClass} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="class-name">Nombre de la clase</label>
              <input
                id="class-name"
                className="form-input"
                type="text"
                placeholder="ej. Producto, Usuario"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="class-attrs">
                Atributos <span className="text-muted text-xs">(nombre:Tipo, …)</span>
              </label>
              <textarea
                id="class-attrs"
                className="form-textarea"
                placeholder="nombre:String, precio:Double, stock:Integer"
                value={classAttrs}
                onChange={(e) => setClassAttrs(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary w-full">
              <PlusIcon /> Agregar Clase
            </button>
          </form>
        </section>

        {/* Lista de clases */}
        {classes.length > 0 && (
          <section className="sidebar-section">
            <p className="sidebar-label">Clases ({classes.length})</p>
            <div className="class-list" role="list" aria-label="Lista de clases">
              {classes.map((cls) => (
                <div key={cls.id} className="class-list-item" role="listitem">
                  <div>
                    <div className="class-list-item-name">{cls.name}</div>
                    <div className="class-list-item-meta">
                      {cls.attrs.length === 0
                        ? 'Sin atributos'
                        : cls.attrs.map((a) => `${a.name}: ${a.type}`).join(', ')}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => deleteClass(cls.id)}
                    aria-label={`Eliminar clase ${cls.name}`}
                    title="Eliminar clase"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Formulario Nueva Relación */}
        {classes.length >= 2 && (
          <section className="sidebar-section">
            <p className="sidebar-label">Nueva Relación</p>
            <form onSubmit={handleAddRelation} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="rel-type">Tipo de Relación</label>
                <select
                  id="rel-type"
                  className="form-select"
                  value={relType}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setRelType(nextType);
                    if (nextType === 'aggregation' || nextType === 'composition') {
                      setRelMult('1..*');
                    }
                  }}
                >
                  <option value="association">― Asociación simple</option>
                  <option value="aggregation">◇ Agregación (Contenedor)</option>
                  <option value="composition">◆ Composición (CASCADE)</option>
                  <option value="inheritance">◁ Herencia / Generalización</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="rel-from">
                  {relType === 'inheritance' ? 'Clase Hija (Subclase)' : 'Origen / Contenedor'}
                </label>
                <select
                  id="rel-from"
                  className="form-select"
                  value={relFrom}
                  onChange={(e) => {
                    setRelFrom(e.target.value);
                    if (relMult === '*..*' && !intermediateTable) {
                      setIntermediateTable(getSuggestedTableName(e.target.value, relTo));
                    }
                  }}
                >
                  <option value="">Selecciona clase…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="rel-to">
                  {relType === 'inheritance' ? 'Clase Padre (Superclase)' : 'Destino'}
                </label>
                <select
                  id="rel-to"
                  className="form-select"
                  value={relTo}
                  onChange={(e) => {
                    setRelTo(e.target.value);
                    if (relMult === '*..*' && !intermediateTable) {
                      setIntermediateTable(getSuggestedTableName(relFrom, e.target.value));
                    }
                  }}
                >
                  <option value="">Selecciona clase…</option>
                  {classes.filter((c) => c.id !== relFrom).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {relType === 'inheritance' ? (
                <div className="form-group" style={{ opacity: 0.85, fontSize: '0.74rem', color: 'var(--color-text-2)', padding: '6px 8px', background: 'var(--color-surface-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--color-border)' }}>
                  ◁ <strong>Generalización UML:</strong> La clase hija hereda atributos y se conecta con flecha triangular vacía hacia el padre.
                </div>
              ) : (relType === 'aggregation' || relType === 'composition') ? (
                <div className="form-group">
                  <label className="form-label" htmlFor="rel-mult">Multiplicidad</label>
                  <select
                    id="rel-mult"
                    className="form-select"
                    value="1..*"
                    disabled
                    style={{ opacity: 0.9, cursor: 'not-allowed', background: 'rgba(255,255,255,0.05)' }}
                  >
                    <option value="1..*">1 a muchos (1..*) — Fija por regla UML</option>
                  </select>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-accent)', display: 'block', marginTop: '4px', lineHeight: 1.3 }}>
                    {relType === 'composition' ? '◆' : '◇'} En {relType === 'composition' ? 'composición' : 'agregación'} la multiplicidad es estrictamente <strong>1 a muchos (1..*)</strong>: 1 contenedor posee muchos componentes.
                  </span>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label" htmlFor="rel-mult">Multiplicidad</label>
                  <select
                    id="rel-mult"
                    className="form-select"
                    value={relMult}
                    onChange={(e) => {
                      setRelMult(e.target.value);
                      if (e.target.value.includes('*') && !intermediateTable) {
                        setIntermediateTable(getSuggestedTableName(relFrom, relTo));
                      }
                    }}
                  >
                    <option value="0..*..1..*">0..* a 1..* (N:M con Clase Intermedia)</option>
                    <option value="1..*..1..*">1..* a 1..* (N:M con Clase Intermedia)</option>
                    <option value="0..*..0..*">0..* a 0..* (N:M con Clase Intermedia)</option>
                    <option value="*..*">* a * (N:M con Clase Intermedia)</option>
                    <option value="1..*">1 a muchos (1..*)</option>
                    <option value="1..1">Uno a uno (1..1)</option>
                    <option value="0..1">Cero a uno (0..1)</option>
                    <option value="0..*">Cero a muchos (0..*)</option>
                  </select>
                </div>
              )}

              {relType !== 'inheritance' && relType !== 'aggregation' && relType !== 'composition' &&
                (relMult.includes('*..*') || relMult.includes('..*')) && (
                <div className="form-group">
                  <label className="form-label" htmlFor="rel-intermediate">
                    Nombre Clase Intermedia
                  </label>
                  <input
                    id="rel-intermediate"
                    type="text"
                    className="form-input"
                    placeholder={getSuggestedTableName(relFrom, relTo) || 'Detalle_DocTrib'}
                    value={intermediateTable}
                    onChange={(e) => setIntermediateTable(e.target.value)}
                  />
                  <span style={{ fontSize: '0.70rem', color: 'var(--color-accent)', display: 'block', marginTop: '3px', lineHeight: 1.3 }}>
                    ✦ Genera automáticamente la clase intermedia con <code>id: Long</code> y conexión discontinua en el lienzo.
                  </span>
                </div>
              )}

              <button type="submit" className="btn btn-secondary w-full">
                <LinkIcon /> Crear Relación
              </button>
            </form>

            {relations.length > 0 && (
              <div style={{ marginTop: 'var(--sp-3)' }}>
                <p className="sidebar-label">Relaciones ({relations.length})</p>
                <div className="class-list" role="list">
                  {relations.map((rel) => (
                    <div key={rel.id} className="class-list-item" role="listitem">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                        <div className="class-list-item-name" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span>{rel.fromName} → {rel.toName}</span>
                          <span className={`rel-badge rel-badge-${rel.relationType || 'association'}`}>
                            {rel.relationType === 'composition' && '◆ Composición'}
                            {rel.relationType === 'aggregation' && '◇ Agregación'}
                            {rel.relationType === 'inheritance' && '◁ Herencia'}
                            {(!rel.relationType || rel.relationType === 'association') && '― Asociación'}
                          </span>
                        </div>
                        <div className="class-list-item-meta" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {rel.relationType !== 'inheritance' && <span>Mult: {rel.mult}</span>}
                          {rel.intermediateTableName && (
                            <span className="rel-tag-table">[{rel.intermediateTableName}]</span>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => deleteRelation(rel.id)}
                        aria-label={`Eliminar relación ${rel.fromName} → ${rel.toName}`}
                        title="Eliminar relación"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Acciones principales */}
        <section className="sidebar-section" style={{ marginTop: 'auto' }}>
          <p className="sidebar-label">Acciones</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <button
              className="btn btn-success w-full"
              onClick={handleSave}
              disabled={saving}
              aria-busy={saving}
            >
              <SaveIcon />
              {saving ? 'Guardando…' : 'Guardar en BD'}
            </button>

            <button
              className="btn btn-secondary w-full"
              onClick={() => setShowPreview(true)}
              disabled={classes.length === 0}
            >
              <CodeIcon />
              Previsualizar Código
            </button>

            <button
              className="btn btn-primary w-full"
              onClick={handleExportZip}
              disabled={exporting}
              aria-busy={exporting}
            >
              <ZipIcon />
              {exporting ? 'Generando…' : 'Descargar Backend (.ZIP)'}
            </button>

            <button
              className="btn btn-secondary w-full"
              onClick={handleExportPostman}
              disabled={exportingPostman || classes.length === 0}
              aria-busy={exportingPostman}
              title="Exportar colección de Postman v2.1.0 con peticiones CRUD preconfiguradas"
            >
              <PostmanIcon />
              {exportingPostman ? 'Generando Postman…' : 'Exportar Postman'}
            </button>
          </div>
        </section>
      </aside>

      {showPreview && (
        <CodeModal onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}
function SaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  );
}
function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  );
}
function ZipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
function PostmanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}
