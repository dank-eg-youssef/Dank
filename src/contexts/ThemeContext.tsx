import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AppThemeId } from '../types/dank';

export type AppTheme = AppThemeId;
export type NeonThemeColor = 'purple' | 'cyan' | 'pink' | 'green' | 'red';

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

export const NEON_COLORS: { id: NeonThemeColor; labelEn: string; labelAr: string; hex: string }[] = [
  { id: 'purple', labelEn: 'Purple', labelAr: 'بنفسجي', hex: '#A855F7' },
  { id: 'cyan', labelEn: 'Cyan', labelAr: 'سماوي', hex: '#22D3EE' },
  { id: 'pink', labelEn: 'Pink', labelAr: 'بينك', hex: '#EC4899' },
  { id: 'green', labelEn: 'Neon Green', labelAr: 'أخضر نيون', hex: '#1DB954' },
  { id: 'red', labelEn: 'Fire Red', labelAr: 'أحمر ناري', hex: '#EF4444' },
];

const THEME_STORAGE_KEY = 'dank_theme';
const NEON_STORAGE_KEY = 'dank_neon_theme';

function readStoredNeon(): NeonThemeColor {
  try {
    if (typeof window === 'undefined') return 'purple';
    const saved = window.localStorage.getItem(NEON_STORAGE_KEY) as NeonThemeColor;
    if (saved === 'purple' || saved === 'cyan' || saved === 'pink' || saved === 'green' || saved === 'red') {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'purple';
}

function persistNeonToStorage(color: NeonThemeColor): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NEON_STORAGE_KEY, color);
    }
  } catch {
    // ignore
  }
}

interface ThemeContextValue {
  theme: AppThemeId;
  neonTheme: NeonThemeColor;
  isDark: boolean;
  setTheme: (next: AppThemeId) => void;
  setNeonTheme: (color: NeonThemeColor) => void;
  hydrateThemeFromProfile: (serverTheme?: AppThemeId | string | null, serverNeon?: NeonThemeColor | string | null) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyThemeToDocument(theme: AppThemeId, neon: NeonThemeColor): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const preset = THEME_OPTIONS[0];
  html.dataset.theme = theme;
  html.dataset.neon = neon;
  html.style.colorScheme = 'dark';
  html.style.backgroundColor = preset.canvas;
  html.classList.add('dark');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', preset.canvas);
  }
}

// Apply initial arcade theme + neon immediately before React mounts
applyThemeToDocument('arcade', readStoredNeon());

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppThemeId>('arcade');
  const [neonTheme, setNeonThemeState] = useState<NeonThemeColor>(() => readStoredNeon());

  useEffect(() => {
    applyThemeToDocument(theme, neonTheme);
  }, [theme, neonTheme]);

  const setNeonTheme = useCallback((color: NeonThemeColor) => {
    persistNeonToStorage(color);
    setNeonThemeState(color);
    applyThemeToDocument('arcade', color);
  }, []);

  const setTheme = useCallback((_next: AppThemeId) => {
    setThemeState('arcade');
    applyThemeToDocument('arcade', neonTheme);
  }, [neonTheme]);

  const hydrateThemeFromProfile = useCallback(
    (_serverTheme?: AppThemeId | string | null, serverNeon?: NeonThemeColor | string | null) => {
      if (serverNeon && (serverNeon === 'purple' || serverNeon === 'cyan' || serverNeon === 'pink' || serverNeon === 'green' || serverNeon === 'red')) {
        setNeonTheme(serverNeon);
      }
    },
    [setNeonTheme]
  );

  const toggleTheme = useCallback(() => {
    setTheme('arcade');
  }, [setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      neonTheme,
      isDark: true,
      setTheme,
      setNeonTheme,
      hydrateThemeFromProfile,
      toggleTheme,
    }),
    [theme, neonTheme, setTheme, setNeonTheme, hydrateThemeFromProfile, toggleTheme]
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
