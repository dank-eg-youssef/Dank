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
  {
    id: 'light',
    canvas: '#FFFFFF',
    surface: '#F4F5F7',
    accent: '#3B82F6',
    secondaryAccent: '#DBEAFE',
    isDark: false,
  },
];

const VALID_THEME_IDS = new Set<AppThemeId>(['arcade', 'light']);

const THEME_STORAGE_KEY = 'dank_theme';

export function normalizeThemeId(raw: unknown): AppThemeId | null {
  if (raw === 'light') return 'light';
  if (
    raw === 'arcade' ||
    raw === 'dark' ||
    raw === 'dank-dark' ||
    raw === 'midnight-blue' ||
    raw === 'purple-neon'
  ) {
    return 'arcade';
  }
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
      if (saved !== normalized) {
        localStorage.setItem(THEME_STORAGE_KEY, normalized);
      }
      return normalized;
    }
  } catch {
    // ignore storage access issues
  }
  return 'arcade';
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
    const normalized = normalizeThemeId(next) || 'arcade';
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
    setTheme(theme === 'light' ? 'arcade' : 'light');
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
