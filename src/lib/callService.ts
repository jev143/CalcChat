import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  addDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { CallSession, CallType, ChatIdentity } from '../types';

const RTC_CONFIG: RTCConfiguration = {
  bundlePolicy: 'max-bundle',
  iceCandidatePoolSize: 10,
  rtcpMuxPolicy: 'require',
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
};

function tuneAudioSenders(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'audio') continue;
    try {
      const params = sender.getParameters();
      params.encodings = (params.encodings?.length ? params.encodings : [{}]).map((encoding) => ({
        ...encoding,
        // Keep enough headroom for clear speech while allowing WebRTC's
        // congestion control to adapt to the actual network conditions.
        maxBitrate: 64000,
        // Do not use discontinuous transmission for conversational audio.
        dtx: false,
      }));
      void sender.setParameters(params).catch(() => {});
    } catch {
      // Optional sender tuning is unsupported in some browsers.
    }
  }
}

function preferOpusForSpeech(pc: RTCPeerConnection) {
  // Opus is the browser-standard WebRTC speech codec. Prefer it without
  // removing browser-supported fallbacks, so calls still work on browsers
  // that expose a different codec set.
  try {
    const capabilities = RTCRtpSender.getCapabilities?.('audio');
    if (!capabilities?.codecs?.length) return;

    const opus = capabilities.codecs.filter(
      (codec) => codec.mimeType.toLowerCase() === 'audio/opus'
    );
    if (!opus.length) return;

    for (const transceiver of pc.getTransceivers()) {
      if (transceiver.sender.track?.kind !== 'audio') continue;
      if (typeof transceiver.setCodecPreferences !== 'function') continue;

      const current = capabilities.codecs;
      const ordered = [
        ...opus,
        ...current.filter(
          (codec) =>
            codec.mimeType.toLowerCase() !== 'audio/opus' &&
            !opus.some(
              (preferred) =>
                preferred.mimeType === codec.mimeType &&
                preferred.clockRate === codec.clockRate &&
                preferred.channels === codec.channels &&
                preferred.sdpFmtpLine === codec.sdpFmtpLine
            )
        ),
      ];
      transceiver.setCodecPreferences(ordered);
    }
  } catch {
    // Codec preference is optional; browser defaults remain valid.
  }
}


export function subscribeToIncomingCalls(myIdentityId: string, onCallReceived: (call: CallSession) => void) {
  const q = query(collection(db, 'calls'), where('receiverIdentityId', '==', myIdentityId));
  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type !== 'added' && change.type !== 'modified') return;
      const callData = { id: change.doc.id, ...change.doc.data() } as CallSession;
      if (callData.status === 'calling' && Date.now() - callData.createdAt < 60000) onCallReceived(callData);
    });
  }, (err) => console.error('Incoming call subscription error:', err));
}

export function subscribeToCallSession(callId: string, onUpdate: (call: CallSession) => void, onEnded?: () => void) {
  return onSnapshot(doc(db, 'calls', callId), (snapshot) => {
    if (!snapshot.exists()) { onEnded?.(); return; }
    const data = { id: snapshot.id, ...snapshot.data() } as CallSession;
    onUpdate(data);
    if (data.status === 'ended' || data.status === 'rejected') onEnded?.();
  }, (err) => console.error('Call session subscription error:', err));
}

function addCandidateWhenReady(
  pc: RTCPeerConnection,
  candidateData: RTCIceCandidateInit,
  queue: RTCIceCandidateInit[]
) {
  if (!candidateData?.candidate) return;
  if (pc.remoteDescription) {
    void pc.addIceCandidate(new RTCIceCandidate(candidateData)).catch((e) => console.warn('ICE candidate failed:', e));
  } else {
    queue.push(candidateData);
  }
}

async function flushCandidates(pc: RTCPeerConnection, queue: RTCIceCandidateInit[]) {
  if (!pc.remoteDescription) return;
  const pending = queue.splice(0);
  for (const c of pending) {
    try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
    catch (e) { console.warn('Queued ICE candidate failed:', e); }
  }
}

