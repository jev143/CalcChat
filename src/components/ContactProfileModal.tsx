import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  toggleBlockIdentity,
  checkIsIdentityBlocked,
  deleteContact,
  toggleMuteContact,
  togglePinConversation,
  getOrCreateConversation,
} from '../lib/chatService';
import { ChatIdentity, Contact, Conversation, ParticipantMeta } from '../types';
import {
  X,
  User,
  Shield,
  MessageSquare,
  Phone,
  Video,
  VolumeX,
  Volume2,
  Pin,
  Ban,
  Trash2,
  Check,
  AlertCircle,
  Copy,
  Sparkles,
} from 'lucide-react';

interface ContactProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetIdentity?: ChatIdentity | ParticipantMeta | null;
  contact?: Contact | null;
  conversation?: Conversation | null;
  onSelectConversation?: (conv: Conversation) => void;
  onStartCall?: (type: 'audio' | 'video') => void;
}

export const ContactProfileModal: React.FC<ContactProfileModalProps> = ({
  isOpen,
  onClose,
  targetIdentity,
  contact,
  conversation,
  onSelectConversation,
  onStartCall,
}) => {
  const { activeIdentity, userAccount } = useAuth();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const targetId = targetIdentity?.identityId || (targetIdentity as any)?.id || contact?.contactIdentityId;
  const displayName = targetIdentity?.displayName || contact?.displayName || 'Contact';
  const avatar = targetIdentity?.avatar || contact?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix';
  const username = targetIdentity?.username || contact?.username || '';
  const accountCode = (targetIdentity as any)?.accountCode || contact?.contactAccountCode || '';
  const about = (targetIdentity as any)?.about || contact?.about || 'Available on CalcChat';
  const statusMessage = (targetIdentity as any)?.statusMessage || '';

  useEffect(() => {
    if (!isOpen || !activeIdentity || !targetId) return;

    // Check block status
    checkIsIdentityBlocked(targetId, activeIdentity.id).then((blocked) => {
      setIsBlocked(blocked);
    });

    if (conversation) {
      setIsMuted(conversation.mutedBy?.includes(activeIdentity.id) || false);
      setIsPinned(conversation.pinnedBy?.includes(activeIdentity.id) || false);
    }
  }, [isOpen, activeIdentity, targetId, conversation]);

  if (!isOpen || !activeIdentity || !targetId) return null;

  const handleCopyCode = async () => {
    if (!accountCode) return;
    try {
      await navigator.clipboard.writeText(accountCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const handleToggleBlock = async () => {
    setLoading(true);
    try {
      const nextBlocked = !isBlocked;
      await toggleBlockIdentity(activeIdentity.id, targetId, isBlocked);
      setIsBlocked(nextBlocked);
      setActionSuccess(nextBlocked ? 'Contact blocked' : 'Contact unblocked');
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err) {
      console.error('Error toggling block:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMute = async () => {
    if (!conversation) return;
    setLoading(true);
    try {
      const nextMuted = !isMuted;
      await toggleMuteContact(contact?.id || '', nextMuted);
      setIsMuted(nextMuted);
      setActionSuccess(nextMuted ? 'Notifications muted' : 'Notifications unmuted');
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err) {
      console.error('Error toggling mute:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePin = async () => {
    if (!conversation) return;
    setLoading(true);
    try {
      const nextPinned = !isPinned;
      await togglePinConversation(conversation.id, activeIdentity.id, isPinned);
      setIsPinned(nextPinned);
      setActionSuccess(nextPinned ? 'Chat pinned to top' : 'Chat unpinned');
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err) {
      console.error('Error toggling pin:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!contact) return;
    setLoading(true);
    try {
      await deleteContact(contact.id);
      setActionSuccess('Contact removed from address book');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Error deleting contact:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="contact-profile-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="contact-profile-card"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <User className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-neutral-100">Contact Info</h2>
          </div>
          <button
            id="close-contact-profile-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Action Success Alert */}
          {actionSuccess && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-400">
              <Check className="w-4 h-4 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Avatar & Name Banner */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="relative">
              <img
                src={avatar}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover border-2 border-neutral-700 shadow-lg"
              />
              {isBlocked && (
                <div className="absolute -bottom-1 -right-1 bg-red-500 text-white p-1 rounded-full text-[10px]">
                  <Ban className="w-4 h-4" />
                </div>
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-100">{displayName}</h3>
              {username && (
                <p className="text-xs font-mono text-emerald-400">@{username}</p>
              )}
            </div>
          </div>

          {/* Quick Action Buttons (Chat / Audio / Video) */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                if (conversation && onSelectConversation) {
                  onSelectConversation(conversation);
                }
                onClose();
              }}
              className="p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 rounded-2xl flex flex-col items-center gap-1 text-xs text-neutral-300 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-5 h-5 text-emerald-400" />
              <span>Message</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (onStartCall) onStartCall('audio');
                onClose();
              }}
              className="p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 rounded-2xl flex flex-col items-center gap-1 text-xs text-neutral-300 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <Phone className="w-5 h-5 text-emerald-400" />
              <span>Audio Call</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (onStartCall) onStartCall('video');
                onClose();
              }}
              className="p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 rounded-2xl flex flex-col items-center gap-1 text-xs text-neutral-300 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <Video className="w-5 h-5 text-emerald-400" />
              <span>Video Call</span>
            </button>
          </div>

          {/* About / Status */}
          <div className="p-3.5 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-1">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              About
            </span>
            <p className="text-sm text-neutral-200">{about}</p>
          </div>
          {statusMessage && (
            <div className="p-3.5 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-1">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Status
              </span>
              <p className="text-sm text-neutral-200">{statusMessage}</p>
            </div>
          )}

          {/* Account Code Box */}
          {accountCode && (
            <div className="p-3.5 bg-neutral-950 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                  Account Code
                </span>
                <span className="text-sm font-mono font-bold text-emerald-400 tracking-wider">
                  {accountCode}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs font-semibold text-neutral-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}

          {/* Options / Action List */}
          <div className="bg-neutral-950 rounded-2xl border border-neutral-800 divide-y divide-neutral-900 overflow-hidden text-xs">
            {conversation && (
              <>
                <button
                  type="button"
                  onClick={handleTogglePin}
                  disabled={loading}
                  className="w-full p-3.5 flex items-center justify-between text-neutral-300 hover:bg-neutral-900 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Pin className={`w-4 h-4 ${isPinned ? 'text-amber-400' : 'text-neutral-400'}`} />
                    <span>{isPinned ? 'Unpin Conversation' : 'Pin Conversation to Top'}</span>
                  </div>
                  {isPinned && <span className="text-[10px] text-amber-400 font-semibold uppercase">Pinned</span>}
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  disabled={loading}
                  className="w-full p-3.5 flex items-center justify-between text-neutral-300 hover:bg-neutral-900 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {isMuted ? (
                      <Volume2 className="w-4 h-4 text-neutral-400" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-neutral-400" />
                    )}
                    <span>{isMuted ? 'Unmute Notifications' : 'Mute Notifications'}</span>
                  </div>
                  {isMuted && <span className="text-[10px] text-neutral-500 font-semibold uppercase">Muted</span>}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleToggleBlock}
              disabled={loading}
              className={`w-full p-3.5 flex items-center justify-between transition-colors cursor-pointer ${
                isBlocked ? 'text-emerald-400 hover:bg-neutral-900' : 'text-red-400 hover:bg-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Ban className="w-4 h-4" />
                <span>{isBlocked ? 'Unblock Contact' : 'Block Contact'}</span>
              </div>
            </button>

            {contact && (
              <button
                type="button"
                onClick={handleDeleteContact}
                disabled={loading}
                className="w-full p-3.5 flex items-center gap-2.5 text-red-400 hover:bg-neutral-900 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove from Contacts</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
