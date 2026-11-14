import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'terang' | 'gelap';

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'lembar_pantau_theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyThemeToDOM(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'gelap') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: ThemeMode;
}) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (initialTheme) return initialTheme;
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'gelap' || saved === 'terang') {
        return saved;
      }
    }
    return 'terang';
  });

  useEffect(() => {
    applyThemeToDOM(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Abaikan jika penyimpanan lokal dibatasi
    }
  }, [theme]);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'terang' ? 'gelap' : 'terang'));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'gelap',
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme harus digunakan di dalam ThemeProvider');
  }
  return ctx;
}
