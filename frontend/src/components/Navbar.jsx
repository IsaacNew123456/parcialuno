import { useState, useEffect, useRef } from 'react';
import useUmlStore from '../store/useUmlStore.js';
import {
  getDiagrams,
  getDiagramById,
  exportDiagramXmi,
  exportPostmanCollection,
  importDiagramXmi,
  saveDiagram,
  updateDiagram,
  exportBackendZip,
} from '../services/api.js';
import { generateLocalZip } from '../services/zipExporter.js';
import { useToast } from '../context/ToastContext.jsx';
import useSpeechRecognition from '../hooks/useSpeechRecognition.js';
import { onWebSocketStatus } from '../services/websocketService.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const {
    diagramName,
    setDiagramName,
    diagramId,
    classes,
    relations,
    addClass,
    applyAiMutation,
    loadDiagram,
    resetCanvas,
  } = useUmlStore();
  const addToast = useToast();

  const [showDiagrams, setShowDiagrams] = useState(false);
  const [diagrams, setDiagrams] = useState([]);
  const [loadingDiagrams, setLoading] = useState(false);
  const [importingXmi, setImportingXmi] = useState(false);
  const [exportingXmi, setExportingXmi] = useState(false);
  const [exportingPostman, setExportingPostman] = useState(false);

  const fileInputRef = useRef(null);

  async function handleSaveDiagramVoice() {
    if (!diagramName.trim()) {
      addToast('Asigna un nombre al diagrama antes de guardar', 'warning');
      return;
    }
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
    }
  }

  async function handleDownloadProjectVoice() {
    if (!classes || classes.length === 0) {
      addToast('Agrega al menos una clase antes de exportar', 'warning');
      return;
    }
    const model = { name: diagramName, classes, relations };
    try {
      await exportBackendZip(model);
      addToast('ZIP descargado desde backend Spring Boot ✓', 'success');
    } catch {
      try {
        await generateLocalZip(model);
        addToast('ZIP descargado localmente con éxito ✓', 'success');
      } catch (err) {
        addToast(`Error al descargar backend: ${err.message}`, 'error');
      }
    }
  }

  async function handleExportXmi() {
    if (!classes || classes.length === 0) {
      addToast('No hay clases para exportar a XMI', 'warning');
      return;
    }

    setExportingXmi(true);
    try {
      await exportDiagramXmi({
        name: diagramName,
        classes,
        relations,
      });
      addToast(`Diagrama "${diagramName}" exportado a formato XMI (Enterprise Architect) ✓`, 'success');
    } catch (err) {
      addToast(`Error al exportar XMI: ${err.message}`, 'error');
    } finally {
      setExportingXmi(false);
    }
  }

  async function handleExportPostman() {
    if (!classes || classes.length === 0) {
      addToast('No hay clases para exportar a Postman', 'warning');
      return;
    }

    setExportingPostman(true);
    try {
      await exportPostmanCollection({
        name: diagramName,
        classes,
        relations,
      });
      addToast(`Colección de Postman para "${diagramName}" descargada con éxito ✓`, 'success');
    } catch (err) {
      addToast(`Error al exportar a Postman: ${err.message}`, 'error');
    } finally {
      setExportingPostman(false);
    }
  }

  const { voiceState, isListening, isProcessing, toggleListening, isSupported } = useSpeechRecognition({
    currentClasses: (classes || []).map((c) => c.name),
    onApplyMutation: applyAiMutation,
    onAddClass: (name, attrs) => addClass(name, attrs),
    onSaveDiagram: handleSaveDiagramVoice,
    onDownloadProject: handleDownloadProjectVoice,
    onExportXmi: handleExportXmi,
    onResetCanvas: () => {
      resetCanvas();
      addToast('Lienzo reiniciado', 'info');
    },
    onToast: (msg, variant, duration) => addToast(msg, variant, duration),
  });


  async function openDiagramsModal() {
    setShowDiagrams(true);
    setLoading(true);
    try {
      const data = await getDiagrams();
      setDiagrams(data);
    } catch {
      addToast('No se pudo conectar al backend para cargar diagramas', 'error');
      setDiagrams([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadDiagram(id) {
    try {
      const data = await getDiagramById(id);
      loadDiagram(data);
      setShowDiagrams(false);
      addToast(`Diagrama "${data.name}" cargado ✓`, 'success');
    } catch {
      addToast('Error al cargar el diagrama', 'error');
    }
  }

  async function handleImportXmi(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingXmi(true);
    try {
      const imported = await importDiagramXmi(file);
      loadDiagram(imported);
      const classCount = imported.classes?.length ?? 0;
      const relCount = imported.relations?.length ?? 0;
      addToast(`Diagrama "${imported.name || 'Importado'}" cargado con éxito (${classCount} clases, ${relCount} relaciones) ✓`, 'success');
    } catch (err) {
      addToast(`Error al importar XMI: ${err.message}`, 'error');
    } finally {
      setImportingXmi(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const [wsStatus, setWsStatus] = useState('DISCONNECTED');

  useEffect(() => {
    return onWebSocketStatus((status) => setWsStatus(status));
  }, []);

  return (
    <>
      <nav className="navbar" role="banner">
        <div className="navbar-brand">
          <span className="brand-icon" aria-hidden="true">⬡</span>
          CASE UML Studio
          <span className="brand-sub">v2.0</span>
        </div>

        <input
          className="navbar-diagram-name"
          type="text"
          value={diagramName}
          onChange={(e) => setDiagramName(e.target.value)}
          aria-label="Nombre del diagrama"
          placeholder="Nombre del diagrama…"
        />

        <div className="navbar-spacer" />

        <div className="navbar-actions">
          <div
            className={`session-badge ${voiceState !== 'idle' ? voiceState : ''}`}
            role="status"
            aria-label={
              isListening
                ? 'Reconocimiento de voz activo'
                : isProcessing
                ? 'Procesando comando con IA'
                : `Estado colaborativo: ${wsStatus}`
            }
          >
            <span
              className={`dot ${isListening ? 'recording' : isProcessing ? 'processing' : ''}`}
              style={
                voiceState === 'idle' && wsStatus !== 'CONNECTED'
                  ? { background: wsStatus === 'CONNECTING' ? 'var(--color-warning)' : 'var(--color-text-3)' }
                  : undefined
              }
              aria-hidden="true"
            />
            {isListening
              ? 'Escuchando...'
              : isProcessing
              ? 'Procesando con IA...'
              : wsStatus === 'CONNECTED'
              ? 'En vivo (WebSocket)'
              : wsStatus === 'CONNECTING'
              ? 'Conectando...'
              : 'Modo local (REST)'}
          </div>

          <button
            className={`btn btn-mic ${voiceState}`}
            onClick={toggleListening}
            disabled={isProcessing}
            aria-label={
              isListening
                ? 'Detener micrófono'
                : isProcessing
                ? 'Procesando comando por IA'
                : 'Activar comandos de voz'
            }
            aria-pressed={isListening}
            title={
              isListening
                ? 'Detener micrófono (Escuchando...)'
                : isProcessing
                ? 'Procesando comando por IA...'
                : 'Comandos de voz por IA'
            }
          >
            <MicIcon state={voiceState} />
          </button>


          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportXmi}
            accept=".xmi,.xml"
            style={{ display: 'none' }}
          />

          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importingXmi}
            aria-label="Importar archivo XMI"
            title="Importar modelo UML desde archivo .xmi / .xml (Enterprise Architect)"
          >
            <ImportIcon />
            {importingXmi ? 'Importando…' : 'Importar XMI'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleExportXmi}
            disabled={exportingXmi}
            aria-label="Exportar a XMI"
            title="Exportar diagrama en formato estándar XMI 2.1 (Enterprise Architect)"
          >
            <ExportIcon />
            {exportingXmi ? 'Exportando…' : 'Exportar XMI'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleExportPostman}
            disabled={exportingPostman}
            aria-label="Exportar a Postman"
            title="Exportar colección de Postman v2.1.0 con peticiones CRUD preconfiguradas"
          >
            <PostmanIcon />
            {exportingPostman ? 'Exportando…' : 'Postman'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={openDiagramsModal}
            aria-label="Cargar diagramas guardados"
          >
            <FolderIcon />
            Cargar
          </button>

          <button
            className="btn btn-ghost"
            onClick={() => {
              resetCanvas();
              addToast('Lienzo reiniciado', 'info');
            }}
            aria-label="Nuevo diagrama"
            title="Nuevo diagrama"
          >
            <NewIcon />
          </button>

          {user && (
            <div
              className="navbar-user-badge"
              title={`Usuario: ${user.email} · ${user.permissionsDesc || ''}`}
              role="status"
            >
              <div
                className="navbar-user-avatar"
                style={{ background: user.color || 'var(--color-accent)' }}
                aria-hidden="true"
              >
                {user.avatar || 'U'}
              </div>
              <div className="navbar-user-info">
                <span className="navbar-user-name">{user.name}</span>
                <span
                  className="navbar-user-role-tag"
                  style={{
                    background: user.role === 'ANFITRION' ? 'rgba(155, 114, 240, 0.2)' : 'rgba(62, 207, 142, 0.2)',
                    color: user.role === 'ANFITRION' ? 'var(--color-purple)' : 'var(--color-success)',
                  }}
                >
                  Rol: {user.roleBadge || user.role}
                </span>
              </div>
            </div>
          )}

          {user && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                logout();
                addToast('Sesión cerrada correctamente', 'info');
              }}
              aria-label="Cerrar sesión"
              title="Cerrar sesión y volver al inicio"
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              <LogoutIcon /> Salir
            </button>
          )}
        </div>
      </nav>

      {showDiagrams && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Diagramas guardados"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDiagrams(false); }}
        >
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 className="modal-title">Diagramas guardados</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowDiagrams(false)} aria-label="Cerrar">
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              {loadingDiagrams ? (
                <div style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: '2rem' }}>
                  Cargando…
                </div>
              ) : diagrams.length === 0 ? (
                <div role="status" style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: '2rem' }}>
                  <p>No hay diagramas guardados aún.</p>
                  <p style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
                    Asegúrate de que el backend Spring Boot esté corriendo en :8080.
                  </p>
                </div>
              ) : (
                <div className="diagram-list">
                  {diagrams.map((d) => (
                    <button
                      key={d.id}
                      className="diagram-list-item"
                      onClick={() => handleLoadDiagram(d.id)}
                      aria-label={`Cargar diagrama ${d.name}`}
                    >
                      <div className="diagram-list-item-info">
                        <span className="diagram-list-item-name">{d.name}</span>
                        <span className="diagram-list-item-meta">
                          ID #{d.id} · {d.classes?.length ?? 0} clases · {formatDate(d.createdAt)}
                        </span>
                      </div>
                      <LoadIcon />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MicIcon({ state = 'idle' }) {
  if (state === 'processing') {
    return (
      <svg className="spin-slow" width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="var(--color-primary-light, #60a5fa)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    );
  }

  const isListening = state === 'listening';

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={isListening ? 'var(--color-danger, #ef4444)' : 'currentColor'} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}


function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function NewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function LoadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-4.51"/>
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
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

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
