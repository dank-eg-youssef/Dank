import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  applyDocumentLanguage,
  DEFAULT_LANGUAGE,
  getStoredLanguage,
  getTranslations,
  LANG_STORAGE_KEY,
  type Translations,
} from '../i18n';
import type { AppLanguage } from '../types/era';
import { useAuth } from './AuthContext';

interface LanguageContextValue {
  language: AppLanguage;
  isRtl: boolean;
  t: Translations;
  setLanguage: (lang: AppLanguage) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, isVerified, profile, updateUserProfile } = useAuth();
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const initial = getStoredLanguage();
    applyDocumentLanguage(initial);
    return initial;
  });

  const syncedUidRef = useRef<string | null>(null);
  const languageRef = useRef<AppLanguage>(language);
  languageRef.current = language;

  // Apply dir, lang, and font family synchronously on every language change
  useLayoutEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  // Keep synced with localStorage and Firestore user profile.language across login/logout
  useEffect(() => {
    if (!firebaseUser || !isVerified) {
      syncedUidRef.current = null;
      return;
    }
    if (!profile) return;

    if (syncedUidRef.current !== profile.uid) {
      syncedUidRef.current = profile.uid;
      if (profile.language === 'ar' || profile.language === 'en') {
        if (profile.language !== languageRef.current) {
          setLanguageState(profile.language);
          applyDocumentLanguage(profile.language);
        }
        try {
          localStorage.setItem(LANG_STORAGE_KEY, profile.language);
        } catch {
          // ignore storage error
        }
      } else {
        // Backfill missing language field in Firestore for legacy accounts
        const chosen = getStoredLanguage() || DEFAULT_LANGUAGE;
        void updateUserProfile({ language: chosen }).catch(() => {
          // non-fatal background sync
        });
      }
    }
  }, [firebaseUser, isVerified, profile, updateUserProfile]);

  const setLanguage = useCallback(
    async (next: AppLanguage) => {
      setLanguageState(next);
      applyDocumentLanguage(next);
      try {
        localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        // ignore storage error
      }

      if (firebaseUser && isVerified && profile) {
        syncedUidRef.current = profile.uid;
        try {
          await updateUserProfile({ language: next });
        } catch {
          // Keep instant UI switch even if network is momentarily offline
        }
      }
    },
    [firebaseUser, isVerified, profile, updateUserProfile]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      isRtl: language === 'ar',
      t: getTranslations(language),
      setLanguage,
    }),
    [language, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used inside a LanguageProvider');
  }
  return ctx;
}
