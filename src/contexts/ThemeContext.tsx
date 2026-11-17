import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AppThemeId } from '../types/dank';

export type AppTheme = AppThemeId;

export interface ThemePresetMeta {
  id: AppThemeId;
  canvas: string;
  surface: string;
  accent: string;
  isDark: boolean;
}

export const THEME_OPTIONS: ThemePresetMeta[] = [
  {
    id: 'dank-dark',
    canvas: '#121212',
    surface: '#1E1E1E',
    accent: '#1DB954',
    isDark: true,
  },
  {
    id: 'midnight-blue',
    canvas: '#0A1628',
    surface: '#11223D',
    accent: '#2E86FF',
    isDark: true,
  },
  {
    id: 'purple-neon',
    canvas: '#121212',
    surface: '#1E1E1E',
    accent: '#A855F7',
    isDark: true,
  },
  {
    id: 'light',
    canvas: '#F2F7FF',
    surface: '#FFFFFF',
    accent: '#1DB954',
    isDark: false,
  },
];

const VALID_THEME_IDS = new Set<AppThemeId>([
  'dank-dark',
  'midnight-blue',
  'purple-neon',
  'light',
]);

const THEME_STORAGE_KEY = 'dank_theme';

export function normalizeThemeId(raw: unknown): AppThemeId | null {
  if (raw === 'dark') return 'dank-dark';
  if (typeof raw === 'string' && VALID_THEME_IDS.has(raw as AppThemeId)) {
    return raw as AppThemeId;
  }
  return null;
}

interface ThemeContextValue {
  theme: AppThemeId;
  isDark: boolean;
  setTheme: (next: AppThemeId) => void;
  hydrateThemeFromProfile: (serverTheme?: AppThemeId | string | null) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveInitialTheme(): AppThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    const normalized = normalizeThemeId(saved);
    if (normalized) {
      if (saved === 'dark') {
        localStorage.setItem(THEME_STORAGE_KEY, normalized);
      }
      return normalized;
    }
  } catch {
    // ignore storage access issues
  }
  return 'dank-dark';
}

function applyThemeToDocument(theme: AppThemeId): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset.theme = theme;
  const isDark = theme !== 'light';
  if (isDark) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const preset = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];
    metaTheme.setAttribute('content', preset.canvas);
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppThemeId>(() => resolveInitialTheme());

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((next: AppThemeId) => {
    const normalized = normalizeThemeId(next) || 'dank-dark';
    setThemeState(normalized);
    applyThemeToDocument(normalized);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
  }, []);

  const hydrateThemeFromProfile = useCallback(
    (serverTheme?: AppThemeId | string | null) => {
      const normalized = normalizeThemeId(serverTheme);
      if (!normalized) return;
      setThemeState(normalized);
      applyThemeToDocument(normalized);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, normalized);
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dank-dark' : 'light');
  }, [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme !== 'light',
      setTheme,
      hydrateThemeFromProfile,
      toggleTheme,
    }),
    [theme, setTheme, hydrateThemeFromProfile, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
