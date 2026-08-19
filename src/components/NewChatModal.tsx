import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getOrCreateConversation, lookupAccountAndIdentitiesByCode, saveContact } from '../lib/chatService';
import { ChatIdentity, Conversation, AccountLookupResult } from '../types';
import { Search, UserPlus, X, MessageSquare, Loader2, Bookmark, Check, AlertCircle, Hash } from 'lucide-react';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (conversation: Conversation) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose, onSelectConversation }) => {
  const { userAccount, activeIdentity } = useAuth();
  const [accountCodeSearch, setAccountCodeSearch] = useState('');
  const [lookupResult, setLookupResult] = useState<AccountLookupResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearchingCode, setIsSearchingCode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savedContactId, setSavedContactId] = useState<string | null>(null);

  if (!isOpen || !activeIdentity) return null;

  const handleSearchCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = accountCodeSearch.trim().toUpperCase();
    if (!cleanCode) return;

    setIsSearchingCode(true);
    setSearchError(null);
    setLookupResult(null);
    try {
      const result = await lookupAccountAndIdentitiesByCode(cleanCode);
      if (!result) setSearchError(`No CalcChat account found with code "${cleanCode}".`);
      else if (result.account.uid === userAccount?.uid) setSearchError('That is your own Account Code. Enter another user\'s code.');
      else setLookupResult(result);
    } catch (err) {
      console.error('Account lookup error:', err);
      setSearchError('Error searching Account Code.');
    } finally {
      setIsSearchingCode(false);
    }
  };

  const handleStartChat = async (targetIdentity: ChatIdentity) => {
    setCreating(true);
    try {
      const conv = await getOrCreateConversation(
        activeIdentity,
        targetIdentity,
        userAccount?.accountCode,
        lookupResult?.account.accountCode
      );
      onSelectConversation(conv);
      onClose();
    } catch (err) {
      console.error('Error starting conversation:', err);
      setSearchError('Could not open chat. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleAddContact = async (targetIdentity: ChatIdentity) => {
    if (!lookupResult) return;
    try {
      const id = await saveContact(activeIdentity, targetIdentity, lookupResult.account.accountCode);
      setSavedContactId(id);
      setTimeout(() => setSavedContactId(null), 2500);
    } catch (err) {
      console.error('Error saving contact:', err);
      setSearchError('Could not save this contact.');
    }
  };

  const renderIdentity = (identity: ChatIdentity | null, accent: 'green' | 'blue') => {
    if (!identity) return null;
    const saved = savedContactId === `${activeIdentity.id}_${identity.id}`;
    return (
      <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
        <div className="flex items-center gap-2.5">
          <img src={identity.avatar} alt={identity.displayName} className={`w-9 h-9 rounded-full object-cover border ${accent === 'green' ? 'border-emerald-500/40' : 'border-sky-500/40'}`} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-neutral-100 truncate">{identity.displayName}</div>
            <div className="text-[10px] text-neutral-400 font-mono">{identity.type === 'first' ? '1st Identity' : '2nd Identity'} • @{identity.username}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => handleStartChat(identity)} disabled={creating} className={`flex-1 py-2 ${accent === 'green' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-sky-600 hover:bg-sky-500'} disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5`}>
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
            Open Chat
          </button>
          <button type="button" onClick={() => handleAddContact(identity)} className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-xl" title="Add to contacts">
            {saved ? <Check className="w-4 h-4 text-emerald-400" /> : <Bookmark className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div id="new-chat-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div id="new-chat-modal-card" className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400"><UserPlus className="w-4 h-4" /></div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">Add / Start New Chat</h2>
              <p className="text-xs text-neutral-400">Use the other person\'s unique Account Code</p>
            </div>
          </div>
          <button id="close-new-chat-btn" onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 border-b border-neutral-800 bg-neutral-950/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-emerald-400" />Find by Account Code</span>
            <span className="text-[10px] text-neutral-500">Only the exact code can find an account</span>
          </div>
          <form onSubmit={handleSearchCode} className="flex gap-2">
            <input id="search-account-code-input" type="text" value={accountCodeSearch} onChange={e => setAccountCodeSearch(e.target.value.toUpperCase())} placeholder="Enter Account Code" maxLength={12} className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm font-mono uppercase text-emerald-400 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 tracking-wider" />
            <button id="search-code-submit-btn" type="submit" disabled={isSearchingCode || !accountCodeSearch.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5">
              {isSearchingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Search
            </button>
          </form>
          {searchError && <div className="flex items-center gap-2 p-2.5 bg-red-950/40 border border-red-800/40 rounded-xl text-xs text-red-400"><AlertCircle className="w-4 h-4 shrink-0" /><span>{searchError}</span></div>}
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {!lookupResult ? (
            <div className="py-12 text-center text-xs text-neutral-500">
              <Hash className="w-8 h-8 mx-auto mb-3 text-neutral-700" />
              Enter the person\'s Account Code to find them.
              <div className="mt-2 text-[11px] text-neutral-600">Their Account Code is visible in their own CalcChat account.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center gap-3">
                <img src={lookupResult.account.avatar} alt={lookupResult.account.displayName} className="w-11 h-11 rounded-full object-cover border border-neutral-700" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-100">{lookupResult.account.displayName}</div>
                  <div className="text-xs font-mono text-emerald-400">Account Code: {lookupResult.account.accountCode}</div>
                </div>
              </div>
              <div className="text-[11px] text-neutral-400 font-semibold uppercase tracking-wider">Choose which identity to chat with</div>
              {renderIdentity(lookupResult.firstIdentity, 'green')}
              {renderIdentity(lookupResult.secondIdentity, 'blue')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
