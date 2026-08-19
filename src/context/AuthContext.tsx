import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserAccount, ChatIdentity } from '../types';
import {
  hashSecret,
  verifySecret,
  validatePasswordOrSecret,
  validateAccountCode,
  generateRandomAccountCode,
  generateRecoveryKey,
  validateRecoveryKey,
  generateSalt,
  hashPassword,
  verifyPassword,
} from '../lib/crypto';

const SESSION_STORAGE_KEY = 'calcchat_active_session_v2';
const TOKEN_STORAGE_KEY = 'calcchat_token_v2';

interface ActiveSessionData {
  uid: string;
  accountCode: string;
}

interface AuthContextType {
  user: { uid: string } | null;
  userAccount: UserAccount | null;
  firstIdentity: ChatIdentity | null;
  secondIdentity: ChatIdentity | null;
  activeIdentity: ChatIdentity | null;
  loading: boolean;
  needsPinSetup: boolean;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  login: (accountCode: string, password: string) => Promise<void>;
  register: (
    displayName: string,
    password: string,
    confirmPassword: string,
    avatar: string
  ) => Promise<{ accountCode: string; recoveryKey: string }>;
  recoverAccount: (
    accountCode: string,
    recoveryKey: string,
    newPassword: string
  ) => Promise<void>;
  setupIdentitiesAndPins: (
    firstDisplayName: string,
    firstSecret: string,
    firstSecretConfirm: string,
    secondDisplayName: string,
    secondSecret: string,
    secondSecretConfirm: string
  ) => Promise<void>;
  changeIdentityPin: (
    identityType: 'first' | 'second',
    currentSecret: string,
    newSecret: string,
    confirmNewSecret: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  unlockWithPin: (secret: string) => Promise<'first' | 'second' | null>;
  lockActiveIdentity: () => void;
  updateIdentityProfile: (
    identityId: string,
    updates: Partial<ChatIdentity>
  ) => Promise<void>;
  updateUserAccount: (updates: Partial<UserAccount>) => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [firstIdentity, setFirstIdentity] = useState<ChatIdentity | null>(null);
  const [secondIdentity, setSecondIdentity] = useState<ChatIdentity | null>(null);
  const [activeIdentity, setActiveIdentity] = useState<ChatIdentity | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [needsPinSetup, setNeedsPinSetup] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  // Load account data and identities given an internal UID
  const loadAccountAndIdentities = useCallback(async (uid: string) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setUserAccount(null);
        setFirstIdentity(null);
        setSecondIdentity(null);
        setNeedsPinSetup(false);
        return null;
      }

      const fetchedUserAccount = userSnap.data() as UserAccount;
      setUserAccount(fetchedUserAccount);

      // Fetch First Identity
      const firstIdRef = doc(db, 'identities', `${uid}_first`);
      const firstSnap = await getDoc(firstIdRef);
      let fetchedFirst: ChatIdentity | null = null;
      if (firstSnap.exists()) {
        const raw = firstSnap.data();
        fetchedFirst = {
          ...raw,
          id: `${uid}_first`,
          identityId: `${uid}_first`,
          ownerUserId: raw.ownerUserId || uid,
          uid: raw.uid || uid,
        } as ChatIdentity;
        setFirstIdentity(fetchedFirst);
      } else {
        setFirstIdentity(null);
      }

      // Fetch Second Identity
      const secondIdRef = doc(db, 'identities', `${uid}_second`);
      const secondSnap = await getDoc(secondIdRef);
      let fetchedSecond: ChatIdentity | null = null;
      if (secondSnap.exists()) {
        const raw = secondSnap.data();
        fetchedSecond = {
          ...raw,
          id: `${uid}_second`,
          identityId: `${uid}_second`,
          ownerUserId: raw.ownerUserId || uid,
          uid: raw.uid || uid,
        } as ChatIdentity;
        setSecondIdentity(fetchedSecond);
      } else {
        setSecondIdentity(null);
      }

      // Determine if PIN setup is required
      const hasBothPins = Boolean(
        fetchedFirst?.pinHash &&
        fetchedSecond?.pinHash &&
        fetchedUserAccount?.hasConfiguredPins
      );

      setNeedsPinSetup(!hasBothPins);
      return fetchedUserAccount;
    } catch (err) {
      console.error('Error loading account and identities:', err);
      return null;
    }
  }, []);

  // Initialize session from server API or stored session
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const savedSessionRaw = localStorage.getItem(SESSION_STORAGE_KEY);

      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user && isMounted) {
            setUserAccount(data.user);
            if (data.firstIdentity) {
              setFirstIdentity({ ...data.firstIdentity, id: data.firstIdentity.identityId || `${data.user.uid}_first` });
            }
            if (data.secondIdentity) {
              setSecondIdentity({ ...data.secondIdentity, id: data.secondIdentity.identityId || `${data.user.uid}_second` });
            }
            const hasBoth = Boolean(data.firstIdentity?.pinHash && data.secondIdentity?.pinHash && data.user?.hasConfiguredPins);
            setNeedsPinSetup(!hasBoth);
            setLoading(false);
            return;
          }
        } else if (res.status === 401) {
          // A stale local session must never make the UI appear authenticated when
          // the server no longer has a valid HttpOnly session cookie.
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch {
        // Network/server startup errors are handled by the normal signed-out UI.
      }

      // Never hydrate authentication from localStorage alone. The server cookie is
      // the authoritative session used by protected APIs and media uploads.

      if (isMounted) {
        setLoading(false);
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [loadAccountAndIdentities]);

  const refreshUserData = async () => {
    if (userAccount?.uid) {
      await loadAccountAndIdentities(userAccount.uid);
    }
  };

  /**
   * Login using UNIQUE ACCOUNT CODE + PASSWORD
   * Authenticates via secure server API and falls back gracefully to Firestore transaction logic
   */
  const login = async (rawAccountCode: string, rawPassword: string) => {
    const code = rawAccountCode.trim();
    const password = rawPassword.trim();

    if (!code || !password) {
      throw new Error('Invalid Account Code or Password.');
    }

    // Format validation
    const codeErr = validateAccountCode(code);
    const passErr = validatePasswordOrSecret(password, 'Password');
    if (codeErr || passErr) {
      throw new Error('Invalid Account Code or Password.');
    }

    // Authentication must always be completed by the server so the HttpOnly
    // calcchat_token cookie exists. A client-only Firestore fallback makes the UI
    // look logged in while /api/auth/me and /api/media/upload correctly return 401.
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ accountCode: code, password }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.user?.uid) {
      throw new Error(data?.error || 'Unable to authenticate with the CalcChat server.');
    }

    const sessionData: ActiveSessionData = {
      uid: data.user.uid,
      accountCode: data.user.accountCode || code,
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    await loadAccountAndIdentities(data.user.uid);
    setAuthModalOpen(false);
  };

  /**
   * Account Registration with AUTOMATICALLY GENERATED UNIQUE ACCOUNT CODE + PASSWORD
   * Server/Database-side uniqueness enforced atomically.
   */
  const register = async (
    displayName: string,
    password: string,
    confirmPassword: string,
    avatar: string
  ): Promise<{ accountCode: string; recoveryKey: string }> => {
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) {
      throw new Error('Display Name is required.');
    }

    const passErr = validatePasswordOrSecret(password, 'Password');
    if (passErr) {
      throw new Error(passErr);
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    // 1. Try server-side API registration first
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName: trimmedDisplayName,
          password,
          avatar,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.accountCode && data.user) {
          const sessionData: ActiveSessionData = {
            uid: data.user.uid,
            accountCode: data.accountCode,
          };
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
          setUserAccount(data.user);
          setFirstIdentity(null);
          setSecondIdentity(null);
          setActiveIdentity(null);
          setNeedsPinSetup(true);
          return {
            accountCode: data.accountCode,
            recoveryKey: data.recoveryKey || generateRecoveryKey(),
          };
        }
      } else {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Registration failed.');
      }
    } catch (apiErr: any) {
      if (apiErr.message && !apiErr.message.includes('fetch')) {
        throw apiErr;
      }
      console.warn('API registration failed, using client transaction:', apiErr);
    }

    // Fallback: Direct Firestore Transaction
    let candidateCode = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateRandomAccountCode();
      const codeRef = doc(db, 'accountCodes', candidate.toLowerCase());
      const codeSnap = await getDoc(codeRef);
      if (!codeSnap.exists()) {
        candidateCode = candidate;
        break;
      }
    }

    if (!candidateCode) {
      throw new Error('Failed to generate a unique account code. Please try again.');
    }

    const uid = `usr_${Date.now()}_${generateSalt().substring(0, 8)}`;
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    
    // Master Recovery Key
    const recoveryKey = generateRecoveryKey();
    const recoverySalt = generateSalt();
    const recoveryKeyHash = await hashPassword(recoveryKey, recoverySalt);

    const now = Date.now();
    const normalizedCode = candidateCode.toLowerCase();
    const codeRef = doc(db, 'accountCodes', normalizedCode);
    const userDocRef = doc(db, 'users', uid);

    const userDoc: UserAccount = {
      uid,
      accountCode: candidateCode,
      displayName: trimmedDisplayName,
      avatar,
      hasConfiguredPins: false,
      recoveryKeyHash,
      recoverySalt,
      createdAt: now,
    };

    await runTransaction(db, async (transaction) => {
      const codeCheck = await transaction.get(codeRef);
      if (codeCheck.exists()) {
        throw new Error('Account Code collision during registration. Please try again.');
      }
      transaction.set(codeRef, {
        accountCode: candidateCode,
        uid,
        passwordHash,
        salt,
        recoveryKeyHash,
        recoverySalt,
        displayName: trimmedDisplayName,
        avatar,
        createdAt: now,
      });
      transaction.set(userDocRef, userDoc);
    });

    const sessionData: ActiveSessionData = {
      uid,
      accountCode: candidateCode,
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));

    setUserAccount(userDoc);
    setFirstIdentity(null);
    setSecondIdentity(null);
    setActiveIdentity(null);
    setNeedsPinSetup(true);

    return {
      accountCode: candidateCode,
      recoveryKey,
    };
  };

  /**
   * Account Recovery using Master Recovery Key + Account Code
   * Allows setting a new password/PIN without ever revealing the old one.
   */
  const recoverAccount = async (
    accountCode: string,
    recoveryKey: string,
    newPassword: string
  ): Promise<void> => {
    const code = (accountCode || '').trim();
    const recKey = (recoveryKey || '').trim().toUpperCase();
    const newPass = (newPassword || '').trim();

    if (!code || !recKey) {
      throw new Error('Please provide both Account Code and Master Recovery Key.');
    }

    const passErr = validatePasswordOrSecret(newPass, 'New Password');
    if (passErr) {
      throw new Error(passErr);
    }

    // 1. Try API recovery first
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accountCode: code, recoveryKey: recKey, newPassword: newPass }),
      });

      if (res.ok) {
        const data = await res.json();
        await login(code, newPass);
        return;
      } else {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Invalid Account Code or Recovery Key.');
      }
    } catch (apiErr: any) {
      if (apiErr.message === 'Invalid Account Code or Recovery Key.') {
        throw apiErr;
      }
      console.warn('API recover failed, attempting direct Firestore recovery:', apiErr);
    }

    // Direct Firestore recovery
    const codeRef = doc(db, 'accountCodes', code.toLowerCase());
    const codeSnap = await getDoc(codeRef);
    if (!codeSnap.exists()) {
      throw new Error('Invalid Account Code or Recovery Key.');
    }

    const codeData = codeSnap.data();
    const storedUid = codeData.uid;
    const storedRecoveryHash = codeData.recoveryKeyHash;
    const storedRecoverySalt = codeData.recoverySalt || storedUid;

    if (!storedRecoveryHash) {
      throw new Error('No recovery key registered for this account.');
    }

    const isRecValid = await verifyPassword(recKey, storedRecoverySalt, storedRecoveryHash);
    if (!isRecValid) {
      throw new Error('Invalid Account Code or Recovery Key.');
    }

    const newSalt = generateSalt();
    const newPasswordHash = await hashPassword(newPass, newSalt);
    const now = Date.now();

    await runTransaction(db, async (transaction) => {
      transaction.update(codeRef, {
        passwordHash: newPasswordHash,
        salt: newSalt,
        updatedAt: now,
      });
      transaction.update(doc(db, 'users', storedUid), {
        updatedAt: now,
      });
    });

    await login(code, newPass);
  };

  /**
   * Set Up Two Identities with 4-10 char secrets containing 0-9, +, -, %, *
   */
  const setupIdentitiesAndPins = async (
    firstDisplayName: string, firstSecret: string, firstSecretConfirm: string,
    secondDisplayName: string, secondSecret: string, secondSecretConfirm: string
  ) => {
    if (!userAccount) throw new Error('User is not authenticated');
    if (!firstDisplayName.trim() || !secondDisplayName.trim()) throw new Error('Both identity names are required.');
    const e1 = validatePasswordOrSecret(firstSecret, 'First Identity Secret');
    const e2 = validatePasswordOrSecret(secondSecret, 'Second Identity Secret');
    if (e1) throw new Error(`First Identity: ${e1}`);
    if (e2) throw new Error(`Second Identity: ${e2}`);
    if (firstSecret !== firstSecretConfirm || secondSecret !== secondSecretConfirm) throw new Error('Secret confirmation does not match.');
    if (firstSecret === secondSecret) throw new Error('First and Second secrets cannot be identical.');
    const res = await fetch('/api/auth/setup-identities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ firstDisplayName: firstDisplayName.trim(), firstSecret, secondDisplayName: secondDisplayName.trim(), secondSecret }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Failed to configure identities.');
    await loadAccountAndIdentities(userAccount.uid);
    setNeedsPinSetup(false);
  };

  /**
   * Securely change an identity secret requiring current secret verification
   */
  const changeIdentityPin = async (
    identityType: 'first' | 'second', currentSecret: string, newSecret: string, confirmNewSecret: string
  ) => {
    if (!userAccount) throw new Error('User not authenticated.');
    const err = validatePasswordOrSecret(newSecret, 'New Secret');
    if (err) throw new Error(err);
    if (newSecret !== confirmNewSecret) throw new Error('New secret and confirmation do not match.');
    const res = await fetch('/api/auth/change-pin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ identityType, currentSecret, newSecret }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Failed to update PIN.');
    await loadAccountAndIdentities(userAccount.uid);
  };

  const logout = async () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setActiveIdentity(null);
    setUserAccount(null);
    setFirstIdentity(null);
    setSecondIdentity(null);
    setNeedsPinSetup(false);
  };

  /**
   * Stealth Identity Secret Verification
   */
  const unlockWithPin = async (enteredSecret: string): Promise<'first' | 'second' | null> => {
    if (!userAccount || !enteredSecret) return null;
    const cleanSecret = enteredSecret.trim();

    if (firstIdentity?.pinHash) {
      const isFirst = await verifySecret(cleanSecret, userAccount.uid, firstIdentity.pinHash);
      if (isFirst) {
        setActiveIdentity(firstIdentity);
        return 'first';
      }
    }

    if (secondIdentity?.pinHash) {
      const isSecond = await verifySecret(cleanSecret, userAccount.uid, secondIdentity.pinHash);
      if (isSecond) {
        setActiveIdentity(secondIdentity);
        return 'second';
      }
    }

    return null;
  };

  const lockActiveIdentity = () => {
    setActiveIdentity(null);
  };

  const updateIdentityProfile = async (identityId: string, updates: Partial<ChatIdentity>) => {
    if (!userAccount) return;
    const identityType = identityId.endsWith('_second') ? 'second' : 'first';
    const res = await fetch('/api/profile/identity', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ identityType, displayName: updates.displayName, about: updates.about, statusMessage: updates.statusMessage, avatar: updates.avatar }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Failed to update identity profile.');
    await loadAccountAndIdentities(userAccount.uid);
    if (activeIdentity?.id === identityId) setActiveIdentity((prev) => (prev ? { ...prev, ...updates, updatedAt: Date.now() } : null));
  };

  const updateUserAccount = async (updates: Partial<UserAccount>) => {
    if (!userAccount) return;
    const res = await fetch('/api/profile/account', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ displayName: updates.displayName, avatar: updates.avatar }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Failed to update account profile.');
    await loadAccountAndIdentities(userAccount.uid);
  };

  return (
    <AuthContext.Provider
      value={{
        user: userAccount ? { uid: userAccount.uid } : null,
        userAccount,
        firstIdentity,
        secondIdentity,
        activeIdentity,
        loading,
        needsPinSetup,
        authModalOpen,
        setAuthModalOpen,
        login,
        register,
        recoverAccount,
        setupIdentitiesAndPins,
        changeIdentityPin,
        logout,
        unlockWithPin,
        lockActiveIdentity,
        updateIdentityProfile,
        updateUserAccount,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
