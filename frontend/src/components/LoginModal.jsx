import { useState } from 'react';
import { useAuth, DEMO_PROFILES } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function LoginModal({ isOpen, onClose }) {
  const { login, loginDemo } = useAuth();
  const addToast = useToast();

  const [selectedRole, setSelectedRole] = useState('ANFITRION');
  const [email, setEmail] = useState(DEMO_PROFILES.ANFITRION.email);
  const [password, setPassword] = useState(DEMO_PROFILES.ANFITRION.passwordDefault);

  if (!isOpen) return null;

  const handleRoleSelect = (roleKey) => {
    setSelectedRole(roleKey);
    const profile = DEMO_PROFILES[roleKey];
    if (profile) {
      setEmail(profile.email);
      setPassword(profile.passwordDefault);
    }
  };

  const handleQuickDemo = (roleKey = selectedRole) => {
    loginDemo(roleKey);
    const profile = DEMO_PROFILES[roleKey];
    addToast(`¡Bienvenido, ${profile.name}! Sesión iniciada como ${profile.roleBadge} ✓`, 'success');
    if (onClose) onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const baseProfile = DEMO_PROFILES[selectedRole] || DEMO_PROFILES.ANFITRION;
    const userData = {
      ...baseProfile,
      email: email.trim() || baseProfile.email,
    };
    login(userData);
    addToast(`¡Bienvenido! Sesión iniciada como ${userData.roleBadge} ✓`, 'success');
    if (onClose) onClose();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="modal login-modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="brand-icon" style={{ width: 24, height: 24, fontSize: 12 }} aria-hidden="true">⬡</span>
              <h2 id="login-modal-title" className="modal-title" style={{ fontSize: '1.15rem' }}>
                Acceso a CASE Studio AI
              </h2>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-3)', marginTop: '0.25rem' }}>
              Selecciona tu perfil de rol demo para ingresar inmediatamente a la plataforma.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Cerrar ventana de acceso"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {/* Selector visual de Perfil / Rol */}
          <div>
            <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
              Seleccionar Perfil / Rol Demo:
            </label>
            <div className="role-selector-grid">
              {Object.entries(DEMO_PROFILES).map(([key, prof]) => {
                const isSelected = selectedRole === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`role-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleRoleSelect(key)}
                    aria-pressed={isSelected}
                  >
                    <div className="role-card-header">
                      <div className="role-avatar" style={{ background: prof.color }}>
                        {prof.avatar}
                      </div>
                      <div className="role-card-title">
                        <strong>{prof.roleBadge}</strong>
                        <span className="role-name">{prof.name}</span>
                      </div>
                      {isSelected && <span className="role-check">✓</span>}
                    </div>
                    <p className="role-card-desc">{prof.permissionsDesc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Formulario de credenciales prellenadas */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group" style={{ marginBottom: 'var(--sp-3)' }}>
              <label className="form-label" htmlFor="login-email">Correo Electrónico</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ej. admin@casestudio.com"
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--sp-4)' }}>
              <label className="form-label" htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {/* Acciones del formulario */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {/* Botón destacado de 1 clic */}
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => handleQuickDemo(selectedRole)}
                style={{
                  background: 'linear-gradient(135deg, var(--color-accent), var(--color-purple))',
                  fontWeight: 600,
                  padding: '0.65rem 1rem',
                }}
              >
                Entrar como Demo ({DEMO_PROFILES[selectedRole]?.roleBadge})
              </button>

              <button type="submit" className="btn btn-secondary w-full">
                Iniciar Sesión
              </button>
            </div>
          </form>

          <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--color-text-3)' }}>
            Modo Demostración Rápido · Acceso instantáneo sin validaciones bloqueantes.
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
