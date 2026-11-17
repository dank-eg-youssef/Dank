import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AppThemeId } from '../types/dank';

export type AppTheme = AppThemeId;

export interface ThemePresetMeta {
  id: AppThemeId;
  canvas: string;
  surface: string;
  accent: string;
  secondaryAccent?: string;
  isDark: boolean;
}

export const THEME_OPTIONS: ThemePresetMeta[] = [
  {
    id: 'arcade',
    canvas: '#040409',
    surface: '#0B0B16',
    accent: '#A855F7',
    secondaryAccent: '#22D3EE',
    isDark: true,
  },
];

const THEME_STORAGE_KEY = 'dank_theme';

export function normalizeThemeId(raw: unknown): AppThemeId | null {
  if (
    raw === 'arcade' ||
    raw === 'light' ||
    raw === 'dark' ||
    raw === 'dank-dark' ||
    raw === 'midnight-blue' ||
    raw === 'purple-neon'
  ) {
    return 'arcade';
  }
  return null;
}

function readStoredTheme(): AppThemeId | null {
  try {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!saved) return null;
    if (saved !== 'arcade') {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'arcade');
    }
    return 'arcade';
  } catch {
    return null;
  }
}

function persistThemeToStorage(theme: AppThemeId): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // ignore storage errors
  }
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
  readStoredTheme();
  return 'arcade';
}

function applyThemeToDocument(theme: AppThemeId): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const preset = THEME_OPTIONS[0];
  html.dataset.theme = theme;
  html.style.colorScheme = 'dark';
  html.style.backgroundColor = preset.canvas;
  html.classList.add('dark');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', preset.canvas);
  }
}

// Apply arcade theme immediately before React mounts any screens
applyThemeToDocument(resolveInitialTheme());

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppThemeId>(() => resolveInitialTheme());

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      persistThemeToStorage('arcade');
      setThemeState('arcade');
      applyThemeToDocument('arcade');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setTheme = useCallback((_next: AppThemeId) => {
    persistThemeToStorage('arcade');
    applyThemeToDocument('arcade');
    setThemeState('arcade');
  }, []);

  const hydrateThemeFromProfile = useCallback(
    (_serverTheme?: AppThemeId | string | null) => {
      persistThemeToStorage('arcade');
      applyThemeToDocument('arcade');
      setThemeState('arcade');
    },
    []
  );

  const toggleTheme = useCallback(() => {
    setTheme('arcade');
  }, [setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: true,
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
