import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToConversations,
  subscribeToMessages,
  subscribeToContacts,
  sendMessage,
  markConversationAsRead,
  deleteContact,
  clearConversationMessages,
  deleteMessage,
  toggleMessageReaction,
  setTypingStatus,
  subscribeToTypingStatus,
  togglePinConversation,
  toggleMuteConversation,
  toggleArchiveConversation,
  deleteConversationForIdentity,
  updatePresenceHeartbeat,
  subscribeToIdentityPresence,
  editMessageText,
  checkIsIdentityBlocked,
  toggleBlockIdentity,
} from '../lib/chatService';
import {
  uploadMediaToStorage,
  validateMediaFile,
} from '../lib/storageService';
import {
  subscribeToIncomingCalls,
} from '../lib/callService';
import {
  Conversation,
  Message,
  ParticipantMeta,
  Contact,
  MessageType,
  MessageReplyInfo,
  CallSession,
  ChatIdentity,
} from '../types';
import { AddContactModal } from './AddContactModal';
import { NewChatModal } from './NewChatModal';
import { ContactProfileModal } from './ContactProfileModal';
import { IdentitySettingsModal } from './IdentitySettingsModal';
import { MediaViewerModal } from './MediaViewerModal';
import { VoiceRecorder } from './VoiceRecorder';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import { CallModal } from './CallModal';
import {
  Lock,
  Search,
  Plus,
  Send,
  ArrowLeft,
  Settings,
  Shield,
  Check,
  CheckCheck,
  MessageSquare,
  Sparkles,
  Smile,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Video as VideoIcon,
  Mic,
  Trash2,
  Bookmark,
  UserPlus,
  Copy,
  Reply,
  X,
  Download,
  MoreVertical,
  Phone,
  Video,
  Loader2,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  FileBox,
  Pin,
  VolumeX,
  Archive,
  Ban,
  User,
  Clock,
  Edit2,
  CheckCircle2,
} from 'lucide-react';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

