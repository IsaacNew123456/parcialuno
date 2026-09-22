import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import LoginModal from './LoginModal.jsx';

export default function LandingPage() {
  const { loginDemo } = useAuth();
  const addToast = useToast();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleFastLogin = (role = 'ANFITRION') => {
    loginDemo(role);
    addToast('Sesión demo iniciada con éxito. ¡Bienvenido al canvas UML!', 'success');
  };

  return (
    <div className="landing-container">
      {/* Barra de navegación superior de la Landing */}
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="brand-icon" aria-hidden="true">⬡</span>
          <div className="landing-brand-text">
            <strong>CASE Studio AI</strong>
            <span className="landing-badge">UML 2.5</span>
          </div>
        </div>

        <div className="landing-nav-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => handleFastLogin('COLABORADOR')}
          >
            Demo Colaborador
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowLoginModal(true)}
          >
            Iniciar Sesión
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="landing-hero">
        <div className="landing-hero-badge">
          <span className="sparkle">✦</span> Plataforma de Modelado Colaborativo y Generación Automática
        </div>

        <h1 className="landing-title">
          CASE Studio AI
          <span className="landing-title-sub">
            Plataforma de Modelado Colaborativo y Generación Automática
          </span>
        </h1>

        <p className="landing-subtitle">
          Diseña diagramas de clases UML interactivos con soporte colaborativo en tiempo real,
          genera automáticamente backends robustos en <strong>Spring Boot 3</strong> con <strong>PostgreSQL</strong>,
          exporta colecciones <strong>Postman v2.1</strong> y sincroniza con <strong>Enterprise Architect (XMI 2.1)</strong>.
        </p>

        <div className="landing-cta-group">
          <button
            type="button"
            className="btn btn-hero-primary"
            onClick={() => setShowLoginModal(true)}
            id="btn-landing-access"
          >
            <RocketIcon /> Acceder a la Plataforma / Iniciar Sesión
          </button>

          <button
            type="button"
            className="btn btn-hero-secondary"
            onClick={() => handleFastLogin('ANFITRION')}
            id="btn-landing-fast-demo"
          >
            Entrar como Demo Rápido (Anfitrión)
          </button>
        </div>

        {/* Mockup interactivo del lienzo UML */}
        <div className="landing-mockup-wrapper">
          <div className="landing-mockup-glass">
            <div className="landing-mockup-bar">
              <div className="landing-mockup-dots">
                <span className="mock-dot red"></span>
                <span className="mock-dot yellow"></span>
                <span className="mock-dot green"></span>
              </div>
              <span className="landing-mockup-url">https://casestudio.ai/app/editor/ecommerce-model</span>
              <div className="landing-mockup-status">
                <span className="dot"></span> En vivo (WebSockets)
              </div>
            </div>

            <div className="landing-mockup-canvas">
              {/* Tarjeta Mockup Cliente */}
              <div className="mock-card mock-card-1">
                <div className="mock-card-header">
                  <span className="mock-stereotype">«entity»</span>
                  <strong>Cliente</strong>
                </div>
                <div className="mock-card-body">
                  <div>+ id: Long [PK]</div>
                  <div>+ nombre: String</div>
                  <div>+ email: String</div>
                </div>
              </div>

              {/* Conector SVG simulado */}
              <svg className="mock-svg-line" viewBox="0 0 400 120">
                <path d="M 170 50 Q 250 20 330 50" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="4 2" />
                <text x="250" y="25" fill="var(--color-accent)" fontSize="11" textAnchor="middle">1..* (Asociación)</text>
              </svg>

              {/* Tarjeta Mockup Pedido */}
              <div className="mock-card mock-card-2">
                <div className="mock-card-header">
                  <span className="mock-stereotype">«entity»</span>
                  <strong>Pedido</strong>
                </div>
                <div className="mock-card-body">
                  <div>+ id: Long [PK]</div>
                  <div>+ fecha: LocalDate</div>
                  <div>+ total: BigDecimal</div>
                  <div>+ clienteId: Long [FK]</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sección de características principales */}
        <section className="landing-features" aria-label="Características destacadas">
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'rgba(91, 141, 238, 0.15)', color: 'var(--color-accent)' }}>
                <UmlIcon />
              </div>
              <h3>Modelado UML Visual Reactivo</h3>
              <p>
                Crea clases y relaciones arrastrando nodos en el canvas interactivo. Conexiones bezier calculadas al vuelo, tipado de atributos y multiplicidades UML 2.5 (1..*, *..1).
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'rgba(62, 207, 142, 0.15)', color: 'var(--color-success)' }}>
                <SpringIcon />
              </div>
              <h3>Generación Spring Boot 3</h3>
              <p>
                Descarga un proyecto Maven completo y compilable con 4 capas limpias: JPA Entities, Repositories Spring Data, Services con lógica CRUD y Controllers REST documentados.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'rgba(244, 169, 72, 0.15)', color: 'var(--color-warning)' }}>
                <PostmanIcon />
              </div>
              <h3>Swagger OpenAPI & Postman v2.1</h3>
              <p>
                Generación automática de colecciones Postman v2.1 con payloads de prueba y dependencias SpringDoc OpenAPI 3 configuradas para pruebas inmediatas de los endpoints.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'rgba(155, 114, 240, 0.15)', color: 'var(--color-purple)' }}>
                <DbIcon />
              </div>
              <h3>PostgreSQL & Esquema DDL</h3>
              <p>
                Persistencia integral de diagramas en base de datos PostgreSQL, generación automática de scripts DDL `schema.sql` con claves primarias, foráneas y restricciones.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'rgba(229, 82, 82, 0.15)', color: 'var(--color-danger)' }}>
                <EaIcon />
              </div>
              <h3>Interoperabilidad XMI (Enterprise Architect)</h3>
              <p>
                Importa y exporta modelos estándar en formato XMI 2.1 compatibles con Enterprise Architect, preservando nombres, atributos, tipos y relaciones.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'rgba(62, 207, 142, 0.15)', color: 'var(--color-success)' }}>
                <VoiceIcon />
              </div>
              <h3>Comandos de Voz con IA</h3>
              <p>
                Crea entidades y define atributos tipados hablando en lenguaje natural mediante la Web Speech API integrada directamente con el lienzo.
              </p>
            </div>
          </div>
        </section>

        {/* Sección de perfiles y roles demo */}
        <section className="landing-roles-section">
          <h2>Perfiles y Roles Demo Disponibles</h2>
          <p className="roles-subtitle">Acceso inmediato sin registros complejos ni validaciones bloqueantes:</p>

          <div className="roles-demo-cards">
            <div className="role-demo-box">
              <div className="role-demo-badge" style={{ background: 'var(--color-purple)' }}>Arquitecto</div>
              <h3>Anfitrión / Arquitecto de Software</h3>
              <p>Control total de la arquitectura: diseño en canvas, persistencia en PostgreSQL, generación y descarga de código Spring Boot y exportación XMI.</p>
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={() => handleFastLogin('ANFITRION')}
              >
                Entrar como Anfitrión
              </button>
            </div>

            <div className="role-demo-box">
              <div className="role-demo-badge" style={{ background: 'var(--color-success)' }}>Colaborador</div>
              <h3>Colaborador / Ingeniero de Datos</h3>
              <p>Perfil enfocado en modelado y análisis de datos: creación y ajuste de entidades, tipos de datos y relaciones colaborativas en tiempo real.</p>
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={() => handleFastLogin('COLABORADOR')}
              >
                Entrar como Colaborador
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <p>© 2026 CASE Studio AI — Modelado de Clases UML & Generación Automática Spring Boot 3</p>
      </footer>

      {/* Modal de Login Demo */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
}

function RocketIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
    </svg>
  );
}

function UmlIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="8" y="14" width="8" height="7" rx="1"/>
      <line x1="6.5" y1="10" x2="6.5" y2="17.5"/>
      <line x1="6.5" y1="17.5" x2="8" y2="17.5"/>
      <line x1="17.5" y1="10" x2="17.5" y2="17.5"/>
      <line x1="17.5" y1="17.5" x2="16" y2="17.5"/>
    </svg>
  );
}

function SpringIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.73-.73"/>
    </svg>
  );
}

function PostmanIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="12 8 8 12 12 16 16 12 12 8"/>
    </svg>
  );
}

function DbIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  );
}

function EaIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  );
}

function VoiceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}
