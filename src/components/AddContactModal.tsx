import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  lookupAccountAndIdentitiesByCode,
  saveContact,
  getOrCreateConversation,
} from '../lib/chatService';
import { AccountLookupResult, ChatIdentity, Conversation } from '../types';
import {
  UserPlus,
  Search,
  X,
  Sparkles,
  MessageSquare,
  Bookmark,
  Check,
  AlertCircle,
  Shield,
  Loader2,
  Users,
} from 'lucide-react';

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (conversation: Conversation) => void;
  initialCode?: string;
}

export const AddContactModal: React.FC<AddContactModalProps> = ({
  isOpen,
  onClose,
  onSelectConversation,
  initialCode = '',
}) => {
  const { activeIdentity, userAccount } = useAuth();
  const [accountCodeInput, setAccountCodeInput] = useState(initialCode);
  const [customDisplayName, setCustomDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<AccountLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);

  if (!isOpen || !activeIdentity) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = accountCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setError('Please enter an Account Code.');
      return;
    }

    setLoading(true);
    setError(null);
    setLookupResult(null);
    setSavedSuccess(false);

    try {
      const result = await lookupAccountAndIdentitiesByCode(cleanCode);
      if (!result) {
        setError(`No account found with Account Code "${cleanCode}". Verify the code and try again.`);
      } else {
        setLookupResult(result);
        setCustomDisplayName(result.account.displayName || '');
      }
    } catch (err: any) {
      console.error('Account lookup error:', err);
      setError('Failed to search Account Code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveContact = async () => {
    if (!userAccount || !lookupResult) return;
    try {
      const targetIdentity = lookupResult.firstIdentity || lookupResult.secondIdentity;
      if (!activeIdentity || !targetIdentity) {
        throw new Error('This account has no chat identity.');
      }
      await saveContact(
        activeIdentity,
        targetIdentity,
        lookupResult.account.accountCode,
        customDisplayName.trim() || lookupResult.account.displayName
      );
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Save contact error:', err);
      setError('Failed to save contact.');
    }
  };

  const handleStartChat = async (targetIdentity: ChatIdentity) => {
    if (!activeIdentity || !lookupResult) return;
    setStartingChatWith(targetIdentity.id);
    try {
      const conv = await getOrCreateConversation(
        activeIdentity,
        targetIdentity,
        userAccount?.accountCode,
        lookupResult.account.accountCode
      );
      onSelectConversation(conv);
      onClose();
    } catch (err) {
      console.error('Error starting conversation:', err);
      setError('Failed to open conversation.');
    } finally {
      setStartingChatWith(null);
    }
  };

  const isSelfAccount = userAccount?.accountCode.toUpperCase() === accountCodeInput.trim().toUpperCase();

  return (
    <div
      id="add-contact-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="add-contact-modal-card"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">Find & Add Contact</h2>
              <p className="text-xs text-neutral-400">
                Search via unique 6-character Account Code
              </p>
            </div>
          </div>
          <button
            id="close-add-contact-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Section */}
        <div className="p-4 border-b border-neutral-800 bg-neutral-950/30 space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 text-neutral-500 font-mono text-sm">@</span>
              <input
                id="search-account-code-input"
                type="text"
                value={accountCodeInput}
                onChange={(e) => setAccountCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. K4P821"
                maxLength={10}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-8 pr-3 py-2 text-sm font-mono uppercase text-emerald-400 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 tracking-wider"
              />
            </div>
            <button
              id="search-account-code-btn"
              type="submit"
              disabled={loading || !accountCodeInput.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl flex items-center gap-1.5 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>Find</span>
            </button>
          </form>

          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-950/40 border border-red-800/50 rounded-xl text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Lookup Results */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {lookupResult ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Account Card */}
              <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={lookupResult.account.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow'}
                      alt="Avatar"
                      className="w-11 h-11 rounded-full border border-neutral-700 object-cover"
                    />
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-1.5">
                        {lookupResult.account.displayName}
                        {isSelfAccount && (
                          <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">You</span>
                        )}
                      </h3>
                      <span className="text-xs font-mono text-emerald-400 font-medium">
                        @{lookupResult.account.accountCode}
                      </span>
                    </div>
                  </div>

                  {!isSelfAccount && (
                    <button
                      id="save-contact-btn"
                      onClick={handleSaveContact}
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-neutral-700"
                    >
                      {savedSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Saved</span>
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Save Contact</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {!isSelfAccount && (
                  <div>
                    <label className="text-[11px] text-neutral-400 block mb-1">
                      Custom Nickname / Contact Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={customDisplayName}
                      onChange={(e) => setCustomDisplayName(e.target.value)}
                      placeholder="e.g. Alex Work or Friend"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                )}
              </div>

              {/* Target Identities Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Available Chat Identities</span>
                </div>
                <p className="text-[11px] text-neutral-500 px-1">
                  Choose which identity of this account you want to chat with:
                </p>

                <div className="grid grid-cols-1 gap-2">
                  {/* First Identity Card */}
                  {lookupResult.firstIdentity ? (
                    <div className="p-3 bg-neutral-950/80 border border-neutral-800/80 hover:border-emerald-500/40 rounded-xl flex items-center justify-between transition-colors">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={lookupResult.firstIdentity.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix'}
                          alt="First Identity"
                          className="w-9 h-9 rounded-full border border-emerald-500/30 object-cover"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-neutral-200">
                              {lookupResult.firstIdentity.displayName}
                            </span>
                            <span className="text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.2 rounded font-medium">
                              First Identity
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-neutral-500">
                            @{lookupResult.firstIdentity.username}
                          </span>
                        </div>
                      </div>

                      <button
                        id="chat-first-identity-btn"
                        onClick={() => handleStartChat(lookupResult.firstIdentity!)}
                        disabled={startingChatWith === lookupResult.firstIdentity.id}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        {startingChatWith === lookupResult.firstIdentity.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="w-3.5 h-3.5" />
                        )}
                        <span>Message</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 bg-neutral-950/40 border border-neutral-900 rounded-xl text-xs text-neutral-500 italic">
                      First Identity not configured yet by user.
                    </div>
                  )}

                  {/* Second Identity Card */}
                  {lookupResult.secondIdentity ? (
                    <div className="p-3 bg-neutral-950/80 border border-neutral-800/80 hover:border-sky-500/40 rounded-xl flex items-center justify-between transition-colors">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={lookupResult.secondIdentity.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow'}
                          alt="Second Identity"
                          className="w-9 h-9 rounded-full border border-sky-500/30 object-cover"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-neutral-200">
                              {lookupResult.secondIdentity.displayName}
                            </span>
                            <span className="text-[10px] bg-sky-500/15 border border-sky-500/30 text-sky-400 px-1.5 py-0.2 rounded font-medium">
                              Second Identity
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-neutral-500">
                            @{lookupResult.secondIdentity.username}
                          </span>
                        </div>
                      </div>

                      <button
                        id="chat-second-identity-btn"
                        onClick={() => handleStartChat(lookupResult.secondIdentity!)}
                        disabled={startingChatWith === lookupResult.secondIdentity.id}
                        className="px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        {startingChatWith === lookupResult.secondIdentity.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="w-3.5 h-3.5" />
                        )}
                        <span>Message</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 bg-neutral-950/40 border border-neutral-900 rounded-xl text-xs text-neutral-500 italic">
                      Second Identity not configured yet by user.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-neutral-950 border border-neutral-800 flex items-center justify-center mx-auto text-neutral-500">
                <Search className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-medium text-neutral-300">Enter an Account Code above</h4>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Ask your contact for their 6-character CalcChat Account Code (e.g. <span className="font-mono text-emerald-400">CX7429</span>) to connect and start messaging.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
