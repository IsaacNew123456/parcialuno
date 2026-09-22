import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const DEMO_PROFILES = {
  ANFITRION: {
    id: 'usr_anfitrion_1',
    name: 'Ing. Juan Pérez',
    email: 'admin@casestudio.com',
    passwordDefault: 'admin123',
    role: 'ANFITRION',
    roleTitle: 'Anfitrión / Arquitecto de Software',
    roleBadge: 'Anfitrión',
    avatar: 'JP',
    color: '#9b72f0',
    permissions: {
      design: true,
      saveDb: true,
      exportCode: true,
      exportXmi: true,
      importXmi: true,
    },
    permissionsDesc: 'Permisos completos: diseño, guardado en BD, exportar código y XMI',
  },
  COLABORADOR: {
    id: 'usr_colaborador_2',
    name: 'Lic. María Gómez',
    email: 'colaborador@casestudio.com',
    passwordDefault: 'colab123',
    role: 'COLABORADOR',
    roleTitle: 'Colaborador / Ingeniero de Datos',
    roleBadge: 'Colaborador',
    avatar: 'MG',
    color: '#3ecf8e',
    permissions: {
      design: true,
      saveDb: true,
      exportCode: false,
      exportXmi: true,
      importXmi: true,
    },
    permissionsDesc: 'Permisos de diseño y edición colaborativa en canvas',
  },
};

const STORAGE_KEY = 'case_studio_active_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return null;
  });

  const login = (userData) => {
    setUser(userData);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    } catch {
      // ignore
    }
  };

  const loginDemo = (roleKey = 'ANFITRION') => {
    const profile = DEMO_PROFILES[roleKey] || DEMO_PROFILES.ANFITRION;
    login(profile);
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, loginDemo, logout, DEMO_PROFILES }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export default AuthContext;
