import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Eye,
  EyeOff,
  KeyRound,
  User,
  AlertCircle,
  CheckCircle2,
  X,
  Calculator,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  LifeBuoy,
  Key,
} from 'lucide-react';
import { validatePasswordOrSecret, validateRecoveryKey } from '../lib/crypto';

const AVATAR_OPTIONS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Nova',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Cipher',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Phantom',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Vortex',
];

type AuthViewMode = 'login' | 'register' | 'recover';

export const AuthModal: React.FC = () => {
  const { authModalOpen, setAuthModalOpen, login, register, recoverAccount } = useAuth();
  const [viewMode, setViewMode] = useState<AuthViewMode>('login');

  // Login form state
  const [loginAccountCode, setLoginAccountCode] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regAvatar, setRegAvatar] = useState(AVATAR_OPTIONS[0]);

  // Recovery form state
  const [recoverAccountCode, setRecoverAccountCode] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmNewPass, setShowConfirmNewPass] = useState(false);
  const [recoverSuccessMsg, setRecoverSuccessMsg] = useState<string | null>(null);

  // Account creation success credentials
  const [createdAccountCode, setCreatedAccountCode] = useState<string | null>(null);
  const [createdRecoveryKey, setCreatedRecoveryKey] = useState<string | null>(null);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authModalOpen && !createdAccountCode) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(loginAccountCode, loginPassword);
      setAuthModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Invalid account code or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate client-side
    const trimmedDisplayName = regDisplayName.trim();
    if (!trimmedDisplayName) {
      setError('Display Name is required.');
      return;
    }

    const passErr = validatePasswordOrSecret(regPassword, 'Password');
    if (passErr) {
      setError(passErr);
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);
    try {
      // Automatically generate unique Account Code + Master Recovery Key
      const result = await register(
        trimmedDisplayName,
        regPassword,
        regConfirmPassword,
        regAvatar
      );
      // Display success view with generated code and recovery key
      setCreatedAccountCode(result.accountCode);
      setCreatedRecoveryKey(result.recoveryKey);
      setLoginAccountCode(result.accountCode); // prefill login for convenience
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecoverSuccessMsg(null);

    const passErr = validatePasswordOrSecret(newPassword, 'New Password');
    if (passErr) {
      setError(passErr);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('New Password and Confirm Password do not match.');
      return;
    }

    if (!validateRecoveryKey(recoveryKeyInput)) {
      setError('Please enter a valid Master Recovery Key (e.g. REC-XXXX-XXXX-XXXX).');
      return;
    }

    setLoading(true);
    try {
      await recoverAccount(recoverAccountCode, recoveryKeyInput, newPassword);
      setRecoverSuccessMsg('Account recovered successfully! Logged in.');
      setTimeout(() => {
        setAuthModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Invalid Account Code or Recovery Key.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAccountCode = async () => {
    if (!createdAccountCode) return;
    try {
      await navigator.clipboard.writeText(createdAccountCode);
      setHasCopiedCode(true);
      setTimeout(() => {
        setHasCopiedCode(false);
      }, 3000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  const handleCopyRecoveryKey = async () => {
    if (!createdRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(createdRecoveryKey);
      setHasCopiedKey(true);
      setTimeout(() => {
        setHasCopiedKey(false);
      }, 3000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  const handleContinueAfterSuccess = () => {
    setCreatedAccountCode(null);
    setCreatedRecoveryKey(null);
    setAuthModalOpen(false);
  };

  return (
    <div
      id="auth-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="auth-modal-card"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-neutral-100">CalcChat</h2>
              <p className="text-xs text-neutral-400">Private Code & Secret Vault</p>
            </div>
          </div>
          {!createdAccountCode && (
            <button
              id="close-auth-modal-btn"
              onClick={() => setAuthModalOpen(false)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* If Account Just Created Successfully: Display Success Screen with Account Code & Recovery Key */}
        {createdAccountCode ? (
          <div id="account-created-success-screen" className="p-6 sm:p-7 space-y-4 text-center overflow-y-auto">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-neutral-100 tracking-tight">
                Account Created Successfully
              </h3>
              <p className="text-xs text-neutral-400">
                Your unique account credentials have been generated and encrypted.
              </p>
            </div>

            {/* Account Code Display Box */}
            <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Your Account Code:
                </span>
                <button
                  type="button"
                  onClick={handleCopyAccountCode}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  {hasCopiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{hasCopiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div
                id="generated-account-code-display"
                className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400 tracking-widest py-0.5 select-all"
              >
                {createdAccountCode}
              </div>
              <p className="text-[11px] text-neutral-400">
                Required to log in to your account.
              </p>
            </div>

            {/* Recovery Key Display Box */}
            {createdRecoveryKey && (
              <div className="p-4 rounded-2xl bg-neutral-950 border border-amber-500/20 space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    Master Recovery Key:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyRecoveryKey}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                  >
                    {hasCopiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{hasCopiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div
                  id="generated-recovery-key-display"
                  className="text-sm font-mono font-bold text-amber-400 tracking-wider py-1 bg-neutral-900/80 px-2.5 rounded-lg border border-neutral-800 select-all break-all"
                >
                  {createdRecoveryKey}
                </div>
                <p className="text-[11px] text-amber-300/80">
                  Save this key offline. Used to reset your PIN if forgotten.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2">
              <button
                id="continue-after-creation-btn"
                type="button"
                onClick={handleContinueAfterSuccess}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Toggle (Login / Register / Recover) */}
            <div className="grid grid-cols-3 p-1.5 bg-neutral-950 border-b border-neutral-800 text-xs font-medium">
              <button
                id="tab-login-btn"
                type="button"
                onClick={() => {
                  setViewMode('login');
                  setError(null);
                }}
                className={`py-2 text-center rounded-xl transition-all cursor-pointer ${
                  viewMode === 'login'
                    ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Login
              </button>
              <button
                id="tab-register-btn"
                type="button"
                onClick={() => {
                  setViewMode('register');
                  setError(null);
                }}
                className={`py-2 text-center rounded-xl transition-all cursor-pointer ${
                  viewMode === 'register'
                    ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Create Account
              </button>
              <button
                id="tab-recover-btn"
                type="button"
                onClick={() => {
                  setViewMode('recover');
                  setError(null);
                }}
                className={`py-2 text-center rounded-xl transition-all cursor-pointer ${
                  viewMode === 'recover'
                    ? 'bg-neutral-800 text-amber-400 font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Recovery
              </button>
            </div>

            {/* Error Alert */}
            {error && (
              <div
                id="auth-error-alert"
                className="mx-5 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-400"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">{error}</p>
              </div>
            )}

            {/* Success Alert */}
            {recoverSuccessMsg && (
              <div
                id="auth-success-alert"
                className="mx-5 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-400"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <p className="leading-relaxed font-medium">{recoverSuccessMsg}</p>
              </div>
            )}

            {/* Form Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {viewMode === 'login' && (
                /* ================= LOGIN FORM ================= */
                <form id="login-form" onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                      Account Code
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3.5" />
                      <input
                        id="login-account-code-input"
                        type="text"
                        required
                        autoComplete="username"
                        value={loginAccountCode}
                        onChange={(e) => setLoginAccountCode(e.target.value.toUpperCase().trim())}
                        placeholder="e.g. CX742981"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-3.5 py-3 text-sm font-mono uppercase tracking-wide text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode('recover');
                          setRecoverAccountCode(loginAccountCode);
                          setError(null);
                        }}
                        className="text-xs text-amber-400/90 hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        Forgot PIN?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="login-password-input"
                        type={showLoginPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="4–10 characters (0-9, +, -, %, *)"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-3.5 pr-11 py-3 text-sm font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all tracking-wider"
                      />
                      <button
                        id="toggle-login-password-btn"
                        type="button"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                        className="absolute right-3 top-3.5 text-neutral-500 hover:text-neutral-300 transition-colors"
                        title={showLoginPassword ? 'Hide password' : 'Show password'}
                      >
                        {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      id="submit-login-btn"
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading ? 'Authenticating...' : 'Login'}
                    </button>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs text-neutral-400">
                    <button
                      id="switch-to-register-btn"
                      type="button"
                      onClick={() => {
                        setViewMode('register');
                        setError(null);
                      }}
                      className="hover:text-emerald-400 transition-colors cursor-pointer"
                    >
                      Need an account? <span className="font-semibold text-emerald-400">Create Account</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('recover');
                        setRecoverAccountCode(loginAccountCode);
                        setError(null);
                      }}
                      className="hover:text-amber-400 transition-colors cursor-pointer"
                    >
                      Recover Account
                    </button>
                  </div>
                </form>
              )}

              {viewMode === 'register' && (
                /* ================= CREATE ACCOUNT FORM ================= */
                <form id="register-form" onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                      Display Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3.5" />
                      <input
                        id="reg-displayname-input"
                        type="text"
                        required
                        value={regDisplayName}
                        onChange={(e) => setRegDisplayName(e.target.value)}
                        placeholder="e.g. Alex Mercer"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-3.5 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="reg-password-input"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="4–10 chars (0-9, +, -, %, *)"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-3.5 pr-11 py-3 text-sm font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 transition-all tracking-wider"
                      />
                      <button
                        id="toggle-reg-password-btn"
                        type="button"
                        onClick={() => setShowRegPassword((prev) => !prev)}
                        className="absolute right-3 top-3.5 text-neutral-500 hover:text-neutral-300 transition-colors"
                      >
                        {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        id="reg-confirm-password-input"
                        type={showRegConfirmPassword ? 'text' : 'password'}
                        required
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-3.5 pr-11 py-3 text-sm font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 transition-all tracking-wider"
                      />
                      <button
                        id="toggle-reg-confirm-password-btn"
                        type="button"
                        onClick={() => setShowRegConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-3.5 text-neutral-500 hover:text-neutral-300 transition-colors"
                      >
                        {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Allowed password rules banner */}
                  <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800/80 text-[11px] text-neutral-400 space-y-1">
                    <div className="font-semibold text-neutral-300">Password Rules:</div>
                    <div className="flex items-center gap-1.5 text-neutral-400 font-mono flex-wrap">
                      <span>Allowed:</span>
                      <span className="bg-neutral-800 text-emerald-400 px-1.5 py-0.5 rounded font-bold">0-9</span>
                      <span className="bg-neutral-800 text-emerald-400 px-1.5 py-0.5 rounded font-bold">+</span>
                      <span className="bg-neutral-800 text-emerald-400 px-1.5 py-0.5 rounded font-bold">-</span>
                      <span className="bg-neutral-800 text-emerald-400 px-1.5 py-0.5 rounded font-bold">%</span>
                      <span className="bg-neutral-800 text-emerald-400 px-1.5 py-0.5 rounded font-bold">*</span>
                      <span className="ml-1 text-neutral-400">(4–10 characters)</span>
                    </div>
                  </div>

                  {/* Avatar Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                      Select Profile Avatar
                    </label>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {AVATAR_OPTIONS.map((avatarUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setRegAvatar(avatarUrl)}
                          className={`relative w-10 h-10 rounded-xl overflow-hidden border-2 transition-all p-0.5 shrink-0 cursor-pointer ${
                            regAvatar === avatarUrl
                              ? 'border-emerald-500 bg-emerald-500/20 scale-105'
                              : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                          }`}
                        >
                          <img src={avatarUrl} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                          {regAvatar === avatarUrl && (
                            <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center">
                              <CheckCircle2 className="w-2.5 h-2.5 text-black" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      id="submit-register-btn"
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading ? 'Creating Account...' : 'Create Account'}
                    </button>
                  </div>

                  <div className="text-center pt-1">
                    <button
                      id="switch-to-login-btn"
                      type="button"
                      onClick={() => {
                        setViewMode('login');
                        setError(null);
                      }}
                      className="text-xs text-neutral-400 hover:text-emerald-400 transition-colors cursor-pointer"
                    >
                      Already have an account? <span className="font-semibold text-emerald-400">Login</span>
                    </button>
                  </div>
                </form>
              )}

              {viewMode === 'recover' && (
                /* ================= ACCOUNT RECOVERY FORM ================= */
                <form id="recover-form" onSubmit={handleRecoverSubmit} className="space-y-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 flex items-start gap-2">
                    <LifeBuoy className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <p>
                      Use your Master Recovery Key to securely reset your Account Password without exposing previous secrets.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                      Account Code
                    </label>
                    <input
                      id="recover-account-code-input"
                      type="text"
                      required
                      value={recoverAccountCode}
                      onChange={(e) => setRecoverAccountCode(e.target.value.toUpperCase().trim())}
                      placeholder="e.g. CX742981"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase tracking-wide text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                      Master Recovery Key
                    </label>
                    <input
                      id="recover-key-input"
                      type="text"
                      required
                      value={recoveryKeyInput}
                      onChange={(e) => setRecoveryKeyInput(e.target.value.toUpperCase().trim())}
                      placeholder="e.g. REC-XXXX-XXXX-XXXX"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-amber-400 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 tracking-wider"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        id="recover-new-password-input"
                        type={showNewPass ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="4–10 chars (0-9, +, -, %, *)"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-3.5 pr-10 py-2.5 text-sm font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass((p) => !p)}
                        className="absolute right-3 top-3 text-neutral-500 hover:text-neutral-300"
                      >
                        {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        id="recover-confirm-password-input"
                        type={showConfirmNewPass ? 'text' : 'password'}
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-3.5 pr-10 py-2.5 text-sm font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPass((p) => !p)}
                        className="absolute right-3 top-3 text-neutral-500 hover:text-neutral-300"
                      >
                        {showConfirmNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      id="submit-recover-btn"
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-amber-950/40 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading ? 'Recovering...' : 'Reset Password & Login'}
                    </button>
                  </div>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('login');
                        setError(null);
                      }}
                      className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
                    >
                      Remember your password? <span className="font-semibold text-emerald-400">Login</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
