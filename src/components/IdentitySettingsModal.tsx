import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Settings,
  KeyRound,
  Check,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  User,
  Shield,
  Fingerprint,
} from 'lucide-react';
import { validatePasswordOrSecret } from '../lib/crypto';

const AVATAR_OPTIONS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Nova',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Cipher',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Phantom',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Vortex',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Titan',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Echo',
];

interface IdentitySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IdentitySettingsModal: React.FC<IdentitySettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    userAccount,
    activeIdentity,
    updateIdentityProfile,
    changeIdentityPin,
  } = useAuth();

  const [displayName, setDisplayName] = useState(activeIdentity?.displayName || '');
  const [about, setAbout] = useState(activeIdentity?.about || 'Available on CalcChat');
  const [statusMessage, setStatusMessage] = useState(activeIdentity?.statusMessage || '');
  const [avatar, setAvatar] = useState(activeIdentity?.avatar || AVATAR_OPTIONS[0]);
  const [copiedCode, setCopiedCode] = useState(false);

  // Change Secret fields
  const [currentSecret, setCurrentSecret] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !activeIdentity) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const isChangingSecret = currentSecret || newSecret || confirmSecret;

    if (isChangingSecret) {
      if (!currentSecret) {
        setErrorMsg('Please enter your Current Secret to set a new Secret.');
        return;
      }
      const secretErr = validatePasswordOrSecret(newSecret, 'New Secret');
      if (secretErr) {
        setErrorMsg(secretErr);
        return;
      }
      if (newSecret !== confirmSecret) {
        setErrorMsg('New Secret and Confirm Secret do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      // 1. Update display name, about & avatar
      await updateIdentityProfile(activeIdentity.id, {
        displayName: displayName.trim(),
        about: about.trim(),
        statusMessage: statusMessage.trim(),
        avatar,
      });

      // 2. Change secret if requested
      if (isChangingSecret) {
        await changeIdentityPin(
          activeIdentity.type,
          currentSecret,
          newSecret,
          confirmSecret
        );
        setCurrentSecret('');
        setNewSecret('');
        setConfirmSecret('');
      }

      setSuccessMsg('Identity updated successfully!');
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch (err: any) {
      console.error('Settings update error:', err);
      setErrorMsg(err.message || 'Failed to update identity settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="identity-settings-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="identity-settings-card"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">
                {activeIdentity.type === 'first' ? 'First' : 'Second'} Identity Profile
              </h2>
              <p className="text-xs text-neutral-400">Manage identity handle, avatar, and unlock secret</p>
            </div>
          </div>
          <button
            id="close-identity-settings-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-400">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {/* Account & Identity Meta Card */}
          <div className="p-3 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                Parent Account Code
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {userAccount?.accountCode || 'N/A'}
                </span>
                <button type="button" onClick={async () => { if (userAccount?.accountCode) { await navigator.clipboard.writeText(userAccount.accountCode); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 1500); } }} className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-emerald-400" title="Copy Account Code">
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Fingerprint className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-neutral-900">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Fingerprint className="w-3.5 h-3.5 text-neutral-500" />
                Identity Username
              </span>
              <span className="text-xs font-mono text-neutral-300">
                @{activeIdentity.username}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
              Identity Display Name
            </label>
            <input
              id="settings-displayname-input"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
              About / Status
            </label>
            <input
              id="settings-about-input"
              type="text"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="e.g. Available on CalcChat"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
              Status
            </label>
            <input
              id="settings-status-input"
              type="text"
              maxLength={140}
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              placeholder="e.g. Busy / At work / Available"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Avatar selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
              Choose Avatar
            </label>
            <div className="grid grid-cols-4 gap-2">
              {AVATAR_OPTIONS.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAvatar(url)}
                  className={`p-1 rounded-xl border-2 transition-all flex items-center justify-center ${
                    avatar === url
                      ? 'border-emerald-500 bg-emerald-500/20 scale-105'
                      : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                  }`}
                >
                  <img src={url} alt={`Avatar ${i}`} className="w-10 h-10 rounded-lg object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Change Secret section */}
          <div className="p-3.5 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Unlock Secret (Optional)</span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Update this identity's unlock secret (4–10 characters from 0-9, +, -, %, *).
            </p>

            <div>
              <label className="block text-[11px] font-medium text-neutral-300 mb-1">
                Current Secret
              </label>
              <div className="relative">
                <input
                  id="settings-current-pin-input"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentSecret}
                  onChange={(e) => setCurrentSecret(e.target.value)}
                  placeholder="Enter current secret"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-3 pr-9 py-1.5 text-xs font-mono text-center text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((p) => !p)}
                  className="absolute right-2 top-2 text-neutral-500 hover:text-neutral-300"
                >
                  {showCurrent ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-neutral-300 mb-1">
                  New Secret
                </label>
                <div className="relative">
                  <input
                    id="settings-new-pin-input"
                    type={showNew ? 'text' : 'password'}
                    value={newSecret}
                    onChange={(e) => setNewSecret(e.target.value)}
                    placeholder="4–10 chars"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-2.5 pr-8 py-1.5 text-xs font-mono text-center text-emerald-400 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((p) => !p)}
                    className="absolute right-2 top-2 text-neutral-500 hover:text-neutral-300"
                  >
                    {showNew ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-300 mb-1">
                  Confirm Secret
                </label>
                <div className="relative">
                  <input
                    id="settings-confirm-pin-input"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmSecret}
                    onChange={(e) => setConfirmSecret(e.target.value)}
                    placeholder="Confirm"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-2.5 pr-8 py-1.5 text-xs font-mono text-center text-emerald-400 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((p) => !p)}
                    className="absolute right-2 top-2 text-neutral-500 hover:text-neutral-300"
                  >
                    {showConfirm ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              id="save-identity-settings-btn"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Saving Changes...' : 'Save Profile & Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