export const ChatView: React.FC = () => {
  const { activeIdentity, userAccount, lockActiveIdentity } = useAuth();

  // State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'contacts' | 'archived'>('chats');

  // In-Chat Message Search
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  // Editing Message
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');

  // Modals & Tools
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedContactForProfile, setSelectedContactForProfile] = useState<Contact | null>(null);

  // Presence & Typing State
  const [recipientPresence, setRecipientPresence] = useState<{ isOnline: boolean; lastActiveAt?: number }>({
    isOnline: false,
  });
  const [typingParticipants, setTypingParticipants] = useState<string[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Modals Data
  const [mediaViewerData, setMediaViewerData] = useState<{
    isOpen: boolean;
    url: string;
    type: MessageType;
    fileName?: string;
    senderName?: string;
    fileSize?: number;
  }>({
    isOpen: false,
    url: '',
    type: 'text',
  });

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageReplyInfo | null>(null);
  const [sending, setSending] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [chatItemMenuId, setChatItemMenuId] = useState<string | null>(null);

  // File Upload State
  const [uploadState, setUploadState] = useState<{
    isUploading: boolean;
    progress: number;
    fileName: string;
    type: MessageType;
  } | null>(null);

  // WebRTC Calling State
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{
    receiverIdentityId: string;
    receiverName: string;
    receiverAvatar: string;
    receiverUid: string;
    callType: 'audio' | 'video';
    conversationId?: string;
  } | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. PRESENCE HEARTBEAT (updates active identity every 30s)
  useEffect(() => {
    if (!activeIdentity) return;

    updatePresenceHeartbeat(activeIdentity.id);
    const interval = setInterval(() => {
      updatePresenceHeartbeat(activeIdentity.id);
    }, 30000);

    return () => clearInterval(interval);
  }, [activeIdentity?.id]);

  // 2. SUBSCRIBE TO CONVERSATIONS
  useEffect(() => {
    if (!activeIdentity) return;

    const unsubscribe = subscribeToConversations(
      activeIdentity.id,
      (convs) => {
        setConversations(convs);
        setActiveConversation((prev) => {
          if (!prev) return null;
          const updated = convs.find((c) => c.id === prev.id);
          return updated || prev;
        });
      },
      (err) => {
        console.error('Conversations error:', err);
      }
    );

    return () => unsubscribe();
  }, [activeIdentity?.id]);

  // 3. SUBSCRIBE TO SAVED CONTACTS (Isolated per identity)
  useEffect(() => {
    if (!activeIdentity) return;

    const unsubscribe = subscribeToContacts(
      activeIdentity.id,
      (fetchedContacts) => {
        setContacts(fetchedContacts);
      },
      (err) => {
        console.error('Contacts error:', err);
      }
    );

    return () => unsubscribe();
  }, [activeIdentity?.id]);

  // 4. SUBSCRIBE TO MESSAGES IN ACTIVE CONVERSATION
  useEffect(() => {
    if (!activeConversation || !activeIdentity) {
      setMessages([]);
      return;
    }

    markConversationAsRead(activeConversation.id, activeIdentity.id);

    const unsubscribe = subscribeToMessages(
      activeConversation.id,
      activeIdentity.id,
      (msgs) => {
        setMessages(msgs);
        markConversationAsRead(activeConversation.id, activeIdentity.id);
      },
      (err) => {
        console.error('Messages stream error:', err);
      }
    );

    return () => unsubscribe();
  }, [activeConversation?.id, activeIdentity?.id]);

  // 5. SUBSCRIBE TO RECIPIENT PRESENCE & TYPING
  useEffect(() => {
    if (!activeConversation || !activeIdentity) return;

    const recipientId = activeConversation.participantIdentityIds.find(
      (id) => id !== activeIdentity.id
    );

    if (!recipientId) return;

    const unsubPresence = subscribeToIdentityPresence(recipientId, (presence) => {
      setRecipientPresence(presence);
    });

    const unsubTyping = subscribeToTypingStatus(
      activeConversation.id,
      activeIdentity.id,
      (typingIds) => {
        setTypingParticipants(typingIds);
      }
    );

    return () => {
      unsubPresence();
      unsubTyping();
    };
  }, [activeConversation?.id, activeIdentity?.id]);

  // 6. SUBSCRIBE TO INCOMING WEBRTC CALLS
  useEffect(() => {
    if (!activeIdentity) return;

    const unsubscribe = subscribeToIncomingCalls(activeIdentity.id, (call) => {
      setIncomingCall(call);
      setIsCallModalOpen(true);
    });

    return () => unsubscribe();
  }, [activeIdentity?.id]);

  // Auto-scroll to bottom of message list
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, replyingTo, uploadState, typingParticipants]);

  if (!activeIdentity || !userAccount) return null;

  const isFirstIdentity = activeIdentity.type === 'first';

  // Helper to extract recipient metadata
  const getRecipientMeta = (conv: Conversation): ParticipantMeta | null => {
    const otherId = conv.participantIdentityIds.find((id) => id !== activeIdentity.id);
    if (!otherId) {
      return conv.participantsMeta[activeIdentity.id] || null;
    }
    return conv.participantsMeta[otherId] || null;
  };

  // Handle typing debounce
  const handleInputChange = (val: string) => {
    setInputText(val);
    if (!activeConversation || !activeIdentity) return;

    setTypingStatus(activeConversation.id, activeIdentity.id, true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setTypingStatus(activeConversation.id, activeIdentity.id, false);
    }, 3000);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeConversation || !activeIdentity || sending) return;

    const text = inputText.trim();
    const currentReply = replyingTo || undefined;
    setInputText('');
    setReplyingTo(null);
    setSending(true);

    // Stop typing status immediately
    setTypingStatus(activeConversation.id, activeIdentity.id, false);

    try {
      const recipientId = activeConversation.participantIdentityIds.find(
        (id) => id !== activeIdentity.id
      );
      const recipientMeta = recipientId
        ? activeConversation.participantsMeta[recipientId]
        : undefined;

      await sendMessage(activeConversation.id, activeIdentity, {
        type: 'text',
        text,
        replyTo: currentReply,
        recipientIdentityId: recipientId,
        recipientUid: recipientMeta?.uid,
        recipientDisplayName: recipientMeta?.displayName,
      });
    } catch (err: any) {
      console.error('Failed to send message:', err);
      showToast(err.message || 'Failed to send message.');
      setInputText(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Handle message text editing
  const handleSaveEdit = async () => {
    if (!editingMessage || !editText.trim() || !activeConversation) return;
    try {
      await editMessageText(activeConversation.id, editingMessage.id, editText.trim());
      setEditingMessage(null);
      setEditText('');
      showToast('Message edited');
    } catch (err) {
      console.error('Error editing message:', err);
      showToast('Failed to edit message.');
    }
  };

  // Send Voice Note via Firebase Storage
  const handleSendVoiceNote = async (audioBlob: Blob, durationSeconds: number) => {
    if (!activeConversation || !activeIdentity) return;
    setIsRecordingVoice(false);
    setSending(true);

    const voiceExtension =
      audioBlob.type.includes('ogg') ? 'ogg' :
      audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a') ? 'm4a' :
      audioBlob.type.includes('wav') ? 'wav' :
      'webm';
    const fileName = `voice_${Date.now()}.${voiceExtension}`;
    setUploadState({
      isUploading: true,
      progress: 0,
      fileName: 'Voice note',
      type: 'audio',
    });

    try {
      const recipientId = activeConversation.participantIdentityIds.find(
        (id) => id !== activeIdentity.id
      );
      const recipientMeta = recipientId
        ? activeConversation.participantsMeta[recipientId]
        : undefined;

      const uploadResult = await uploadMediaToStorage(
        audioBlob,
        activeConversation.id,
        fileName,
        (progress) => {
          setUploadState((prev) => (prev ? { ...prev, progress } : null));
        },
        activeIdentity.uid,
        recipientMeta?.uid
      );

      await sendMessage(activeConversation.id, activeIdentity, {
        type: 'audio',
        fileUrl: uploadResult.downloadUrl,
        fileName: uploadResult.fileName,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType,
        storagePath: uploadResult.storagePath,
        audioDuration: durationSeconds,
        recipientIdentityId: recipientId,
        recipientUid: recipientMeta?.uid,
        recipientDisplayName: recipientMeta?.displayName,
      });

      showToast('Voice message sent');
    } catch (err) {
      console.error('Error sending audio message:', err);
      showToast('Failed to send voice message.');
    } finally {
      setSending(false);
      setUploadState(null);
    }
  };

  // Upload Media (Image, Video, Document) with progress
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: MessageType
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversation || !activeIdentity) return;

    setAttachmentMenuOpen(false);

    const validation = validateMediaFile(file, type);
    if (!validation.valid) {
      showToast(validation.error || 'Invalid file.');
      e.target.value = '';
      return;
    }

    setSending(true);
    setUploadState({
      isUploading: true,
      progress: 0,
      fileName: file.name,
      type,
    });

    try {
      const recipientId = activeConversation.participantIdentityIds.find(
        (id) => id !== activeIdentity.id
      );
      const recipientMeta = recipientId
        ? activeConversation.participantsMeta[recipientId]
        : undefined;

      const uploadResult = await uploadMediaToStorage(
        file,
        activeConversation.id,
        file.name,
        (progress) => {
          setUploadState((prev) => (prev ? { ...prev, progress } : null));
        },
        activeIdentity.uid,
        recipientMeta?.uid
      );

      await sendMessage(activeConversation.id, activeIdentity, {
        type,
        fileUrl: uploadResult.downloadUrl,
        fileName: uploadResult.fileName,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType,
        storagePath: uploadResult.storagePath,
        thumbnailUrl: uploadResult.thumbnailUrl,
        recipientIdentityId: recipientId,
        recipientUid: recipientMeta?.uid,
        recipientDisplayName: recipientMeta?.displayName,
      });

      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} sent`);
    } catch (err) {
      console.error('Error uploading file:', err);
      showToast('Failed to upload file.');
    } finally {
      setSending(false);
      setUploadState(null);
      e.target.value = '';
    }
  };

  // Start Voice or Video Call
  const handleStartCall = (callType: 'audio' | 'video') => {
    if (!activeConversation || !activeIdentity) return;
    const recipientMeta = getRecipientMeta(activeConversation);
    const recipientId = activeConversation.participantIdentityIds.find(
      (id) => id !== activeIdentity.id
    );

    if (!recipientId || !recipientMeta) {
      showToast('Cannot call this user.');
      return;
    }

    setOutgoingCall({
      receiverIdentityId: recipientId,
      receiverName: recipientMeta.displayName,
      receiverAvatar: recipientMeta.avatar,
      receiverUid: recipientMeta.uid,
      callType,
      conversationId: activeConversation.id,
    });
    setIncomingCall(null);
    setIsCallModalOpen(true);
  };

  const formatMessageTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return format(date, 'h:mm a');
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatConversationTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  };

  const formatPresenceStatus = () => {
    if (typingParticipants.length > 0) {
      return <span className="text-emerald-400 font-medium animate-pulse">typing...</span>;
    }
    if (recipientPresence.isOnline) {
      return <span className="text-emerald-400 font-medium">Online</span>;
    }
    if (recipientPresence.lastActiveAt) {
      return (
        <span className="text-neutral-400">
          Last seen {formatDistanceToNow(recipientPresence.lastActiveAt, { addSuffix: true })}
        </span>
      );
    }
    return <span className="text-neutral-500">Offline</span>;
  };

  const getDocumentIcon = (fileName?: string, mimeType?: string) => {
    const ext = fileName?.split('.').pop()?.toLowerCase() || '';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <FileArchive className="w-6 h-6 text-amber-400" />;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return <FileSpreadsheet className="w-6 h-6 text-emerald-400" />;
    }
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'json', 'py', 'java', 'css'].includes(ext)) {
      return <FileCode className="w-6 h-6 text-sky-400" />;
    }
    if (['pdf'].includes(ext)) {
      return <FileText className="w-6 h-6 text-red-400" />;
    }
    return <FileBox className="w-6 h-6 text-neutral-300" />;
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    const isArchived = c.archivedBy?.includes(activeIdentity.id) || false;
    if (sidebarTab === 'archived' && !isArchived) return false;
    if (sidebarTab === 'chats' && isArchived) return false;

    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    const otherMeta = getRecipientMeta(c);
    return (
      otherMeta?.displayName?.toLowerCase().includes(q) ||
      otherMeta?.username?.toLowerCase().includes(q) ||
      otherMeta?.accountCode?.toLowerCase().includes(q) ||
      c.lastMessage?.text?.toLowerCase().includes(q)
    );
  });

  // Filter contacts
  const filteredContacts = contacts.filter((c) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      c.displayName.toLowerCase().includes(q) ||
      c.contactAccountCode.toLowerCase().includes(q) ||
      c.username?.toLowerCase().includes(q)
    );
  });

  // In-Chat Message Search Filter
  const displayedMessages = chatSearchQuery.trim()
    ? messages.filter((m) =>
        m.text?.toLowerCase().includes(chatSearchQuery.toLowerCase())
      )
    : messages;

  const totalUnread = conversations.reduce((acc, curr) => {
    if (curr.archivedBy?.includes(activeIdentity.id)) return acc;
    return acc + (curr.unreadCounts?.[activeIdentity.id] || 0);
  }, 0);

  return (
    <div
      id="calcchat-whatsapp-container"
      className="flex h-screen w-full bg-neutral-950 text-neutral-100 overflow-hidden font-sans select-none"
    >
      {/* ========================================================= */}
      {/* LEFT SIDEBAR: Chats & Contacts Panel */}
      {/* ========================================================= */}
      <div
        id="calcchat-sidebar"
        className={`w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col bg-neutral-900 border-r border-neutral-800/80 z-20 ${
          activeConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-neutral-800 bg-neutral-950/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <img
                src={activeIdentity.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix'}
                alt={activeIdentity.displayName}
                className="w-10 h-10 rounded-full border border-neutral-700 object-cover bg-neutral-800"
              />
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-neutral-900 ${
                  isFirstIdentity ? 'bg-emerald-500' : 'bg-sky-500'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-neutral-100 truncate max-w-[120px]">
                  {activeIdentity.displayName}
                </span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                    isFirstIdentity
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                  }`}
                >
                  {isFirstIdentity ? 'First' : 'Second'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                <span>@{userAccount.accountCode}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(userAccount.accountCode);
                    showToast('Account Code copied!');
                  }}
                  className="text-neutral-500 hover:text-neutral-300 transition-colors ml-0.5"
                  title="Copy your Account Code"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-1">
            {/* Lock Identity -> Back to Calculator */}
            <button
              id="lock-identity-btn"
              onClick={lockActiveIdentity}
              className="p-2 rounded-xl text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 transition-colors"
              title="Stealth Lock (Open Calculator)"
            >
              <Lock className="w-4 h-4" />
            </button>

            {/* Start New Conversation */}
            <button
              id="new-chat-btn"
              onClick={() => setIsNewChatOpen(true)}
              className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 transition-colors"
              title="Start New Chat"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Settings */}
            <button
              id="settings-btn"
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
              title="Vault Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-2.5 border-b border-neutral-800/80 bg-neutral-900">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search chats, contacts, or message..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-2.5 top-2 text-neutral-500 hover:text-neutral-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs (Chats / Contacts / Archived) */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/40 text-xs">
          <button
            id="tab-chats-btn"
            onClick={() => setSidebarTab('chats')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              sidebarTab === 'chats'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900/60'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chats</span>
            {totalUnread > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-emerald-500 text-neutral-950 text-[10px] font-bold rounded-full">
                {totalUnread}
              </span>
            )}
          </button>
          <button
            id="tab-contacts-btn"
            onClick={() => setSidebarTab('contacts')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              sidebarTab === 'contacts'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900/60'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Contacts ({contacts.length})</span>
          </button>
          <button
            id="tab-archived-btn"
            onClick={() => setSidebarTab('archived')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              sidebarTab === 'archived'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900/60'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archived</span>
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/40">
          {/* ===================== CHATS / ARCHIVED TAB ===================== */}
          {(sidebarTab === 'chats' || sidebarTab === 'archived') && (
            <>
              {filteredConversations.length > 0 ? (
                filteredConversations.map((conv) => {
                  const recipientMeta = getRecipientMeta(conv);
                  const isActive = activeConversation?.id === conv.id;
                  const unread = conv.unreadCounts?.[activeIdentity.id] || 0;
                  const isPinned = conv.pinnedBy?.includes(activeIdentity.id) || false;
                  const isMuted = conv.mutedBy?.includes(activeIdentity.id) || false;
                  const isArchived = conv.archivedBy?.includes(activeIdentity.id) || false;

                  return (
                    <div
                      key={conv.id}
                      id={`conv-item-${conv.id}`}
                      className={`relative p-3 flex items-center gap-3 cursor-pointer transition-colors group ${
                        isActive
                          ? 'bg-neutral-800/80 border-l-2 border-emerald-500'
                          : 'hover:bg-neutral-800/40'
                      }`}
                      onClick={() => setActiveConversation(conv)}
                    >
                      <div className="relative shrink-0">
                        <img
                          src={
                            recipientMeta?.avatar ||
                            'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow'
                          }
                          alt={recipientMeta?.displayName || 'Contact'}
                          className="w-11 h-11 rounded-full border border-neutral-700 object-cover bg-neutral-800"
                        />
                        {unread > 0 && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-neutral-950 text-[10px] font-bold flex items-center justify-center shadow">
                            {unread}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 truncate">
                            <h4 className="text-xs font-semibold text-neutral-100 truncate">
                              {recipientMeta?.displayName || 'Chat'}
                            </h4>
                            {isPinned && <Pin className="w-3 h-3 text-amber-400 shrink-0" />}
                            {isMuted && <VolumeX className="w-3 h-3 text-neutral-500 shrink-0" />}
                          </div>
                          <span className="text-[10px] text-neutral-500 font-mono shrink-0 ml-1">
                            {formatConversationTime(conv.lastMessage?.timestamp || conv.updatedAt)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <p className="text-neutral-400 truncate text-[11px] max-w-[170px]">
                            {conv.lastMessage?.text || 'No messages yet'}
                          </p>
                          {recipientMeta?.type && (
                            <span
                              className={`text-[9px] px-1 py-0.2 rounded font-medium border shrink-0 ${
                                recipientMeta.type === 'first'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                              }`}
                            >
                              {recipientMeta.type === 'first' ? '1st' : '2nd'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Item Actions Dropdown Menu */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChatItemMenuId(chatItemMenuId === conv.id ? null : conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-neutral-200 transition-opacity"
                        title="Chat Options"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {chatItemMenuId === conv.id && (
                        <div
                          className="absolute right-2 top-10 w-40 bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl p-1 z-30 space-y-0.5 animate-in fade-in zoom-in-95 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={async () => {
                              await togglePinConversation(conv.id, activeIdentity.id, isPinned);
                              setChatItemMenuId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-800 rounded-lg flex items-center gap-2 text-neutral-300"
                          >
                            <Pin className="w-3.5 h-3.5 text-amber-400" />
                            <span>{isPinned ? 'Unpin' : 'Pin to top'}</span>
                          </button>
                          <button
                            onClick={async () => {
                              await toggleMuteConversation(conv.id, activeIdentity.id, isMuted);
                              setChatItemMenuId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-800 rounded-lg flex items-center gap-2 text-neutral-300"
                          >
                            <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                          </button>
                          <button
                            onClick={async () => {
                              await toggleArchiveConversation(conv.id, activeIdentity.id, isArchived);
                              setChatItemMenuId(null);
                              showToast(isArchived ? 'Chat unarchived' : 'Chat archived');
                            }}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-800 rounded-lg flex items-center gap-2 text-neutral-300"
                          >
                            <Archive className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{isArchived ? 'Unarchive' : 'Archive'}</span>
                          </button>
                          <button
                            onClick={async () => {
                              if (window.confirm('Delete this conversation for yourself?')) {
                                await deleteConversationForIdentity(conv.id, activeIdentity.id);
                                if (activeConversation?.id === conv.id) {
                                  setActiveConversation(null);
                                }
                                showToast('Conversation deleted');
                              }
                              setChatItemMenuId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-800 rounded-lg flex items-center gap-2 text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Chat</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="py-12 px-4 text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-500 mx-auto">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-neutral-400">
                    {sidebarTab === 'archived' ? 'No archived chats.' : 'No active chats.'}
                  </p>
                  {sidebarTab === 'chats' && (
                    <button
                      onClick={() => setIsNewChatOpen(true)}
                      className="px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs font-medium rounded-xl transition-colors"
                    >
                      + Start New Chat
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ===================== CONTACTS TAB ===================== */}
          {sidebarTab === 'contacts' && (
            <div className="p-2.5 space-y-2">
              <button
                id="add-contact-action-btn"
                onClick={() => setIsAddContactOpen(true)}
                className="w-full p-2.5 bg-neutral-950 border border-dashed border-neutral-800 hover:border-emerald-500/50 rounded-xl text-xs text-emerald-400 font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Contact via Account Code</span>
              </button>

              {filteredContacts.length > 0 ? (
                filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="p-3 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-2.5 hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-2.5 cursor-pointer"
                        onClick={() => {
                          setSelectedContactForProfile(contact);
                          setIsProfileModalOpen(true);
                        }}
                      >
                        <img
                          src={contact.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow'}
                          alt={contact.displayName}
                          className="w-9 h-9 rounded-full border border-neutral-700 object-cover"
                        />
                        <div>
                          <h4 className="text-xs font-semibold text-neutral-100 hover:text-emerald-400 transition-colors">
                            {contact.displayName}
                          </h4>
                          <span className="text-[11px] font-mono text-emerald-400 font-medium">
                            @{contact.contactAccountCode}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedContactForProfile(contact);
                            setIsProfileModalOpen(true);
                          }}
                          className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
                          title="View contact info"
                        >
                          <User className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm(`Remove ${contact.displayName} from contacts?`)) {
                              await deleteContact(contact.id);
                              showToast('Contact removed');
                            }
                          }}
                          className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors"
                          title="Remove contact"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-1.5 pt-1 border-t border-neutral-800/60">
                      <button
                        onClick={() => {
                          setIsNewChatOpen(true);
                        }}
                        className="flex-1 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-[11px] font-medium rounded-lg flex items-center justify-center gap-1 transition-colors border border-neutral-800"
                      >
                        <MessageSquare className="w-3 h-3 text-emerald-400" />
                        <span>Message</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center space-y-2">
                  <Bookmark className="w-8 h-8 text-neutral-600 mx-auto" />
                  <p className="text-xs text-neutral-400">No saved contacts yet.</p>
                  <p className="text-[11px] text-neutral-600">
                    Add friends with their unique Account Code.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* RIGHT MAIN AREA: Active WhatsApp Conversation View */}
      {/* ========================================================= */}
      <div
        id="calcchat-main-chat"
        className={`flex-1 flex flex-col bg-neutral-950 relative h-full ${
          !activeConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        {activeConversation ? (
          <>
            {/* Active Chat Header */}
            {(() => {
              const recipientMeta = getRecipientMeta(activeConversation);
              return (
                <div className="p-3.5 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md flex items-center justify-between z-10">
                  <div className="flex items-center gap-3">
                    {/* Mobile Back Button */}
                    <button
                      id="mobile-back-btn"
                      onClick={() => setActiveConversation(null)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 md:hidden transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>

                    <div
                      className="relative cursor-pointer"
                      onClick={() => {
                        setSelectedContactForProfile(null);
                        setIsProfileModalOpen(true);
                      }}
                    >
                      <img
                        src={
                          recipientMeta?.avatar ||
                          'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow'
                        }
                        alt={recipientMeta?.displayName || 'Recipient'}
                        className="w-10 h-10 rounded-full border border-neutral-700 object-cover bg-neutral-800"
                      />
                      {recipientPresence.isOnline && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-neutral-900" />
                      )}
                    </div>

                    <div>
                      <div
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          setSelectedContactForProfile(null);
                          setIsProfileModalOpen(true);
                        }}
                      >
                        <h3 className="text-sm font-semibold text-neutral-100 hover:text-emerald-400 transition-colors">
                          {recipientMeta?.displayName || 'Chat'}
                        </h3>
                        {recipientMeta?.type && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.2 rounded border ${
                              recipientMeta.type === 'first'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                            }`}
                          >
                            {recipientMeta.type === 'first' ? 'First' : 'Second'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        {recipientMeta?.accountCode && (
                          <span className="font-mono text-emerald-400 font-medium">
                            @{recipientMeta.accountCode}
                          </span>
                        )}
                        <span className="text-neutral-600">•</span>
                        {formatPresenceStatus()}
                      </div>
                    </div>
                  </div>

                  {/* Header Call & Option Actions */}
                  <div className="flex items-center gap-1 relative">
                    {/* Search inside chat toggle */}
                    <button
                      onClick={() => setIsChatSearchOpen(!isChatSearchOpen)}
                      className={`p-2 rounded-xl transition-colors ${
                        isChatSearchOpen ? 'bg-emerald-500/20 text-emerald-400' : 'text-neutral-300 hover:bg-neutral-800'
                      }`}
                      title="Search in conversation"
                    >
                      <Search className="w-4 h-4" />
                    </button>

                    {/* Voice Call Button */}
                    <button
                      id="voice-call-header-btn"
                      onClick={() => handleStartCall('audio')}
                      className="p-2 rounded-xl text-neutral-300 hover:text-emerald-400 hover:bg-neutral-800 transition-colors"
                      title="Start Voice Call"
                    >
                      <Phone className="w-4 h-4" />
                    </button>

                    {/* Video Call Button */}
                    <button
                      id="video-call-header-btn"
                      onClick={() => handleStartCall('video')}
                      className="p-2 rounded-xl text-neutral-300 hover:text-emerald-400 hover:bg-neutral-800 transition-colors"
                      title="Start Video Call"
                    >
                      <Video className="w-4 h-4" />
                    </button>

                    {/* 3-Dots Menu */}
                    <button
                      onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                      className="p-2 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                      title="Options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {headerMenuOpen && (
                      <div className="absolute right-0 top-11 w-48 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-1.5 z-30 animate-in fade-in zoom-in-95 duration-150 space-y-1 text-xs">
                        <button
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setSelectedContactForProfile(null);
                            setIsProfileModalOpen(true);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-800 rounded-xl flex items-center gap-2.5 text-neutral-200"
                        >
                          <User className="w-4 h-4 text-emerald-400" />
                          <span>Contact Info</span>
                        </button>
                        <button
                          onClick={async () => {
                            setHeaderMenuOpen(false);
                            const isPinned = activeConversation.pinnedBy?.includes(activeIdentity.id) || false;
                            await togglePinConversation(activeConversation.id, activeIdentity.id, isPinned);
                            showToast(isPinned ? 'Chat unpinned' : 'Chat pinned');
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-800 rounded-xl flex items-center gap-2.5 text-neutral-200"
                        >
                          <Pin className="w-4 h-4 text-amber-400" />
                          <span>
                            {activeConversation.pinnedBy?.includes(activeIdentity.id) ? 'Unpin Chat' : 'Pin Chat'}
                          </span>
                        </button>
                        <button
                          onClick={async () => {
                            setHeaderMenuOpen(false);
                            const isMuted = activeConversation.mutedBy?.includes(activeIdentity.id) || false;
                            await toggleMuteConversation(activeConversation.id, activeIdentity.id, isMuted);
                            showToast(isMuted ? 'Unmuted' : 'Muted');
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-800 rounded-xl flex items-center gap-2.5 text-neutral-200"
                        >
                          <VolumeX className="w-4 h-4 text-neutral-400" />
                          <span>
                            {activeConversation.mutedBy?.includes(activeIdentity.id) ? 'Unmute Chat' : 'Mute Chat'}
                          </span>
                        </button>
                        <button
                          onClick={async () => {
                            setHeaderMenuOpen(false);
                            if (window.confirm('Clear all messages in this chat?')) {
                              await clearConversationMessages(activeConversation.id);
                              showToast('Conversation cleared');
                            }
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-800 rounded-xl flex items-center gap-2.5 text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Clear Messages</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* In-Chat Message Search Bar */}
            {isChatSearchOpen && (
              <div className="p-2.5 bg-neutral-900 border-b border-neutral-800 flex items-center gap-2 z-10">
                <Search className="w-4 h-4 text-neutral-500 ml-2" />
                <input
                  type="text"
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  placeholder="Search in this conversation..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => {
                    setIsChatSearchOpen(false);
                    setChatSearchQuery('');
                  }}
                  className="p-1 text-neutral-400 hover:text-neutral-200 mr-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Messages Scroll Container */}
            <div
              id="messages-scroll-pane"
              className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(#1f1f1f_1px,transparent_1px)] [background-size:16px_16px]"
            >
              {displayedMessages.length > 0 ? (
                displayedMessages.map((msg, index) => {
                  const isSentByMe = msg.senderIdentityId === activeIdentity.id;
                  const prevMsg = displayedMessages[index - 1];
                  const showDateHeader =
                    !prevMsg ||
                    new Date(prevMsg.createdAt).toDateString() !==
                      new Date(msg.createdAt).toDateString();

                  return (
                    <React.Fragment key={msg.id}>
                      {/* Date Divider Pill */}
                      {showDateHeader && (
                        <div className="flex justify-center my-3">
                          <span className="px-3 py-1 bg-neutral-900/90 border border-neutral-800 text-[10px] text-neutral-400 font-medium rounded-full shadow-sm">
                            {isToday(new Date(msg.createdAt))
                              ? 'Today'
                              : isYesterday(new Date(msg.createdAt))
                              ? 'Yesterday'
                              : format(new Date(msg.createdAt), 'MMMM d, yyyy')}
                          </span>
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div
                        id={`msg-bubble-${msg.id}`}
                        className={`flex flex-col group relative ${
                          isSentByMe ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`relative max-w-[85%] md:max-w-[70%] rounded-2xl p-3 shadow-md ${
                            isSentByMe
                              ? 'bg-emerald-600 text-white rounded-br-none'
                              : 'bg-neutral-800 border border-neutral-700/60 text-neutral-100 rounded-bl-none'
                          }`}
                        >
                          {/* Sender Identity Tag */}
                          {!isSentByMe && (
                            <div className="text-[10px] font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                              <span>{msg.senderDisplayName}</span>
                              <span className="text-[9px] text-neutral-400">
                                ({msg.senderIdentityType === 'first' ? 'First' : 'Second'})
                              </span>
                            </div>
                          )}

                          {/* Quoted Reply Banner */}
                          {msg.replyTo && (
                            <div
                              className={`mb-2 p-2 rounded-lg border-l-4 text-xs ${
                                isSentByMe
                                  ? 'bg-emerald-700/50 border-emerald-300 text-emerald-100'
                                  : 'bg-neutral-900 border-emerald-500 text-neutral-300'
                              }`}
                            >
                              <span className="font-semibold text-[11px] block">
                                {msg.replyTo.senderDisplayName}
                              </span>
                              <p className="truncate text-[11px] opacity-90">
                                {msg.replyTo.text}
                              </p>
                            </div>
                          )}

                          {/* 1. TEXT MESSAGE */}
                          {msg.type === 'text' && (
                            <div>
                              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                {msg.text}
                              </p>
                              {msg.isEdited && (
                                <span className="text-[9px] opacity-75 italic block mt-0.5">
                                  (edited)
                                </span>
                              )}
                            </div>
                          )}

                          {/* 2. IMAGE MESSAGE */}
                          {msg.type === 'image' && msg.fileUrl && (
                            <div className="space-y-1.5">
                              <div
                                onClick={() =>
                                  setMediaViewerData({
                                    isOpen: true,
                                    url: msg.fileUrl!,
                                    type: 'image',
                                    fileName: msg.fileName,
                                    senderName: msg.senderDisplayName,
                                    fileSize: msg.fileSize,
                                  })
                                }
                                className="relative group/img cursor-pointer overflow-hidden rounded-xl bg-black/20"
                              >
                                <img
                                  src={msg.thumbnailUrl || msg.fileUrl}
                                  alt={msg.fileName || 'Photo'}
                                  loading="lazy"
                                  className="max-h-72 max-w-full rounded-xl object-contain hover:scale-[1.02] transition-transform duration-200"
                                />
                              </div>
                              {msg.text && (
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                              )}
                            </div>
                          )}

                          {/* 3. AUDIO / VOICE NOTE */}
                          {msg.type === 'audio' && msg.fileUrl && (
                            <AudioMessagePlayer
                              audioUrl={msg.fileUrl}
                              durationSeconds={msg.audioDuration}
                              isSentByMe={isSentByMe}
                            />
                          )}

                          {/* 4. VIDEO MESSAGE */}
                          {msg.type === 'video' && msg.fileUrl && (
                            <div className="space-y-1.5">
                              <div className="rounded-xl overflow-hidden bg-black/40 border border-black/20 max-w-full">
                                <video
                                  src={msg.fileUrl}
                                  controls
                                  playsInline
                                  preload="metadata"
                                  className="max-h-72 max-w-full rounded-xl"
                                />
                              </div>
                              {msg.text && (
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                              )}
                            </div>
                          )}

                          {/* 5. DOCUMENT / FILE ATTACHMENT */}
                          {msg.type === 'file' && msg.fileUrl && (
                            <div className="flex items-center gap-3 p-2.5 bg-black/25 border border-white/10 rounded-xl min-w-[220px]">
                              <div className="p-2.5 rounded-xl bg-black/30 shrink-0">
                                {getDocumentIcon(msg.fileName, msg.mimeType)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate text-neutral-100">
                                  {msg.fileName || 'Document'}
                                </p>
                                <span className="text-[10px] opacity-75 font-mono">
                                  {formatFileSize(msg.fileSize)}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setMediaViewerData({
                                    isOpen: true,
                                    url: msg.fileUrl!,
                                    type: 'file',
                                    fileName: msg.fileName,
                                    senderName: msg.senderDisplayName,
                                    fileSize: msg.fileSize,
                                  })
                                }
                                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors shrink-0"
                                title="Download Document"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          {/* Message Footer: Timestamp & Delivery Status */}
                          <div className="flex items-center justify-end gap-1 text-[10px] mt-1 opacity-80">
                            <span>{formatMessageTime(msg.createdAt)}</span>
                            {isSentByMe && (
                              <span className="inline-flex">
                                {msg.status === 'read' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-sky-200" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-white/80" />
                                ) : msg.status === 'sent' ? (
                                  <Check className="w-3.5 h-3.5 text-white/80" />
                                ) : (
                                  <Clock className="w-3 h-3 text-white/60" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Reactions Badges */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div
                            className={`flex flex-wrap gap-1 mt-1 ${
                              isSentByMe ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {Object.entries(msg.reactions).map(([emoji, rawUserIds]) => {
                              const userIds = Array.isArray(rawUserIds) ? rawUserIds as string[] : [];
                              const hasReacted = userIds.includes(activeIdentity.id);
                              return (
                                <button
                                  key={emoji}
                                  onClick={() =>
                                    toggleMessageReaction(
                                      activeConversation.id,
                                      msg.id,
                                      emoji,
                                      activeIdentity.id
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 border transition-all ${
                                    hasReacted
                                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                                      : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="text-[10px] font-bold">{userIds.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Quick Hover Actions Menu */}
                        <div
                          className={`flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 text-xs px-1 ${
                            isSentByMe ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {/* Emoji Reaction Trigger */}
                          <div className="relative">
                            <button
                              onClick={() =>
                                setActiveReactionMessageId(
                                  activeReactionMessageId === msg.id ? null : msg.id
                                )
                              }
                              className="p-1 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
                              title="React"
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>

                            {activeReactionMessageId === msg.id && (
                              <div className="absolute bottom-6 left-0 p-1.5 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl z-30 flex gap-1 animate-in fade-in zoom-in-95">
                                {['👍', '❤️', '😂', '😮', '😢', '🔥', '🙏'].map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => {
                                      toggleMessageReaction(
                                        activeConversation.id,
                                        msg.id,
                                        emoji,
                                        activeIdentity.id
                                      );
                                      setActiveReactionMessageId(null);
                                    }}
                                    className="p-1.5 hover:bg-neutral-800 rounded-lg text-sm transition-colors"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() =>
                              setReplyingTo({
                                messageId: msg.id,
                                text:
                                  msg.text ||
                                  (msg.type === 'image'
                                    ? '📷 Photo'
                                    : msg.type === 'video'
                                    ? '🎥 Video'
                                    : msg.type === 'audio'
                                    ? '🎤 Voice note'
                                    : '📎 Document'),
                                senderDisplayName: msg.senderDisplayName,
                                type: msg.type,
                              })
                            }
                            className="p-1 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
                            title="Reply"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>

                          {msg.text && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(msg.text!);
                                showToast('Copied to clipboard');
                              }}
                              className="p-1 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
                              title="Copy text"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isSentByMe && msg.type === 'text' && (
                            <button
                              onClick={() => {
                                setEditingMessage(msg);
                                setEditText(msg.text || '');
                              }}
                              className="p-1 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
                              title="Edit message"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={async () => {
                              if (window.confirm('Delete this message?')) {
                                await deleteMessage(activeConversation.id, msg.id, isSentByMe);
                                showToast('Message deleted');
                              }
                            }}
                            className="p-1 hover:text-red-400 hover:bg-neutral-800 rounded transition-colors"
                            title="Delete message"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-emerald-400">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-neutral-200">Start of Conversation</h4>
                  <p className="text-xs text-neutral-500 max-w-xs">
                    Messages are delivered in real time across identities.
                  </p>
                </div>
              )}

              {/* Typing Bubble */}
              {typingParticipants.length > 0 && (
                <div className="flex items-center gap-2 p-2 bg-neutral-900/80 border border-neutral-800 rounded-2xl w-fit text-xs text-emerald-400 animate-pulse">
                  <div className="flex gap-1 items-center px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span>typing...</span>
                </div>
              )}

              {/* Upload Progress Bubble */}
              {uploadState?.isUploading && (
                <div className="flex flex-col items-end">
                  <div className="bg-neutral-900 border border-emerald-500/40 rounded-2xl p-3 text-neutral-200 max-w-xs space-y-2 shadow-xl animate-pulse">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="truncate">Uploading {uploadState.fileName}...</span>
                    </div>
                    <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-200"
                        style={{ width: `${uploadState.progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
                      <span>{uploadState.type}</span>
                      <span>{uploadState.progress}%</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Hidden Native File Inputs */}
            <input
              type="file"
              ref={imageInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'image')}
            />
            <input
              type="file"
              ref={videoInputRef}
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'video')}
            />
            <input
              type="file"
              ref={fileInputRef}
              accept="*/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'file')}
            />

            {/* Bottom Composer Area */}
            <div className="p-3 border-t border-neutral-800 bg-neutral-900/95 relative z-20">
              {/* Editing Banner */}
              {editingMessage && (
                <div className="mb-2 p-2.5 bg-neutral-950 border border-emerald-500/50 rounded-2xl flex items-center justify-between text-xs animate-in fade-in">
                  <div className="flex-1 mr-2">
                    <span className="font-semibold text-emerald-400 block mb-1">
                      Edit Message:
                    </span>
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleSaveEdit}
                      className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingMessage(null)}
                      className="p-1.5 text-neutral-400 hover:text-neutral-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Replying Banner */}
              {replyingTo && (
                <div className="mb-2 p-2 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between text-xs text-neutral-300 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <Reply className="w-3.5 h-3.5 text-emerald-400" />
                    <div>
                      <span className="font-semibold text-emerald-400">
                        Replying to {replyingTo.senderDisplayName}:
                      </span>
                      <p className="text-neutral-400 truncate max-w-md">{replyingTo.text}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="p-1 text-neutral-500 hover:text-neutral-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Live Voice Recorder or Input Form */}
              {isRecordingVoice ? (
                <VoiceRecorder
                  onSendVoiceNote={handleSendVoiceNote}
                  onCancel={() => setIsRecordingVoice(false)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  {/* Attachments Menu Popover */}
                  <div className="relative">
                    <button
                      type="button"
                      id="attachment-menu-btn"
                      onClick={() => setAttachmentMenuOpen(!attachmentMenuOpen)}
                      className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                      title="Attach media"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>

                    {attachmentMenuOpen && (
                      <div className="absolute bottom-12 left-0 w-48 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-1.5 z-30 animate-in fade-in zoom-in-95 duration-150 space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentMenuOpen(false);
                            imageInputRef.current?.click();
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-900 rounded-xl flex items-center gap-2.5 transition-colors"
                        >
                          <ImageIcon className="w-4 h-4 text-emerald-400" />
                          <span>Photos & Images</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentMenuOpen(false);
                            videoInputRef.current?.click();
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-900 rounded-xl flex items-center gap-2.5 transition-colors"
                        >
                          <VideoIcon className="w-4 h-4 text-sky-400" />
                          <span>Videos</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentMenuOpen(false);
                            fileInputRef.current?.click();
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-900 rounded-xl flex items-center gap-2.5 transition-colors"
                        >
                          <FileText className="w-4 h-4 text-amber-400" />
                          <span>Documents / Files</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Emoji Menu Popover */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
                      className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                      title="Emojis"
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    {emojiPickerOpen && (
                      <div className="absolute bottom-12 left-0 p-2 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl z-30 flex gap-2">
                        {['👍', '❤️', '😂', '🔥', '🙏', '🔒', '💯', '🚀', '👀', '🎉'].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              setInputText((prev) => prev + emoji);
                              setEmojiPickerOpen(false);
                              inputRef.current?.focus();
                            }}
                            className="p-1.5 hover:bg-neutral-800 rounded-lg text-base transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Main Text Input Form */}
                  <form onSubmit={handleSendMessage} className="flex-1 flex gap-2">
                    <input
                      ref={inputRef}
                      id="chat-message-input"
                      type="text"
                      value={inputText}
                      onChange={(e) => handleInputChange(e.target.value)}
                      placeholder={`Type a message as ${activeIdentity.displayName}...`}
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/50"
                    />

                    {inputText.trim() ? (
                      <button
                        type="submit"
                        id="send-message-btn"
                        disabled={sending}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl flex items-center justify-center transition-colors shadow-lg shadow-emerald-950 font-medium cursor-pointer"
                        title="Send message"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        id="mic-record-btn"
                        onClick={() => setIsRecordingVoice(true)}
                        className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 rounded-2xl flex items-center justify-center transition-colors cursor-pointer"
                        title="Record voice note"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    )}
                  </form>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-emerald-500 shadow-xl">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-100">CalcChat Messenger</h2>
              <p className="text-xs text-neutral-400 max-w-sm mt-1.5 leading-relaxed">
                Dual identity stealth messenger. Select an existing conversation or start a new chat using an Account Code.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setIsNewChatOpen(true)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-emerald-950 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Start New Chat</span>
              </button>
              <button
                onClick={lockActiveIdentity}
                className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Stealth Calculator</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODALS & OVERLAYS */}
      {/* ========================================================= */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onSelectConversation={(conv) => {
          setActiveConversation(conv);
          setIsNewChatOpen(false);
        }}
      />

      <AddContactModal
        isOpen={isAddContactOpen}
        onClose={() => setIsAddContactOpen(false)}
        onSelectConversation={(conv) => {
          setActiveConversation(conv);
          setIsAddContactOpen(false);
        }}
      />

      <ContactProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          setSelectedContactForProfile(null);
        }}
        targetIdentity={activeConversation ? getRecipientMeta(activeConversation) : null}
        contact={selectedContactForProfile}
        conversation={activeConversation}
        onSelectConversation={(conv) => {
          setActiveConversation(conv);
          setIsProfileModalOpen(false);
        }}
        onStartCall={(type) => {
          setIsProfileModalOpen(false);
          handleStartCall(type);
        }}
      />

      <IdentitySettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <MediaViewerModal
        isOpen={mediaViewerData.isOpen}
        onClose={() =>
          setMediaViewerData((prev) => ({ ...prev, isOpen: false }))
        }
        mediaUrl={mediaViewerData.url}
        mediaType={mediaViewerData.type}
        fileName={mediaViewerData.fileName}
        senderName={mediaViewerData.senderName}
        fileSize={mediaViewerData.fileSize}
      />

      {/* WebRTC Voice & Video Call Modal */}
      {isCallModalOpen && (
        <CallModal
          activeIdentity={activeIdentity}
          outgoingCallData={outgoingCall}
          incomingCallSession={incomingCall}
          onClose={() => {
            setIsCallModalOpen(false);
            setIncomingCall(null);
            setOutgoingCall(null);
          }}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 bg-neutral-900 border border-emerald-500/50 text-neutral-100 text-xs rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
