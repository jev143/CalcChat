import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { validatePasswordOrSecret } from '../lib/crypto';
import { Shield, KeyRound, Check, AlertCircle, LogOut, Eye, EyeOff } from 'lucide-react';

export const PinSetupScreen: React.FC = () => {
  const { userAccount, setupIdentitiesAndPins, logout } = useAuth();

  const [firstDisplayName, setFirstDisplayName] = useState(
    userAccount?.displayName || 'Primary Alias'
  );
  const [firstSecret, setFirstSecret] = useState('');
  const [firstSecretConfirm, setFirstSecretConfirm] = useState('');
  const [showFirstSecret, setShowFirstSecret] = useState(false);
  const [showFirstConfirm, setShowFirstConfirm] = useState(false);

  const [secondDisplayName, setSecondDisplayName] = useState(
    userAccount?.displayName ? `${userAccount.displayName} (Secret)` : 'Stealth Alias'
  );
  const [secondSecret, setSecondSecret] = useState('');
  const [secondSecretConfirm, setSecondSecretConfirm] = useState('');
  const [showSecondSecret, setShowSecondSecret] = useState(false);
  const [showSecondConfirm, setShowSecondConfirm] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Real-time validations
  const validation = useMemo(() => {
    const isFirstNameValid = firstDisplayName.trim().length >= 1;
    const isSecondNameValid = secondDisplayName.trim().length >= 1;

    const firstSecretErr = validatePasswordOrSecret(firstSecret, 'First Secret');
    const firstMatch = firstSecret.length > 0 && firstSecret === firstSecretConfirm;

    const secondSecretErr = validatePasswordOrSecret(secondSecret, 'Second Secret');
    const secondMatch = secondSecret.length > 0 && secondSecret === secondSecretConfirm;

    const secretsNotEqual =
      firstSecret && secondSecret ? firstSecret !== secondSecret : true;

    const isValid =
      isFirstNameValid &&
      isSecondNameValid &&
      !firstSecretErr &&
      firstMatch &&
      !secondSecretErr &&
      secondMatch &&
      secretsNotEqual;

    return {
      isFirstNameValid,
      isSecondNameValid,
      firstSecretErr,
      firstMatch,
      secondSecretErr,
      secondMatch,
      secretsNotEqual,
      isValid,
    };
  }, [
    firstDisplayName,
    firstSecret,
    firstSecretConfirm,
    secondDisplayName,
    secondSecret,
    secondSecretConfirm,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.isValid) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      await setupIdentitiesAndPins(
        firstDisplayName,
        firstSecret,
        firstSecretConfirm,
        secondDisplayName,
        secondSecret,
        secondSecretConfirm
      );
    } catch (err: any) {
      console.error('Identity secrets setup error:', err);
      setErrorMsg(err.message || 'Failed to save identity secrets. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="pin-setup-screen"
      className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-neutral-800"
    >
      <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-5 border-b border-neutral-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-100 tracking-tight">
                Set Up Your Two Identities
              </h1>
              <p className="text-xs text-neutral-400">
                Configure your separate First and Second chat identities & unlock secrets
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Identity 1 Card */}
          <div className="p-4 rounded-2xl bg-neutral-950/60 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <h3 className="text-sm font-semibold text-emerald-400">First Identity</h3>
              </div>
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
                Identity 1
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                First Identity Display Name
              </label>
              <input
                id="first-identity-displayname-input"
                type="text"
                required
                value={firstDisplayName}
                onChange={(e) => setFirstDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  First Secret (4–10 chars)
                </label>
                <div className="relative">
                  <input
                    id="first-identity-pin-input"
                    type={showFirstSecret ? 'text' : 'password'}
                    required
                    value={firstSecret}
                    onChange={(e) => setFirstSecret(e.target.value)}
                    placeholder="e.g. 1234* or +57536"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-3 pr-9 py-2 text-sm font-mono text-emerald-400 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFirstSecret((p) => !p)}
                    className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300"
                  >
                    {showFirstSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Confirm First Secret
                </label>
                <div className="relative">
                  <input
                    id="first-identity-confirm-pin-input"
                    type={showFirstConfirm ? 'text' : 'password'}
                    required
                    value={firstSecretConfirm}
                    onChange={(e) => setFirstSecretConfirm(e.target.value)}
                    placeholder="Re-enter First Secret"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-3 pr-9 py-2 text-sm font-mono text-emerald-400 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFirstConfirm((p) => !p)}
                    className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300"
                  >
                    {showFirstConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Validation indicators */}
            <div className="flex flex-wrap gap-2 pt-0.5 text-[11px]">
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
                  !validation.firstSecretErr && firstSecret.length >= 4
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-neutral-500 bg-neutral-900'
                }`}
              >
                <Check className="w-3 h-3" /> 4–10 chars (0-9, +, -, %, *)
              </span>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
                  validation.firstMatch
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-neutral-500 bg-neutral-900'
                }`}
              >
                <Check className="w-3 h-3" /> Secrets match
              </span>
            </div>
          </div>

          {/* Identity 2 Card */}
          <div className="p-4 rounded-2xl bg-neutral-950/60 border border-sky-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                <h3 className="text-sm font-semibold text-sky-400">Second Identity</h3>
              </div>
              <span className="text-[10px] bg-sky-500/10 border border-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full font-mono">
                Identity 2
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Second Identity Display Name
              </label>
              <input
                id="second-identity-displayname-input"
                type="text"
                required
                value={secondDisplayName}
                onChange={(e) => setSecondDisplayName(e.target.value)}
                placeholder="e.g. Alex (Alt)"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-sky-500/60"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Second Secret (4–10 chars)
                </label>
                <div className="relative">
                  <input
                    id="second-identity-pin-input"
                    type={showSecondSecret ? 'text' : 'password'}
                    required
                    value={secondSecret}
                    onChange={(e) => setSecondSecret(e.target.value)}
                    placeholder="e.g. *45524% or 9876%"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-3 pr-9 py-2 text-sm font-mono text-sky-400 placeholder:text-neutral-600 focus:outline-none focus:border-sky-500 tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecondSecret((p) => !p)}
                    className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300"
                  >
                    {showSecondSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Confirm Second Secret
                </label>
                <div className="relative">
                  <input
                    id="second-identity-confirm-pin-input"
                    type={showSecondConfirm ? 'text' : 'password'}
                    required
                    value={secondSecretConfirm}
                    onChange={(e) => setSecondSecretConfirm(e.target.value)}
                    placeholder="Re-enter Second Secret"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-3 pr-9 py-2 text-sm font-mono text-sky-400 placeholder:text-neutral-600 focus:outline-none focus:border-sky-500 tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecondConfirm((p) => !p)}
                    className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300"
                  >
                    {showSecondConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Validation indicators */}
            <div className="flex flex-wrap gap-2 pt-0.5 text-[11px]">
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
                  !validation.secondSecretErr && secondSecret.length >= 4
                    ? 'text-sky-400 bg-sky-500/10'
                    : 'text-neutral-500 bg-neutral-900'
                }`}
              >
                <Check className="w-3 h-3" /> 4–10 chars (0-9, +, -, %, *)
              </span>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
                  validation.secondMatch
                    ? 'text-sky-400 bg-sky-500/10'
                    : 'text-neutral-500 bg-neutral-900'
                }`}
              >
                <Check className="w-3 h-3" /> Secrets match
              </span>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
                  validation.secretsNotEqual && firstSecret && secondSecret
                    ? 'text-neutral-300 bg-neutral-850'
                    : 'text-red-400 bg-red-500/10'
                }`}
              >
                {validation.secretsNotEqual ? 'Unique Secrets' : 'Secrets cannot be identical'}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <button
              id="save-identities-setup-btn"
              type="submit"
              disabled={!validation.isValid || loading}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                'Saving Encrypted Identities...'
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Save Identities & Return to Calculator</span>
                </>
              )}
            </button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-neutral-500">
          Your secrets are salted and cryptographically hashed with SHA-256 before saving. Plaintext secrets are never stored.
        </p>
      </div>
    </div>
  );
};
