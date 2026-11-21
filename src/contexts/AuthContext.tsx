import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateFirebaseAuthProfile,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import {
  ensureEraTeamChannelForAdmin,
  ensureOfficialChannelForAdmin,
  ensureSavedMessagesChat,
  ensureUserInviteCode,
  ensureUserJoinedEraTeam,
  ensureUserJoinedOfficialChannel,
  getOrCreateLocalSessionId,
  redeemInviteCode,
  verifyTwoStepInput,
} from '../services/chatService';
import { getStoredLanguage, getTranslations } from '../i18n';
import type { AppLanguage, AppThemeId, UserPrivate, UserPublic } from '../types/era';
import type { NeonThemeColor } from './ThemeContext';
import {
  handleFirestoreError,
  isFirestoreWritesPaused,
  isOfflineError,
  isQuotaExhaustedError,
  OperationType,
  pauseFirestoreWrites,
} from '../utils/firestoreErrors';
import { sanitizeUsername, timestampToMs } from '../utils/timeFormat';

const ADMIN_EMAIL = 'youssefdankapp@gmail.com';
const EMAIL_VERIFICATION_BYPASS_EMAIL = 'dankapp@gmail.com';
const PENDING_PROFILE_KEY = 'era_pending_signup_profile';

function isUserAuthVerified(user: User | null): user is User {
  if (!user) return false;
  if (user.emailVerified) return true;
  return user.email?.trim().toLowerCase() === EMAIL_VERIFICATION_BYPASS_EMAIL;
}

interface AuthContextValue {
  user: User | null;
  firebaseUser: User | null;
  profile: UserPublic | null;
  privateProfile: UserPrivate | null;
  sessionId: string;
  sessionRevoked: boolean;
  twoStepLocked: boolean;
  unlockTwoStep: (input: string) => Promise<boolean>;
  loading: boolean;
  authReady: boolean;
  isVerified: boolean;
  isAdmin: boolean;
  profileError: string | null;
  retryProfileSync: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    name: string,
    username: string,
    inviteCode?: string
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<boolean>;
  updateUserProfile: (updates: {
    name?: string;
    username?: string;
    bio?: string;
    photoURL?: string;
    coverURL?: string;
    language?: AppLanguage;
    theme?: AppThemeId;
    neonTheme?: NeonThemeColor;
    ghostMode?: boolean;
  }) => Promise<void>;
  redeemReferralCode: (code: string) => Promise<void>;
  setActiveChatPresence: (chatId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [privateProfile, setPrivateProfile] = useState<UserPrivate | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sessionId] = useState<string>(() => getOrCreateLocalSessionId());
  const [sessionRevoked, setSessionRevoked] = useState(false);
  const [twoStepUnlockedMap, setTwoStepUnlockedMap] = useState<Record<string, boolean>>({});
  const [authRefreshTick, setAuthRefreshTick] = useState(0);

  const activeChatRef = useRef<string>('');
  const lastPresenceWriteRef = useRef<number>(0);
  const syncAttemptedUidRef = useRef<string | null>(null);
  const inFlightSyncUidRef = useRef<string | null>(null);

  const isVerified = isUserAuthVerified(firebaseUser);
  const isAdmin = Boolean(
    firebaseUser &&
      firebaseUser.emailVerified &&
      firebaseUser.email?.toLowerCase() === ADMIN_EMAIL
  );

  const isUnlockedForUid = useCallback(
    (uid: string) => {
      if (twoStepUnlockedMap[uid]) return true;
      try {
        return sessionStorage.getItem(`era_2fa_ok_${uid}`) === '1';
      } catch {
        return false;
      }
    },
    [twoStepUnlockedMap]
  );

  const twoStepLocked = Boolean(
    isVerified &&
      firebaseUser &&
      privateProfile?.twoStepEnabled &&
      !isUnlockedForUid(firebaseUser.uid)
  );

  const unlockTwoStep = useCallback(
    async (input: string) => {
      if (!firebaseUser || !privateProfile) return false;
      const ok = await verifyTwoStepInput(
        input,
        privateProfile.twoStepPasswordHash,
        privateProfile.twoStepCodeHash
      );
      if (ok) {
        setTwoStepUnlockedMap((prev) => ({ ...prev, [firebaseUser.uid]: true }));
        try {
          sessionStorage.setItem(`era_2fa_ok_${firebaseUser.uid}`, '1');
        } catch {
          // ignore
        }
      }
      return ok;
    },
    [firebaseUser, privateProfile]
  );

