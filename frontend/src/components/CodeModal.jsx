import { useState, useEffect, useRef } from 'react';
import useUmlStore from '../store/useUmlStore.js';
import { previewCode } from '../services/zipExporter.js';

const TABS = [
  'schema.sql',
  'Entity (1ª clase)',
  'Repository',
  'Service',
  'Controller',
  'application.properties',
  'Dockerfile',
  'docker-compose.yml',
  'pom.xml',
];

export default function CodeModal({ onClose }) {
  const { classes, relations, diagramName } = useUmlStore();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const codeMap = previewCode({ name: diagramName, classes, relations });

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="code-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal">
        <div className="modal-header">
          <h2 id="code-modal-title" className="modal-title">
            Previsualización de Código Generado
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-3)' }}>
              {classes.length} clase{classes.length !== 1 ? 's' : ''}
            </span>
            <button
              ref={closeRef}
              className="btn btn-ghost btn-icon"
              onClick={onClose}
              aria-label="Cerrar previsualización"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="modal-tabs" role="tablist" aria-label="Archivos generados">
          {TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`tab-panel-${tab}`}
              className={`modal-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div
          className="modal-body"
          id={`tab-panel-${activeTab}`}
          role="tabpanel"
          aria-label={`Código ${activeTab}`}
        >
          {classes.length === 0 ? (
            <div role="status" style={{ color: 'var(--color-text-3)', textAlign: 'center', padding: '2rem' }}>
              Agrega al menos una clase para previsualizar el código.
            </div>
          ) : (
            <pre className="code-block">
              <code>{codeMap[activeTab] ?? '// No disponible'}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
