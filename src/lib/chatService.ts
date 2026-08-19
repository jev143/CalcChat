import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Conversation,
  Message,
  ChatIdentity,
  ParticipantMeta,
  Contact,
  AccountLookupResult,
  UserAccount,
  MessageType,
  MessageReplyInfo,
} from '../types';

/**
 * Real-time listener for conversations involving a specific identity
 * Automatically sorts pinned conversations to the top, followed by most recent activity
 */
export function subscribeToConversations(
  identityId: string,
  onUpdate: (conversations: Conversation[]) => void,
  onError?: (error: Error) => void
) {
  const convsRef = collection(db, 'conversations');
  const q = query(
    convsRef,
    where('participantIdentityIds', 'array-contains', identityId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const convs: Conversation[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Conversation;
        // Filter out if user deleted this conversation for themselves
        if (data.deletedFor && data.deletedFor.includes(identityId)) {
          return;
        }
        convs.push({
          id: docSnap.id,
          ...data,
        });
      });

      // Sort: Pinned first (if identity is in pinnedBy), then by updatedAt/lastMessage timestamp descending
      convs.sort((a, b) => {
        const aPinned = a.pinnedBy?.includes(identityId) ? 1 : 0;
        const bPinned = b.pinnedBy?.includes(identityId) ? 1 : 0;
        if (aPinned !== bPinned) {
          return bPinned - aPinned;
        }
        const aTime = a.lastMessage?.timestamp || a.updatedAt || 0;
        const bTime = b.lastMessage?.timestamp || b.updatedAt || 0;
        return bTime - aTime;
      });

      onUpdate(convs);
    },
    (err) => {
      console.error('Error in conversation subscription:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Real-time listener for messages in a conversation with message limit support
 * Handles 'delivered' status progression when recipient client receives messages
 */
export function subscribeToMessages(
  conversationId: string,
  currentIdentityId: string,
  onUpdate: (messages: Message[]) => void,
  onError?: (error: Error) => void,
  messageLimitCount: number = 60
) {
  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  const q = query(
    messagesRef,
    orderBy('createdAt', 'asc'),
    limitToLast(Math.max(1, messageLimitCount))
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: Message[] = [];
      const batch = writeBatch(db);
      let needsDeliveryUpdate = false;

      snapshot.forEach((docSnap) => {
        const msg = {
          id: docSnap.id,
          ...docSnap.data(),
        } as Message;

        msgs.push(msg);

        // If this is an incoming message to currentIdentity and status is 'sent', upgrade to 'delivered'
        if (
          msg.senderIdentityId !== currentIdentityId &&
          msg.status === 'sent' &&
          (!msg.readBy || !msg.readBy.includes(currentIdentityId))
        ) {
          batch.update(docSnap.ref, {
            status: 'delivered',
            updatedAt: Date.now(),
          });
          needsDeliveryUpdate = true;
        }
      });

      if (needsDeliveryUpdate) {
        batch.commit().catch((err) => {
          console.warn('Delivery receipt update failed silently:', err);
        });
      }

      onUpdate(msgs);
    },
    (err) => {
      console.error('Error in messages subscription:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Send a rich message (Text, Image, Audio, Video, File)
 */
export async function sendMessage(
  conversationId: string,
  senderIdentity: ChatIdentity,
  payload: {
    type?: MessageType;
    text?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    storagePath?: string;
    thumbnailUrl?: string;
    audioDuration?: number;
    replyTo?: MessageReplyInfo;
    recipientIdentityId?: string;
    recipientUid?: string;
    recipientDisplayName?: string;
    senderAccountId?: string;
    recipientAccountId?: string;
  }
): Promise<string> {
  const msgType = payload.type || 'text';
  const text = (payload.text || '').trim();

  if (msgType === 'text' && !text) {
    throw new Error('Text message cannot be empty');
  }

  // Check if recipient has blocked sender
  if (payload.recipientIdentityId) {
    const isBlocked = await checkIsIdentityBlocked(
      payload.recipientIdentityId,
      senderIdentity.id
    );
    if (isBlocked) {
      throw new Error('Cannot send message: You have been blocked by this user.');
    }
  }

  const now = Date.now();
  const messagesRef = collection(db, 'conversations', conversationId, 'messages');

  const messageData: Partial<Message> = {
    conversationId,
    senderAccountId: payload.senderAccountId || senderIdentity.ownerUserId || senderIdentity.uid,
    senderIdentityId: senderIdentity.id,
    senderUid: senderIdentity.uid,
    senderDisplayName: senderIdentity.displayName,
    senderIdentityType: senderIdentity.type,
    receiverAccountId: payload.recipientAccountId,
    receiverIdentityId: payload.recipientIdentityId,
    receiverUid: payload.recipientUid,
    receiverDisplayName: payload.recipientDisplayName,
    type: msgType,
    text: text || undefined,
    fileUrl: payload.fileUrl,
    fileName: payload.fileName,
    fileSize: payload.fileSize,
    mimeType: payload.mimeType,
    storagePath: payload.storagePath,
    thumbnailUrl: payload.thumbnailUrl,
    audioDuration: payload.audioDuration,
    replyTo: payload.replyTo,
    createdAt: now,
    updatedAt: now,
    status: 'sent',
    readBy: [senderIdentity.id],
  };

  const cleanData = Object.fromEntries(
    Object.entries(messageData).filter(([_, v]) => v !== undefined)
  );

  const docRef = await addDoc(messagesRef, cleanData);

  // Update conversation lastMessage & unread counts
  const convRef = doc(db, 'conversations', conversationId);
  const convSnap = await getDoc(convRef);

  let previewText = text;
  if (msgType === 'image') previewText = '📷 Photo';
  else if (msgType === 'audio') previewText = '🎤 Voice message';
  else if (msgType === 'video') previewText = '🎥 Video';
  else if (msgType === 'file') previewText = `📎 ${payload.fileName || 'Document'}`;

  if (convSnap.exists()) {
    const convData = convSnap.data() as Conversation;
    const unreadCounts = { ...(convData.unreadCounts || {}) };

    convData.participantIdentityIds.forEach((pid) => {
      if (pid !== senderIdentity.id) {
        unreadCounts[pid] = (unreadCounts[pid] || 0) + 1;
      }
    });

    const updatePayload: any = {
      lastMessage: {
        text: previewText,
        type: msgType,
        senderIdentityId: senderIdentity.id,
        senderDisplayName: senderIdentity.displayName,
        timestamp: now,
      },
      unreadCounts,
      updatedAt: now,
    };

    // If conversation was marked deleted for anyone, restore it when a new message arrives
    if (convData.deletedFor && convData.deletedFor.length > 0) {
      updatePayload.deletedFor = [];
    }

    await updateDoc(convRef, updatePayload);
  }

  return docRef.id;
}

/**
 * Mark messages in conversation as read for an identity
 */
export async function markConversationAsRead(
  conversationId: string,
  identityId: string
) {
  try {
    const convRef = doc(db, 'conversations', conversationId);
    const convSnap = await getDoc(convRef);
    if (convSnap.exists()) {
      const data = convSnap.data() as Conversation;
      if (data.unreadCounts && data.unreadCounts[identityId] > 0) {
        const updatedCounts = { ...data.unreadCounts, [identityId]: 0 };
        await updateDoc(convRef, {
          unreadCounts: updatedCounts,
        });
      }
    }

    // Update unread messages' status to 'read'
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = query(messagesRef, limit(60));
    const snapshot = await getDocs(q);

    const batch = writeBatch(db);
    let updatedCount = 0;

    snapshot.forEach((docSnap) => {
      const msg = docSnap.data() as Message;
      if (msg.senderIdentityId !== identityId && (!msg.readBy || !msg.readBy.includes(identityId))) {
        const newReadBy = Array.from(new Set([...(msg.readBy || []), identityId]));
        batch.update(docSnap.ref, {
          status: 'read',
          readBy: newReadBy,
          updatedAt: Date.now(),
        });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      await batch.commit();
    }
  } catch (e) {
    console.warn('Failed to mark conversation as read:', e);
  }
}

/**
 * Deterministic conversation ID for two identities
 */
export function getConversationId(id1: string, id2: string): string {
  const sorted = [id1, id2].sort();
  return `conv_${sorted[0]}_${sorted[1]}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Get or create a 1-on-1 conversation between two chat identities
 */
export async function getOrCreateConversation(
  myIdentity: ChatIdentity,
  otherIdentity: ChatIdentity,
  myAccountCode?: string,
  otherAccountCode?: string
): Promise<Conversation> {
  const convId = getConversationId(myIdentity.id, otherIdentity.id);
  const convRef = doc(db, 'conversations', convId);
  const convSnap = await getDoc(convRef);

  if (convSnap.exists()) {
    const data = convSnap.data() as Conversation;
    // If it was deleted for me, remove from deletedFor
    if (data.deletedFor && data.deletedFor.includes(myIdentity.id)) {
      await updateDoc(convRef, {
        deletedFor: arrayRemove(myIdentity.id),
      });
    }
    return {
      id: convSnap.id,
      ...data,
    };
  }

  const now = Date.now();
  const participantUids = Array.from(new Set([myIdentity.uid, otherIdentity.uid]));
  const participantIdentityIds = [myIdentity.id, otherIdentity.id];

  const participantsMeta: Record<string, ParticipantMeta> = {
    [myIdentity.id]: {
      displayName: myIdentity.displayName,
      avatar: myIdentity.avatar,
      username: myIdentity.username,
      uid: myIdentity.uid,
      accountCode: myAccountCode,
      type: myIdentity.type,
      about: myIdentity.about,
    },
    [otherIdentity.id]: {
      displayName: otherIdentity.displayName,
      avatar: otherIdentity.avatar,
      username: otherIdentity.username,
      uid: otherIdentity.uid,
      accountCode: otherAccountCode,
      type: otherIdentity.type,
      about: otherIdentity.about,
    },
  };

  const newConv: Conversation = {
    id: convId,
    participantIdentityIds,
    participantUids,
    participantsMeta,
    unreadCounts: {
      [myIdentity.id]: 0,
      [otherIdentity.id]: 0,
    },
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
    deletedFor: [],
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(convRef, newConv);
  return newConv;
}

/**
 * Pin / Unpin conversation
 */
export async function togglePinConversation(
  conversationId: string,
  identityId: string,
  isCurrentlyPinned: boolean
): Promise<void> {
  const convRef = doc(db, 'conversations', conversationId);
  await updateDoc(convRef, {
    pinnedBy: isCurrentlyPinned ? arrayRemove(identityId) : arrayUnion(identityId),
  });
}

/**
 * Mute / Unmute conversation
 */
export async function toggleMuteConversation(
  conversationId: string,
  identityId: string,
  isCurrentlyMuted: boolean
): Promise<void> {
  const convRef = doc(db, 'conversations', conversationId);
  await updateDoc(convRef, {
    mutedBy: isCurrentlyMuted ? arrayRemove(identityId) : arrayUnion(identityId),
  });
}

/**
 * Archive / Unarchive conversation
 */
export async function toggleArchiveConversation(
  conversationId: string,
  identityId: string,
  isCurrentlyArchived: boolean
): Promise<void> {
  const convRef = doc(db, 'conversations', conversationId);
  await updateDoc(convRef, {
    archivedBy: isCurrentlyArchived ? arrayRemove(identityId) : arrayUnion(identityId),
  });
}

/**
 * Delete conversation for the current identity
 */
export async function deleteConversationForIdentity(
  conversationId: string,
  identityId: string
): Promise<void> {
  const convRef = doc(db, 'conversations', conversationId);
  await updateDoc(convRef, {
    deletedFor: arrayUnion(identityId),
  });
}

/**
 * Clear all messages in a conversation
 */
export async function clearConversationMessages(conversationId: string): Promise<void> {
  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  const snapshot = await getDocs(messagesRef);

  const batch = writeBatch(db);
  snapshot.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  const convRef = doc(db, 'conversations', conversationId);
  batch.update(convRef, {
    lastMessage: {
      text: 'Conversation cleared',
      type: 'text',
      timestamp: Date.now(),
    },
    updatedAt: Date.now(),
  });

  await batch.commit();
}

/**
 * Edit a text message
 */
export async function editMessageText(
  conversationId: string,
  messageId: string,
  newText: string
): Promise<void> {
  const msgRef = doc(db, 'conversations', conversationId, 'messages', messageId);
  await updateDoc(msgRef, {
    text: newText.trim(),
    isEdited: true,
    editedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * Search messages inside a specific conversation
 */
export async function searchMessagesInConversation(
  conversationId: string,
  searchText: string
): Promise<Message[]> {
  const term = searchText.trim().toLowerCase();
  if (!term) return [];

  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);

  const results: Message[] = [];
  snapshot.forEach((docSnap) => {
    const msg = { id: docSnap.id, ...docSnap.data() } as Message;
    if (
      msg.text?.toLowerCase().includes(term) ||
      msg.senderDisplayName?.toLowerCase().includes(term)
    ) {
      results.push(msg);
    }
  });

  return results;
}

/**
 * PRESENCE & ONLINE STATUS
 */

/**
 * Update active presence heartbeat for an identity
 */
export async function updatePresenceHeartbeat(identityId: string): Promise<void> {
  try {
    const identityRef = doc(db, 'identities', identityId);
    await updateDoc(identityRef, {
      lastActiveAt: Date.now(),
    });
  } catch (e) {
    // Non-fatal
  }
}

/**
 * Subscribe to real-time presence of a contact identity
 */
export function subscribeToIdentityPresence(
  identityId: string,
  onUpdate: (presence: { isOnline: boolean; lastActiveAt?: number }) => void
) {
  const identityRef = doc(db, 'identities', identityId);
  return onSnapshot(
    identityRef,
    (snap) => {
      if (!snap.exists()) {
        onUpdate({ isOnline: false });
        return;
      }
      const data = snap.data();
      const lastActiveAt = data?.lastActiveAt;
      const isOnline = lastActiveAt ? Date.now() - lastActiveAt < 70000 : false;
      onUpdate({ isOnline, lastActiveAt });
    },
    () => {
      onUpdate({ isOnline: false });
    }
  );
}

/**
 * BLOCKING SYSTEM
 */

export async function toggleBlockIdentity(
  myIdentityId: string,
  targetIdentityId: string,
  isCurrentlyBlocked: boolean
): Promise<void> {
  const identityRef = doc(db, 'identities', myIdentityId);
  await updateDoc(identityRef, {
    blockedIdentities: isCurrentlyBlocked
      ? arrayRemove(targetIdentityId)
      : arrayUnion(targetIdentityId),
  });
}

export async function checkIsIdentityBlocked(
  identityIdToCheck: string,
  potentialBlockerId: string
): Promise<boolean> {
  try {
    const blockerRef = doc(db, 'identities', potentialBlockerId);
    const snap = await getDoc(blockerRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    return Array.isArray(data?.blockedIdentities) && data.blockedIdentities.includes(identityIdToCheck);
  } catch {
    return false;
  }
}

/**
 * CONTACTS SYSTEM
 * Stored and isolated per owner identity
 */

export function subscribeToContacts(
  ownerIdentityId: string,
  onUpdate: (contacts: Contact[]) => void,
  onError?: (error: Error) => void
) {
  const contactsRef = collection(db, 'contacts');
  const q = query(contactsRef, where('ownerIdentityId', '==', ownerIdentityId));

  return onSnapshot(
    q,
    (snapshot) => {
      const contacts: Contact[] = [];
      snapshot.forEach((docSnap) => {
        contacts.push({
          id: docSnap.id,
          ...docSnap.data(),
        } as Contact);
      });
      contacts.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      onUpdate(contacts);
    },
    (err) => {
      console.error('Error in contacts subscription:', err);
      if (onError) onError(err);
    }
  );
}

export async function saveContact(
  ownerIdentity: ChatIdentity,
  contactIdentity: ChatIdentity,
  contactAccountCode: string,
  customDisplayName?: string,
  notes?: string
): Promise<string> {
  const contactId = `${ownerIdentity.id}_${contactIdentity.id}`;
  const contactRef = doc(db, 'contacts', contactId);

  const contactData: Contact = {
    id: contactId,
    ownerUid: ownerIdentity.uid,
    ownerIdentityId: ownerIdentity.id,
    contactIdentityId: contactIdentity.id,
    contactUid: contactIdentity.uid,
    contactAccountCode,
    displayName: customDisplayName?.trim() || contactIdentity.displayName,
    avatar: contactIdentity.avatar,
    about: contactIdentity.about || 'Available on CalcChat',
    username: contactIdentity.username,
    savedAt: Date.now(),
    isBlocked: false,
    isMuted: false,
    notes: notes?.trim() || undefined,
  };

  const cleanData = Object.fromEntries(
    Object.entries(contactData).filter(([_, v]) => v !== undefined)
  );

  await setDoc(contactRef, cleanData);
  return contactId;
}

export async function deleteContact(contactId: string): Promise<void> {
  const contactRef = doc(db, 'contacts', contactId);
  await deleteDoc(contactRef);
}

export async function toggleBlockContact(
  contactId: string,
  isBlocked: boolean
): Promise<void> {
  const contactRef = doc(db, 'contacts', contactId);
  await updateDoc(contactRef, {
    isBlocked,
  });
}

export async function toggleMuteContact(
  contactId: string,
  isMuted: boolean
): Promise<void> {
  const contactRef = doc(db, 'contacts', contactId);
  await updateDoc(contactRef, {
    isMuted,
  });
}

/**
 * Search all available identities across the platform
 */
export async function searchAllIdentities(
  searchQuery: string,
  currentIdentityId: string
): Promise<ChatIdentity[]> {
  try {
    // Privacy: global identity enumeration is intentionally disabled. Use exact Account Code lookup.
    return [];
  } catch (error) {
    console.error('Error searching identities:', error);
    return [];
  }
}

/**
 * Look up an account and its two identities (First & Second) using its unique Account Code
 */
export async function lookupAccountAndIdentitiesByCode(accountCode: string): Promise<AccountLookupResult | null> {
  const code = accountCode.trim().toUpperCase();
  if (!code) return null;
  try {
    const res = await fetch(`/api/contacts/lookup/${encodeURIComponent(code)}`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data as AccountLookupResult;
  } catch (error) {
    console.error('Error looking up account by code:', error);
    return null;
  }
}

/**
 * Delete a message
 */
export async function deleteMessage(
  conversationId: string,
  messageId: string,
  forEveryone: boolean = false
): Promise<void> {
  const msgRef = doc(db, 'conversations', conversationId, 'messages', messageId);
  if (forEveryone) {
    await updateDoc(msgRef, {
      isDeleted: true,
      text: 'This message was deleted',
      fileUrl: null,
      thumbnailUrl: null,
      updatedAt: Date.now(),
    });
  } else {
    await deleteDoc(msgRef);
  }
}

/**
 * Toggle emoji reaction on a message
 */
export async function toggleMessageReaction(
  conversationId: string,
  messageId: string,
  emoji: string,
  identityId: string
): Promise<void> {
  const msgRef = doc(db, 'conversations', conversationId, 'messages', messageId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;

  const msgData = snap.data() as Message;
  const reactions = { ...(msgData.reactions || {}) };
  const currentUsers = reactions[emoji] || [];

  if (currentUsers.includes(identityId)) {
    reactions[emoji] = currentUsers.filter((id) => id !== identityId);
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  } else {
    Object.keys(reactions).forEach((e) => {
      reactions[e] = (reactions[e] || []).filter((id) => id !== identityId);
      if (reactions[e].length === 0) {
        delete reactions[e];
      }
    });
    reactions[emoji] = [...(reactions[emoji] || []), identityId];
  }

  await updateDoc(msgRef, {
    reactions,
    updatedAt: Date.now(),
  });
}

/**
 * Set typing status in conversation
 */
export async function setTypingStatus(
  conversationId: string,
  identityId: string,
  isTyping: boolean
): Promise<void> {
  try {
    const typingRef = doc(db, 'conversations', conversationId, 'typing', identityId);
    if (isTyping) {
      await setDoc(typingRef, {
        identityId,
        isTyping: true,
        updatedAt: Date.now(),
      });
    } else {
      await deleteDoc(typingRef);
    }
  } catch (e) {
    // Non-fatal
  }
}

/**
 * Subscribe to typing status
 */
export function subscribeToTypingStatus(
  conversationId: string,
  currentIdentityId: string,
  onTypingChange: (typingIdentityIds: string[]) => void
) {
  const typingCol = collection(db, 'conversations', conversationId, 'typing');
  return onSnapshot(
    typingCol,
    (snapshot) => {
      const now = Date.now();
      const typingIds: string[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.identityId !== currentIdentityId && data.isTyping && (now - (data.updatedAt || 0) < 6000)) {
          typingIds.push(data.identityId);
        }
      });
      onTypingChange(typingIds);
    },
    () => {}
  );
}
