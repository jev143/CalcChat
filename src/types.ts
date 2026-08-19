export type IdentityType = 'first' | 'second';
export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'file';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface UserAccount {
  uid: string;
  accountCode: string;
  displayName: string;
  avatar: string;
  hasConfiguredPins?: boolean;
  recoveryKeyHash?: string;
  recoverySalt?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface ChatIdentity {
  identityId: string; // e.g. `${uid}_first` or `${uid}_second`
  id: string; // synonym for identityId
  ownerUserId: string; // Account UID
  uid: string; // Account UID
  type: IdentityType;
  displayName: string;
  username: string; // e.g. `${accountCode}.1` or `${accountCode}.2`
  avatar: string;
  pinHash: string; // Salted SHA-256 hash of the 4-10 char secret
  about?: string;
  statusMessage?: string;
  lastActiveAt?: number;
  blockedIdentities?: string[]; // Array of identity IDs blocked by this identity
  createdAt: number;
  updatedAt: number;
}

export interface ParticipantMeta {
  displayName: string;
  avatar: string;
  username: string;
  uid: string;
  accountCode?: string;
  type: IdentityType;
  about?: string;
}

export interface Conversation {
  id: string;
  participantIdentityIds: string[];
  participantUids: string[];
  participantsMeta: Record<string, ParticipantMeta>;
  lastMessage?: {
    text: string;
    type?: MessageType;
    senderIdentityId: string;
    senderDisplayName?: string;
    timestamp: number;
  };
  unreadCounts: Record<string, number>;
  pinnedBy?: string[]; // Identity IDs that pinned this chat
  mutedBy?: string[]; // Identity IDs that muted this chat
  archivedBy?: string[]; // Identity IDs that archived this chat
  clearedAt?: Record<string, number>; // Timestamp when an identity cleared messages
  deletedFor?: string[]; // Identity IDs that deleted this chat from their list
  createdAt: number;
  updatedAt: number;
}

export interface MessageReplyInfo {
  messageId: string;
  text: string;
  senderDisplayName: string;
  type: MessageType;
}

export interface Message {
  id: string;
  conversationId: string;
  senderAccountId?: string;
  senderIdentityId: string;
  senderUid: string;
  senderDisplayName: string;
  senderIdentityType: IdentityType;
  receiverAccountId?: string;
  receiverIdentityId?: string;
  receiverUid?: string;
  receiverDisplayName?: string;
  type: MessageType;
  text?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  storagePath?: string;
  thumbnailUrl?: string;
  audioDuration?: number;
  replyTo?: MessageReplyInfo;
  reactions?: Record<string, string[]>;
  isDeleted?: boolean;
  isEdited?: boolean;
  editedAt?: number;
  forwarded?: boolean;
  createdAt: number;
  updatedAt: number;
  status: MessageStatus;
  readBy: string[]; // identity IDs who read the message
}

export type CallType = 'audio' | 'video';
export type CallStatus = 'calling' | 'ringing' | 'connected' | 'ended' | 'rejected' | 'busy';

export interface CallSession {
  id: string;
  conversationId?: string;
  callerUid: string;
  callerIdentityId: string;
  callerName: string;
  callerAvatar?: string;
  receiverUid: string;
  receiverIdentityId: string;
  receiverName: string;
  receiverAvatar?: string;
  type: CallType;
  status: CallStatus;
  offer?: any;
  answer?: any;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export interface Contact {
  id: string; // contact doc id: `${ownerIdentityId}_${contactIdentityId}`
  ownerUid: string;
  ownerIdentityId: string; // Isolated per identity
  contactIdentityId: string;
  contactUid: string;
  contactAccountCode: string;
  displayName: string;
  avatar?: string;
  about?: string;
  username?: string;
  savedAt: number;
  isBlocked?: boolean;
  isMuted?: boolean;
  notes?: string;
}

export interface AccountLookupResult {
  account: UserAccount;
  firstIdentity: ChatIdentity | null;
  secondIdentity: ChatIdentity | null;
}

