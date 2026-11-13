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
  enableNetwork,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import {
  ensureOfficialChannelForAdmin,
  ensureUserInviteCode,
  ensureUserJoinedOfficialChannel,
  redeemInviteCode,
} from '../services/chatService';
import { getStoredLanguage, getTranslations } from '../i18n';
import type { AppLanguage, UserPrivate, UserPublic } from '../types/dank';
import { handleFirestoreError, isOfflineError, OperationType } from '../utils/firestoreErrors';
import { sanitizeUsername } from '../utils/timeFormat';

const ADMIN_EMAIL = 'youssefdankapp@gmail.com';
const PENDING_PROFILE_KEY = 'dank_pending_signup_profile';

interface AuthContextValue {
  user: User | null;
  firebaseUser: User | null;
  profile: UserPublic | null;
  privateProfile: UserPrivate | null;
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
    language?: AppLanguage;
  }) => Promise<void>;
  redeemReferralCode: (code: string) => Promise<void>;
  setActiveChatPresence: (chatId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function withOfflineRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isOfflineError(err) || attempt === maxAttempts) {
        throw err;
      }
      await enableNetwork(db).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
    }
  }
  throw lastError;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [privateProfile, setPrivateProfile] = useState<UserPrivate | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const activeChatRef = useRef<string>('');
  const uidRef = useRef<string | null>(null);

  const isVerified = Boolean(firebaseUser && firebaseUser.emailVerified);
  const isAdmin = Boolean(
    firebaseUser &&
      firebaseUser.emailVerified &&
      firebaseUser.email?.toLowerCase() === ADMIN_EMAIL
  );

  const ensureUserProfileDocs = useCallback(async (user: User) => {
    if (!user.emailVerified) return;

    setProfileError(null);
    const pubRef = doc(db, 'users_public', user.uid);
    const privRef = doc(db, 'users_private', user.uid);

    let pendingName = '';
    let pendingUsername = '';
    let pendingInviteCode = '';
    let hasPendingSession = false;
    try {
      const raw = sessionStorage.getItem(PENDING_PROFILE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          name?: string;
          username?: string;
          inviteCode?: string;
        };
        pendingName = parsed.name || '';
        pendingUsername = parsed.username || '';
        pendingInviteCode = parsed.inviteCode || '';
        hasPendingSession = true;
      }
    } catch {
      // ignore storage read error
    }

    let stage: OperationType = OperationType.GET;
    try {
      const [pubSnap, privSnap] = await withOfflineRetry(() =>
        Promise.all([getDoc(pubRef), getDoc(privRef)])
      );

      stage = OperationType.WRITE;
      const batch = writeBatch(db);
      let hasWrites = false;

      if (!pubSnap.exists()) {
        const chosenLang = getStoredLanguage();
        const fallbackName =
          pendingName ||
          user.displayName?.trim() ||
          user.email?.split('@')[0] ||
          'DANK Member';
        const fallbackUsername = sanitizeUsername(
          pendingUsername ||
            user.displayName ||
            user.email?.split('@')[0] ||
            user.uid.slice(0, 8)
        );
        batch.set(pubRef, {
          uid: user.uid,
          name: fallbackName.slice(0, 80),
          username: fallbackUsername,
          photoURL: user.photoURL || '',
          bio: getTranslations(chosenLang).errors.defaultBio,
          language: chosenLang,
          isOnline: true,
          lastSeen: serverTimestamp(),
          activeChatId: activeChatRef.current || '',
          isAdmin: user.email?.toLowerCase() === ADMIN_EMAIL,
          isVerified: false,
          inviteCount: 0,
          isVip: false,
          isBanned: false,
          mutedUntil: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        hasWrites = true;
      } else {
        const existingPub = pubSnap.data() as Partial<UserPublic>;
        const updatePayload: Record<string, unknown> = {
          isOnline: true,
          lastSeen: serverTimestamp(),
          activeChatId: activeChatRef.current || '',
          updatedAt: serverTimestamp(),
        };
        if (
          user.email?.toLowerCase() === ADMIN_EMAIL &&
          existingPub.isAdmin === undefined
        ) {
          updatePayload.isAdmin = true;
        }
        batch.update(pubRef, updatePayload);
        hasWrites = true;
      }

      if (!privSnap.exists()) {
        batch.set(privRef, {
          uid: user.uid,
          email: user.email || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        hasWrites = true;
      }

      if (hasWrites) {
        await withOfflineRetry(() => batch.commit());
      }

      if (hasPendingSession) {
        try {
          sessionStorage.removeItem(PENDING_PROFILE_KEY);
        } catch {
          // ignore storage remove error
        }
      }

      // Ensure user has a DANK-XXXX invite code
      await withOfflineRetry(() => ensureUserInviteCode(user.uid));

      // Redeem signup invite code if present
      if (pendingInviteCode) {
        try {
          await redeemInviteCode(user.uid, pendingInviteCode);
        } catch (err) {
          console.warn('Could not redeem signup invite code:', err);
        }
      }

      // Ensure "DANK Official" channel exists (if main admin) and join every user to it
      if (user.email?.toLowerCase() === ADMIN_EMAIL) {
        await ensureOfficialChannelForAdmin(user.uid);
      }
      await ensureUserJoinedOfficialChannel(user.uid);
    } catch (error) {
      if (isOfflineError(error)) {
        console.warn('Profile sync paused while Firestore client is offline:', error);
        setProfileError(
          'Unable to reach DANK servers right now. Please check your connection and retry.'
        );
        return;
      }
      handleFirestoreError(error, stage, `users_public/${user.uid}`);
    }
  }, []);

  const retryProfileSync = useCallback(async () => {
    const activeUser = auth.currentUser || firebaseUser;
    if (!activeUser || !activeUser.emailVerified) return;
    setProfileError(null);
    await enableNetwork(db).catch(() => {});
    await ensureUserProfileDocs(activeUser);
  }, [ensureUserProfileDocs, firebaseUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      uidRef.current = user?.uid ?? null;

      if (!user) {
        setProfile(null);
        setPrivateProfile(null);
        setProfileError(null);
        setAuthReady(true);
        setLoading(false);
        return;
      }

      if (user.emailVerified) {
        try {
          await ensureUserProfileDocs(user);
        } catch (err) {
          console.error('Failed ensuring profile docs:', err);
        }
      } else {
        setProfile(null);
        setPrivateProfile(null);
        setProfileError(null);
      }

      setAuthReady(true);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [ensureUserProfileDocs]);

  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) {
      setProfile(null);
      setPrivateProfile(null);
      return;
    }

    const uid = firebaseUser.uid;
    const unsubPub = onSnapshot(
      doc(db, 'users_public', uid),
      (snap) => {
        if (snap.exists()) {
          setProfileError(null);
          setProfile(snap.data() as UserPublic);
        }
      },
      (error) => {
        if (isOfflineError(error)) {
          console.warn('Public profile listener waiting for network:', error);
          return;
        }
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
        if (isOfflineError(error)) {
          console.warn('Private profile listener waiting for network:', error);
          return;
        }
        handleFirestoreError(error, OperationType.GET, `users_private/${uid}`);
      }
    );

    return () => {
      unsubPub();
      unsubPriv();
    };
  }, [firebaseUser, firebaseUser?.emailVerified]);

  // Automatically retry profile sync when browser comes back online
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || profile) return;
    const handleOnline = () => {
      void retryProfileSync();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [firebaseUser, profile, retryProfileSync]);

  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;
    const uid = firebaseUser.uid;
    const pubRef = doc(db, 'users_public', uid);

    const setPresence = async (online: boolean) => {
      try {
        await updateDoc(pubRef, {
          isOnline: online,
          lastSeen: serverTimestamp(),
          activeChatId: online ? activeChatRef.current : '',
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore transient offline errors during unload/heartbeat
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void setPresence(false);
      } else {
        void setPresence(true);
      }
    };

    const handleUnload = () => {
      void setPresence(false);
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void setPresence(true);
      }
    }, 30_000);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [firebaseUser, firebaseUser?.emailVerified]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    setFirebaseUser(cred.user);
    if (cred.user.emailVerified) {
      await ensureUserProfileDocs(cred.user);
    }
  }, [ensureUserProfileDocs]);

  const signUpWithEmail = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      username: string,
      inviteCode?: string
    ) => {
      const cleanName = name.trim().slice(0, 80);
      const cleanUsername = sanitizeUsername(username);
      const cleanCode = inviteCode?.trim().toUpperCase() || '';
      try {
        sessionStorage.setItem(
          PENDING_PROFILE_KEY,
          JSON.stringify({ name: cleanName, username: cleanUsername, inviteCode: cleanCode })
        );
      } catch {
        // ignore storage error
      }
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateFirebaseAuthProfile(cred.user, { displayName: cleanName });
      await sendEmailVerification(cred.user);
      setFirebaseUser(cred.user);
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    setFirebaseUser(cred.user);
    if (cred.user.emailVerified) {
      await ensureUserProfileDocs(cred.user);
    }
  }, [ensureUserProfileDocs]);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) throw new Error('No authenticated user found.');
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshAuthUser = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const refreshed = auth.currentUser;
    setFirebaseUser({ ...refreshed } as User);
    if (refreshed.emailVerified) {
      await ensureUserProfileDocs(refreshed);
      return true;
    }
    return false;
  }, [ensureUserProfileDocs]);

  const updateUserProfile = useCallback(
    async (updates: {
      name?: string;
      username?: string;
      bio?: string;
      photoURL?: string;
      language?: AppLanguage;
    }) => {
      if (!firebaseUser || !firebaseUser.emailVerified) {
        throw new Error('You must be signed in with a verified email to update your profile.');
      }
      const pubRef = doc(db, 'users_public', firebaseUser.uid);
      const payload: Record<string, unknown> = {
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (updates.name !== undefined) {
        payload.name = updates.name.trim().slice(0, 80) || 'DANK User';
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
      if (updates.language === 'ar' || updates.language === 'en') {
        payload.language = updates.language;
      }

      try {
        await updateDoc(pubRef, payload);
        if (updates.name !== undefined) {
          await updateFirebaseAuthProfile(firebaseUser, { displayName: String(payload.name) });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users_public/${firebaseUser.uid}`);
      }
    },
    [firebaseUser]
  );

  const redeemReferralCode = useCallback(
    async (code: string) => {
      if (!firebaseUser || !firebaseUser.emailVerified) {
        throw new Error('You must be signed in with a verified account.');
      }
      await redeemInviteCode(firebaseUser.uid, code);
    },
    [firebaseUser]
  );

  const setActiveChatPresence = useCallback(
    async (chatId: string) => {
      activeChatRef.current = chatId;
      if (!firebaseUser || !firebaseUser.emailVerified) return;
      try {
        await updateDoc(doc(db, 'users_public', firebaseUser.uid), {
          isOnline: document.visibilityState === 'visible',
          activeChatId: chatId,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore transient errors
      }
    },
    [firebaseUser]
  );

  const logout = useCallback(async () => {
    const uid = uidRef.current;
    activeChatRef.current = '';
    if (uid && auth.currentUser?.emailVerified) {
      try {
        await setDoc(
          doc(db, 'users_public', uid),
          {
            isOnline: false,
            activeChatId: '',
            lastSeen: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // Proceed with signOut even if offline
      }
    }
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