  // Ensure Firestore user documents exist for every verified user.
  const ensureUserProfileDocsOnce = useCallback(async (user: User) => {
    if (!isUserAuthVerified(user)) return;
    if (syncAttemptedUidRef.current === user.uid || inFlightSyncUidRef.current === user.uid) return;
    inFlightSyncUidRef.current = user.uid;

    const chosenLang = getStoredLanguage();
    let pendingName = '';
    let pendingUsername = '';
    let pendingInviteCode = '';
    try {
      const rawPending = sessionStorage.getItem(PENDING_PROFILE_KEY);
      if (rawPending) {
        const parsed = JSON.parse(rawPending) as {
          name?: string;
          username?: string;
          inviteCode?: string;
        };
        pendingName = parsed.name?.trim() || '';
        pendingUsername = parsed.username?.trim() || '';
        pendingInviteCode = parsed.inviteCode?.trim() || '';
      }
    } catch {}

    const fallbackName = (
      pendingName ||
      user.displayName?.trim() ||
      user.email?.split('@')[0] ||
      'ERA Member'
    ).slice(0, 80);
    const fallbackUsername = sanitizeUsername(
      pendingUsername || user.displayName || user.email?.split('@')[0] || user.uid.slice(0, 8)
    );

    let cachedPub: UserPublic | null = null;
    try {
      const raw = localStorage.getItem(`era_local_profile_${user.uid}`);
      if (raw) cachedPub = JSON.parse(raw) as UserPublic;
    } catch {}

    const fallbackProfile: UserPublic = cachedPub || {
      uid: user.uid,
      name: fallbackName,
      username: fallbackUsername,
      photoURL: user.photoURL || '',
      language: chosenLang,
      isOnline: true,
      lastSeen: null,
      createdAt: null,
      updatedAt: null,
      isAdmin: user.email?.toLowerCase() === ADMIN_EMAIL,
    };

    // Immediately set profile and unblock loading so layout appears without blocking
    setProfile(fallbackProfile);
    setLoading(false);
    setAuthReady(true);

    if (isFirestoreWritesPaused()) {
      inFlightSyncUidRef.current = null;
      return;
    }

    const pubRef = doc(db, 'users_public', user.uid);
    const privRef = doc(db, 'users_private', user.uid);

    const runSync = async () => {
      const [pubSnap, privSnap] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);

      if (pubSnap.exists()) {
        const pubData = pubSnap.data() as UserPublic;
        setProfile(pubData);
        try {
          localStorage.setItem(`era_local_profile_${user.uid}`, JSON.stringify(pubData));
        } catch {}
      }

      if (!isFirestoreWritesPaused()) {
        const batch = writeBatch(db);
        let hasWrites = false;

        if (!pubSnap.exists()) {
          batch.set(pubRef, {
            uid: user.uid,
            name: fallbackName,
            username: fallbackUsername,
            photoURL: user.photoURL || '',
            bio: getTranslations(chosenLang).errors.defaultBio,
            language: chosenLang,
            isOnline: true,
            lastSeen: serverTimestamp(),
            activeChatId: '',
            isAdmin: user.email?.toLowerCase() === ADMIN_EMAIL,
            isVerified: false,
            isBot: false,
            isPlus: false,
            friendsCount: 0,
            inviteCount: 0,
            isVip: false,
            isBanned: false,
            mutedUntil: null,
            hasPhone: false,
            privacyPhone: 'nobody',
            privacyLastSeen: 'everyone',
            privacyLastSeenExceptions: [],
            privacyProfilePhoto: 'everyone',
            privacyGroupAdd: 'everyone',
            privacyCall: 'everyone',
            privacyMessages: 'everyone',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          hasWrites = true;
        }

        if (!privSnap.exists()) {
          batch.set(privRef, {
            uid: user.uid,
            email: user.email || '',
            phone: '',
            twoStepEnabled: false,
            twoStepPasswordHash: '',
            twoStepCodeHash: '',
            twoStepHint: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          hasWrites = true;
        }

        if (hasWrites) {
          await batch.commit();
        }

        syncAttemptedUidRef.current = user.uid;

        if (pendingInviteCode) {
          try {
            await redeemInviteCode(user.uid, pendingInviteCode);
          } catch {}
        }
        try {
          sessionStorage.removeItem(PENDING_PROFILE_KEY);
        } catch {}

        if (user.email?.toLowerCase() === ADMIN_EMAIL) {
          await ensureOfficialChannelForAdmin(user.uid).catch(() => {});
          await ensureEraTeamChannelForAdmin(user.uid).catch(() => {});
        }
        await Promise.all([
          ensureUserJoinedOfficialChannel(user.uid),
          ensureUserJoinedEraTeam(user.uid),
          ensureSavedMessagesChat(fallbackProfile),
        ]).catch(() => {});
      }
    };

    try {
      await runSync();
    } catch (error) {
      const errCode = (error as { code?: string })?.code || '';
      const errMsg = error instanceof Error ? error.message.toLowerCase() : '';
      const looksLikePermission =
        errCode === 'permission-denied' ||
        errMsg.includes('permission-denied') ||
        errMsg.includes('missing or insufficient permissions');

      if (looksLikePermission && typeof user.getIdToken === 'function') {
        try {
          await user.getIdToken(true);
          await runSync();
          inFlightSyncUidRef.current = null;
          return;
        } catch (retryError) {
          console.warn('Profile sync retry after token refresh failed:', retryError);
        }
      }

      if (isQuotaExhaustedError(error)) {
        pauseFirestoreWrites();
        syncAttemptedUidRef.current = user.uid;
        setProfileError('Firestore free daily write quota reached. Running with cached profile.');
      } else if (isOfflineError(error)) {
        console.warn('Firestore offline during profile sync, using local profile cache.');
      } else {
        console.warn('Profile sync error (will allow retry):', error);
      }
    } finally {
      if (inFlightSyncUidRef.current === user.uid) {
        inFlightSyncUidRef.current = null;
      }
    }
  }, []);

  const retryProfileSync = useCallback(async () => {
    syncAttemptedUidRef.current = null;
    inFlightSyncUidRef.current = null;
    const activeUser = auth.currentUser || firebaseUser;
    if (!activeUser || !isUserAuthVerified(activeUser)) return;
    if (typeof activeUser.getIdToken === 'function') {
      await activeUser.getIdToken(true).catch(() => {});
    }
    setProfileError(null);
    await ensureUserProfileDocsOnce(activeUser);
  }, [ensureUserProfileDocsOnce, firebaseUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (!user) {
        syncAttemptedUidRef.current = null;
        inFlightSyncUidRef.current = null;
        setProfile(null);
        setPrivateProfile(null);
        setProfileError(null);
        setSessionRevoked(false);
        setAuthReady(true);
        setLoading(false);
        return;
      }

      if (isUserAuthVerified(user)) {
        void ensureUserProfileDocsOnce(user);
      } else {
        setProfile(null);
        setPrivateProfile(null);
        setProfileError(null);
        setAuthReady(true);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [ensureUserProfileDocsOnce]);

  // Listen to public & private user profiles + current session revocation in background
  useEffect(() => {
    if (!firebaseUser || !isUserAuthVerified(firebaseUser)) return;

    const uid = firebaseUser.uid;
    const unsubPub = onSnapshot(
      doc(db, 'users_public', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserPublic;
          setProfile(data);
          try {
            localStorage.setItem(`era_local_profile_${uid}`, JSON.stringify(data));
          } catch {}
        } else if (
          !isFirestoreWritesPaused() &&
          inFlightSyncUidRef.current !== uid &&
          syncAttemptedUidRef.current !== uid
        ) {
          void ensureUserProfileDocsOnce(firebaseUser);
        }
      },
      (error) => {
        if (isOfflineError(error)) return;
        handleFirestoreError(error, OperationType.GET, `users_public/${uid}`);
      }
    );

    const unsubPriv = onSnapshot(
      doc(db, 'users_private', uid),
      (snap) => {
        if (snap.exists()) {
          setPrivateProfile(snap.data() as UserPrivate);
        }
      },
      (error) => {
        if (isOfflineError(error)) return;
        handleFirestoreError(error, OperationType.GET, `users_private/${uid}`);
      }
    );

    return () => {
      unsubPub();
      unsubPriv();
    };
  }, [firebaseUser, isVerified, authRefreshTick, ensureUserProfileDocsOnce]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setSessionRevoked(false);
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      setFirebaseUser(cred.user);
      if (isUserAuthVerified(cred.user)) {
        await ensureUserProfileDocsOnce(cred.user);
      }
    },
    [ensureUserProfileDocsOnce]
  );

  const signUpWithEmail = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      username: string,
      inviteCode?: string
    ) => {
      setSessionRevoked(false);
      const cleanName = name.trim().slice(0, 80);
      const cleanUsername = sanitizeUsername(username);
      const cleanCode = inviteCode?.trim().toUpperCase() || '';
      try {
        sessionStorage.setItem(
          PENDING_PROFILE_KEY,
          JSON.stringify({ name: cleanName, username: cleanUsername, inviteCode: cleanCode })
        );
      } catch {}
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateFirebaseAuthProfile(cred.user, { displayName: cleanName });
      if (!isUserAuthVerified(cred.user)) {
        await sendEmailVerification(cred.user);
      }
      setFirebaseUser(cred.user);
      await ensureUserProfileDocsOnce(cred.user);
    },
    [ensureUserProfileDocsOnce]
  );

  const signInWithGoogle = useCallback(async () => {
    setSessionRevoked(false);
    const cred = await signInWithPopup(auth, googleProvider);
    setFirebaseUser(cred.user);
    if (isUserAuthVerified(cred.user)) {
      await ensureUserProfileDocsOnce(cred.user);
    }
  }, [ensureUserProfileDocsOnce]);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) throw new Error('No authenticated user found.');
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshAuthUser = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const refreshed = auth.currentUser;
    if (isUserAuthVerified(refreshed)) {
      await refreshed.getIdToken(true).catch(() => {});
      setFirebaseUser(refreshed);
      setAuthRefreshTick((n) => n + 1);
      syncAttemptedUidRef.current = null;
      await ensureUserProfileDocsOnce(refreshed);
      return true;
    }
    setFirebaseUser(refreshed);
    setAuthRefreshTick((n) => n + 1);
    return false;
  }, [ensureUserProfileDocsOnce]);

  const updateUserProfile = useCallback(
    async (updates: {
      name?: string;
      username?: string;
      bio?: string;
      photoURL?: string;
      coverURL?: string;
      language?: AppLanguage;
      theme?: AppThemeId;
      neonTheme?: NeonThemeColor;
      ghostMode?: boolean;
    }) => {
      if (!isUserAuthVerified(firebaseUser)) {
        throw new Error('You must be signed in with a verified email to update your profile.');
      }
      const pubRef = doc(db, 'users_public', firebaseUser.uid);
      const payload: Record<string, unknown> = {
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (updates.name !== undefined) {
        payload.name = updates.name.trim().slice(0, 80) || 'ERA User';
      }
      if (updates.username !== undefined) {
        payload.username = sanitizeUsername(updates.username);
      }
      if (updates.bio !== undefined) {
        payload.bio = updates.bio.trim().slice(0, 240);
      }
      if (updates.photoURL !== undefined) {
        payload.photoURL = updates.photoURL.slice(0, 250000);
      }
      if (updates.coverURL !== undefined) {
        payload.coverURL = updates.coverURL.slice(0, 350000);
      }
      if (updates.language === 'ar' || updates.language === 'en') {
        payload.language = updates.language;
      }
      if (updates.theme === 'arcade') {
        payload.theme = updates.theme;
      }
      if (updates.neonTheme !== undefined) {
        payload.neonTheme = updates.neonTheme;
      }
      if (updates.ghostMode !== undefined) {
        payload.ghostMode = Boolean(updates.ghostMode);
      }

      try {
        if (profile) {
          const updatedLocal: UserPublic = {
            ...profile,
            ...(payload.name !== undefined ? { name: String(payload.name) } : {}),
            ...(payload.username !== undefined ? { username: String(payload.username) } : {}),
            ...(payload.bio !== undefined ? { bio: String(payload.bio) } : {}),
            ...(payload.photoURL !== undefined ? { photoURL: String(payload.photoURL) } : {}),
            ...(payload.coverURL !== undefined ? { coverURL: String(payload.coverURL) } : {}),
            ...(payload.language !== undefined ? { language: payload.language as AppLanguage } : {}),
            ...(payload.theme !== undefined ? { theme: payload.theme as AppThemeId } : {}),
            ...(payload.neonTheme !== undefined ? { neonTheme: payload.neonTheme as NeonThemeColor } : {}),
            ...(payload.ghostMode !== undefined ? { ghostMode: Boolean(payload.ghostMode) } : {}),
          };
          setProfile(updatedLocal);
          localStorage.setItem(`era_local_profile_${firebaseUser.uid}`, JSON.stringify(updatedLocal));
        }

        if (!isFirestoreWritesPaused()) {
          await updateDoc(pubRef, payload);
        }
        if (updates.name !== undefined) {
          await updateFirebaseAuthProfile(firebaseUser, { displayName: String(payload.name) });
        }
      } catch (error) {
        if (isQuotaExhaustedError(error)) {
          pauseFirestoreWrites();
        } else {
          handleFirestoreError(error, OperationType.UPDATE, `users_public/${firebaseUser.uid}`);
        }
      }
    },
    [firebaseUser, profile]
  );

  const redeemReferralCode = useCallback(
    async (code: string) => {
      if (!isUserAuthVerified(firebaseUser)) {
        throw new Error('You must be signed in with a verified account.');
      }
      await redeemInviteCode(firebaseUser.uid, code);
    },
    [firebaseUser]
  );

  const setActiveChatPresence = useCallback(
    async (chatId: string) => {
      if (activeChatRef.current === chatId) return;
      activeChatRef.current = chatId;
      if (!isUserAuthVerified(firebaseUser) || isFirestoreWritesPaused()) return;
      const now = Date.now();
      if (now - lastPresenceWriteRef.current < 60_000) return;
      lastPresenceWriteRef.current = now;
      try {
        const isGhost = profile?.ghostMode;
        await updateDoc(doc(db, 'users_public', firebaseUser.uid), {
          isOnline: isGhost ? false : (document.visibilityState === 'visible'),
          activeChatId: chatId,
          lastSeen: isGhost ? null : serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        if (isQuotaExhaustedError(err)) {
          pauseFirestoreWrites();
        }
      }
    },
    [firebaseUser, profile?.ghostMode]
  );

  // Update lastSeen strictly every 60 seconds (never every second)
  useEffect(() => {
    if (!firebaseUser || !isUserAuthVerified(firebaseUser)) return;
    const uid = firebaseUser.uid;
    const isGhost = Boolean(profile?.ghostMode);

    const writeHeartbeat = () => {
      if (isFirestoreWritesPaused() || isGhost) return;
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastPresenceWriteRef.current < 60_000) return;
      lastPresenceWriteRef.current = now;
      void updateDoc(doc(db, 'users_public', uid), {
        isOnline: true,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        if (isQuotaExhaustedError(err)) pauseFirestoreWrites();
      });
    };

    const timer = window.setInterval(writeHeartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [firebaseUser, isVerified, profile?.ghostMode]);

  const logout = useCallback(async () => {
    syncAttemptedUidRef.current = null;
    inFlightSyncUidRef.current = null;
    activeChatRef.current = '';
    await signOut(auth);
    setProfile(null);
    setPrivateProfile(null);
    setFirebaseUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: firebaseUser,
      firebaseUser,
      profile,
      privateProfile,
      sessionId,
      sessionRevoked,
      twoStepLocked,
      unlockTwoStep,
      loading,
      authReady,
      isVerified,
      isAdmin,
      profileError,
      retryProfileSync,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      resendVerificationEmail,
      refreshAuthUser,
      updateUserProfile,
      redeemReferralCode,
      setActiveChatPresence,
      logout,
    }),
    [
      firebaseUser,
      profile,
      privateProfile,
      sessionId,
      sessionRevoked,
      twoStepLocked,
      unlockTwoStep,
      loading,
      authReady,
      isVerified,
      isAdmin,
      profileError,
      retryProfileSync,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      resendVerificationEmail,
      refreshAuthUser,
      updateUserProfile,
      redeemReferralCode,
      setActiveChatPresence,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