export async function createCallSession(
  callerIdentity: ChatIdentity,
  receiverIdentityId: string,
  receiverName: string,
  receiverAvatar: string,
  receiverUid: string,
  callType: CallType,
  conversationId?: string,
  localStream?: MediaStream,
  onRemoteTrack?: (event: RTCTrackEvent) => void
): Promise<{ callId: string; peerConnection: RTCPeerConnection }> {
  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const callRef = doc(db, 'calls', callId);
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const pendingRemoteCandidates: RTCIceCandidateInit[] = [];

  // Install the remote-track handler before creating the offer. This guarantees
  // that audio/video tracks are never missed during negotiation.
  if (onRemoteTrack) pc.ontrack = onRemoteTrack;

  localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream));
  preferOpusForSpeech(pc);
  tuneAudioSenders(pc);

  const callerCandidatesRef = collection(db, 'calls', callId, 'callerCandidates');
  pc.onicecandidate = (event) => {
    if (event.candidate) addDoc(callerCandidatesRef, event.candidate.toJSON()).catch((e) => console.warn('Caller ICE write failed:', e));
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const callData: CallSession = {
    id: callId, conversationId,
    callerUid: callerIdentity.uid, callerIdentityId: callerIdentity.id,
    callerName: callerIdentity.displayName, callerAvatar: callerIdentity.avatar,
    receiverUid, receiverIdentityId, receiverName, receiverAvatar,
    type: callType, status: 'calling',
    offer: { type: offer.type, sdp: offer.sdp }, createdAt: Date.now(),
  };
  await setDoc(callRef, callData);

  const unsubscribeCall = onSnapshot(callRef, async (snapshot) => {
    const data = snapshot.data() as CallSession | undefined;
    if (!data || !data.answer || pc.remoteDescription) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      await flushCandidates(pc, pendingRemoteCandidates);
    } catch (e) { console.error('Failed to set call answer:', e); }
  });

  const receiverCandidatesRef = collection(db, 'calls', callId, 'receiverCandidates');
  const unsubscribeCandidates = onSnapshot(receiverCandidatesRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') addCandidateWhenReady(pc, change.doc.data() as RTCIceCandidateInit, pendingRemoteCandidates);
    });
  });

  pc.addEventListener('connectionstatechange', () => {
    if (['closed', 'failed'].includes(pc.connectionState)) { unsubscribeCall(); unsubscribeCandidates(); }
  });
  return { callId, peerConnection: pc };
}

export async function answerCallSession(
  callId: string,
  localStream: MediaStream,
  onRemoteTrack?: (event: RTCTrackEvent) => void
): Promise<RTCPeerConnection> {
  const callRef = doc(db, 'calls', callId);
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const pendingCallerCandidates: RTCIceCandidateInit[] = [];

  // IMPORTANT: install the track handler BEFORE setRemoteDescription/createAnswer.
  // Some browsers can fire ontrack during setRemoteDescription; installing it
  // after this function returned caused the old build to silently lose media.
  if (onRemoteTrack) pc.ontrack = onRemoteTrack;
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  preferOpusForSpeech(pc);
  tuneAudioSenders(pc);

  const receiverCandidatesRef = collection(db, 'calls', callId, 'receiverCandidates');
  pc.onicecandidate = (event) => {
    if (event.candidate) addDoc(receiverCandidatesRef, event.candidate.toJSON()).catch((e) => console.warn('Receiver ICE write failed:', e));
  };

  const callerCandidatesRef = collection(db, 'calls', callId, 'callerCandidates');
  const unsubscribeCallerCandidates = onSnapshot(callerCandidatesRef, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') addCandidateWhenReady(pc, change.doc.data() as RTCIceCandidateInit, pendingCallerCandidates);
    });
  });

  const snapshot = await new Promise<any>((resolve, reject) => {
    const unsub = onSnapshot(callRef, (docSnap) => {
      if (docSnap.exists()) { unsub(); resolve(docSnap.data()); }
    }, reject);
  });
  if (!snapshot?.offer) throw new Error('Call offer not found');

  await pc.setRemoteDescription(new RTCSessionDescription(snapshot.offer));
  // Candidates may have arrived before the offer was applied.
  await flushCandidates(pc, pendingCallerCandidates);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await updateDoc(callRef, {
    status: 'connected', startedAt: Date.now(),
    answer: { type: answer.type, sdp: answer.sdp },
  });

  // Keep the listener until connection ends; later candidates are handled by the queue.
  pc.addEventListener('connectionstatechange', () => {
    if (['closed', 'failed'].includes(pc.connectionState)) unsubscribeCallerCandidates();
  });
  return pc;
}

export async function endCallSession(callId: string, status: 'ended' | 'rejected' = 'ended') {
  try { await updateDoc(doc(db, 'calls', callId), { status, endedAt: Date.now() }); }
  catch (err) { console.error('Error ending call session:', err); }
}
