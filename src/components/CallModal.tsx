import React, { useState, useEffect, useRef } from 'react';
import {
  CallSession,
  ChatIdentity,
} from '../types';
import {
  createCallSession,
  answerCallSession,
  endCallSession,
  subscribeToCallSession,
} from '../lib/callService';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface CallModalProps {
  activeIdentity: ChatIdentity;
  // If we are initiating an outgoing call
  outgoingCallData?: {
    receiverIdentityId: string;
    receiverName: string;
    receiverAvatar: string;
    receiverUid: string;
    callType: 'audio' | 'video';
    conversationId?: string;
  } | null;
  // If we received an incoming call
  incomingCallSession?: CallSession | null;
  onClose: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  activeIdentity,
  outgoingCallData,
  incomingCallSession,
  onClose,
}) => {
  const [callSession, setCallSession] = useState<CallSession | null>(
    incomingCallSession || null
  );
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('Connecting...');
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<any>(null);

  // Determine current active call type
  const isVideo = (callSession?.type || outgoingCallData?.callType) === 'video';

  // Browser-supported capture constraints tuned for clear speech and stable video.
  const getCaptureConstraints = (videoEnabled: boolean): MediaStreamConstraints => ({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
    },
    video: videoEnabled
      ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        }
      : false,
  });

  const attachRemoteMedia = (event: RTCTrackEvent) => {
    const track = event.track;
    track.enabled = true;

    if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
    if (!remoteStreamRef.current.getTracks().some((t) => t.id === track.id)) {
      try { remoteStreamRef.current.addTrack(track); } catch {}
    }

    // Keep audio and video in separate streams. Binding the same combined stream
    // to both <video> and <audio> can play the remote audio twice and makes calls
    // sound distorted/echoey.
    if (track.kind === 'audio') {
      if (!remoteAudioStreamRef.current) remoteAudioStreamRef.current = new MediaStream();
      if (!remoteAudioStreamRef.current.getTracks().some((t) => t.id === track.id)) {
        try { remoteAudioStreamRef.current.addTrack(track); } catch {}
      }
      const audio = remoteAudioRef.current;
      if (audio) {
        audio.srcObject = remoteAudioStreamRef.current;
        audio.muted = false;
        audio.volume = 1;
        audio.defaultMuted = false;
        void audio.play().then(() => setAudioPlaybackBlocked(false)).catch(() => setAudioPlaybackBlocked(true));
      }
      return;
    }

    if (track.kind === 'video' && isVideo) {
      if (!remoteVideoStreamRef.current) remoteVideoStreamRef.current = new MediaStream();
      if (!remoteVideoStreamRef.current.getTracks().some((t) => t.id === track.id)) {
        try { remoteVideoStreamRef.current.addTrack(track); } catch {}
      }
      const video = remoteVideoRef.current;
      if (video) {
        video.srcObject = remoteVideoStreamRef.current;
        video.muted = true; // Remote audio is played exactly once by remoteAudioRef.
        void video.play().catch(() => {});
      }
    }
  };

  // 1. Handle Outgoing Call Initiation
  useEffect(() => {
    if (!outgoingCallData) return;

    let isMounted = true;
    async function startOutgoing() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          getCaptureConstraints(outgoingCallData?.callType === 'video')
        );
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach((track) => { track.enabled = true; });

        if (localVideoRef.current && outgoingCallData?.callType === 'video') {
          localVideoRef.current.srcObject = stream;
        }

        // Setup remote media before WebRTC negotiation starts.
        remoteStreamRef.current = new MediaStream();
        const handleRemoteTrack = attachRemoteMedia;

        const { callId, peerConnection } = await createCallSession(
          activeIdentity,
          outgoingCallData.receiverIdentityId,
          outgoingCallData.receiverName,
          outgoingCallData.receiverAvatar,
          outgoingCallData.receiverUid,
          outgoingCallData.callType,
          outgoingCallData.conversationId,
          stream,
          handleRemoteTrack
        );

        pcRef.current = peerConnection;

        peerConnection.onconnectionstatechange = () => {
          if (!isMounted) return;
          setConnectionState(peerConnection.connectionState);
          if (
            peerConnection.connectionState === 'connected' &&
            !timerRef.current
          ) {
            timerRef.current = setInterval(() => {
              setCallDuration((prev) => prev + 1);
            }, 1000);
          }
        };

        // Subscribe to call session updates
        subscribeToCallSession(
          callId,
          (session) => {
            if (!isMounted) return;
            setCallSession(session);
            if (session.status === 'connected' && !timerRef.current) {
              timerRef.current = setInterval(() => {
                setCallDuration((prev) => prev + 1);
              }, 1000);
            }
          },
          () => {
            if (isMounted) {
              handleCleanup();
              onClose();
            }
          }
        );
      } catch (err) {
        console.error('Error starting call:', err);
        alert('Could not start call. Please check microphone/camera permissions.');
        onClose();
      }
    }

    startOutgoing();

    return () => {
      isMounted = false;
      handleCleanup();
    };
  }, [outgoingCallData]);

  // 2. Handle Incoming Call Answering
  const handleAnswerCall = async () => {
    if (!incomingCallSession) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        getCaptureConstraints(incomingCallSession.type === 'video')
      );
      localStreamRef.current = stream;

      if (localVideoRef.current && incomingCallSession.type === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      remoteStreamRef.current = new MediaStream();
      const handleRemoteTrack = attachRemoteMedia;
      const pc = await answerCallSession(incomingCallSession.id, stream, handleRemoteTrack);
      pcRef.current = pc;
      // answerCallSession installs the handler before setRemoteDescription, preventing lost early tracks.

      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        if (pc.connectionState === 'connected' && !timerRef.current) {
          timerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
          }, 1000);
        }
      };

      // Start the timer only after the peer connection is actually connected.
      // Listen for updates
      subscribeToCallSession(
        incomingCallSession.id,
        (session) => {
          setCallSession(session);
        },
        () => {
          handleCleanup();
          onClose();
        }
      );
    } catch (err) {
      console.error('Error answering call:', err);
      alert('Could not access microphone/camera.');
      handleRejectCall();
    }
  };

  const handleRejectCall = async () => {
    if (incomingCallSession) {
      await endCallSession(incomingCallSession.id, 'rejected');
    }
    handleCleanup();
    onClose();
  };

  const handleEndCall = async () => {
    const callId = callSession?.id || incomingCallSession?.id;
    if (callId) {
      await endCallSession(callId, 'ended');
    }
    handleCleanup();
    onClose();
  };

  const handleCleanup = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => { try { track.stop(); } catch {} });
      remoteStreamRef.current = null;
    }
    if (remoteAudioStreamRef.current) {
      remoteAudioStreamRef.current.getTracks().forEach((track) => { try { track.stop(); } catch {} });
      remoteAudioStreamRef.current = null;
    }
    if (remoteVideoStreamRef.current) {
      remoteVideoStreamRef.current.getTracks().forEach((track) => { try { track.stop(); } catch {} });
      remoteVideoStreamRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoDisabled(!isVideoDisabled);
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isIncomingPending = incomingCallSession && callSession?.status !== 'connected';
  const otherName =
    incomingCallSession?.callerName ||
    outgoingCallData?.receiverName ||
    callSession?.receiverName ||
    'Contact';
  const otherAvatar =
    incomingCallSession?.callerAvatar ||
    outgoingCallData?.receiverAvatar ||
    callSession?.receiverAvatar ||
    'https://api.dicebear.com/7.x/bottts/svg?seed=Felix';

  return (
    <div
      id="calcchat-call-modal"
      className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div
        className={`relative w-full rounded-3xl bg-neutral-900 border border-neutral-800 shadow-2xl flex flex-col overflow-hidden transition-all ${
          isFullscreen ? 'h-full max-w-full' : 'max-w-xl h-[560px]'
        }`}
      >
        {/* Top Header */}
        <div className="p-4 bg-neutral-950/40 border-b border-neutral-800/80 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">{otherName}</h3>
              <p className="text-xs text-neutral-400">
                {callSession?.status === 'connected'
                  ? `Connected • ${formatDuration(callDuration)}`
                  : isIncomingPending
                  ? `Incoming ${isVideo ? 'Video' : 'Voice'} Call...`
                  : `Calling ${isVideo ? 'Video' : 'Voice'}...`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isVideo && (
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Remote audio is required for voice calls and also mirrors the audio track during video calls. */}
        <audio ref={remoteAudioRef} autoPlay playsInline preload="auto" controls={false} className="hidden" />
        {audioPlaybackBlocked && (
          <button
            type="button"
            onClick={() => {
              const audio = remoteAudioRef.current;
              const video = remoteVideoRef.current;
              const p1 = audio ? audio.play() : Promise.resolve();
              const p2 = video ? video.play() : Promise.resolve();
              Promise.allSettled([p1, p2]).then(() => setAudioPlaybackBlocked(false));
            }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold shadow-lg"
          >
            Tap to enable speaker
          </button>
        )}

        {/* Main Call View Area */}
        <div className="flex-1 relative flex flex-col items-center justify-center bg-neutral-950 overflow-hidden">
          {/* Video Streams if Video Call */}
          {isVideo ? (
            <div className="w-full h-full relative bg-neutral-950 flex items-center justify-center">
              {/* Remote Video Stream */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Local Video Picture-in-Picture */}
              <div className="absolute top-4 right-4 w-32 h-44 rounded-2xl overflow-hidden border-2 border-neutral-700 bg-neutral-900 shadow-xl z-20">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror"
                />
              </div>

              {/* Overlay if connecting */}
              {callSession?.status !== 'connected' && (
                <div className="absolute inset-0 bg-neutral-950/80 flex flex-col items-center justify-center space-y-4 z-10">
                  <div className="relative">
                    <img
                      src={otherAvatar}
                      alt={otherName}
                      className="w-24 h-24 rounded-full border-4 border-emerald-500/50 shadow-2xl object-cover"
                    />
                    <span className="absolute inset-0 rounded-full border-4 border-emerald-400 animate-ping opacity-30" />
                  </div>
                  <h4 className="text-base font-bold text-neutral-100">{otherName}</h4>
                  <p className="text-xs text-neutral-400 animate-pulse">
                    {isIncomingPending ? 'Incoming call...' : 'Ringing...'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Audio Call Screen */
            <div className="flex flex-col items-center justify-center space-y-6 p-8">
              <div className="relative">
                <img
                  src={otherAvatar}
                  alt={otherName}
                  className="w-28 h-28 rounded-full border-4 border-neutral-700 shadow-2xl object-cover bg-neutral-900"
                />
                {callSession?.status === 'connected' ? (
                  <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-4 border-neutral-900 flex items-center justify-center">
                    <Volume2 className="w-3 h-3 text-neutral-950" />
                  </span>
                ) : (
                  <span className="absolute inset-0 rounded-full border-4 border-emerald-400 animate-ping opacity-40" />
                )}
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-xl font-bold text-neutral-100">{otherName}</h3>
                <p className="text-xs text-emerald-400 font-mono">
                  {callSession?.status === 'connected'
                    ? formatDuration(callDuration)
                    : isIncomingPending
                    ? 'Incoming Voice Call...'
                    : 'Calling...'}
                </p>
              </div>

              {/* Waveform Animation for Voice */}
              {callSession?.status === 'connected' && (
                <div className="flex items-center gap-1.5 h-8">
                  {[40, 75, 90, 55, 30, 85, 100, 60, 45, 90, 70, 40].map((h, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-emerald-500 rounded-full animate-pulse"
                      style={{
                        height: `${h}%`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="p-5 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-center gap-4 z-20">
          {isIncomingPending ? (
            /* Incoming Call Actions: Accept or Decline */
            <div className="flex items-center gap-8">
              <button
                id="decline-call-btn"
                onClick={handleRejectCall}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white transition-transform group-hover:scale-105 shadow-xl shadow-red-950">
                  <PhoneOff className="w-6 h-6" />
                </div>
                <span className="text-xs text-neutral-400">Decline</span>
              </button>

              <button
                id="accept-call-btn"
                onClick={handleAnswerCall}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center text-white transition-transform group-hover:scale-105 shadow-xl shadow-emerald-950 animate-bounce">
                  <Phone className="w-6 h-6" />
                </div>
                <span className="text-xs text-emerald-400 font-semibold">Accept</span>
              </button>
            </div>
          ) : (
            /* Active / Outgoing Call Controls */
            <div className="flex items-center gap-4">
              {/* Mute Mic */}
              <button
                onClick={toggleMute}
                className={`p-3.5 rounded-full transition-colors ${
                  isMuted
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Toggle Video (if video call) */}
              {isVideo && (
                <button
                  onClick={toggleVideo}
                  className={`p-3.5 rounded-full transition-colors ${
                    isVideoDisabled
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                  }`}
                  title={isVideoDisabled ? 'Turn video on' : 'Turn video off'}
                >
                  {isVideoDisabled ? (
                    <VideoOff className="w-5 h-5" />
                  ) : (
                    <Video className="w-5 h-5" />
                  )}
                </button>
              )}

              {/* End / Hang Up Call */}
              <button
                id="hangup-call-btn"
                onClick={handleEndCall}
                className="p-3.5 rounded-full bg-red-600 hover:bg-red-500 text-white transition-transform hover:scale-105 shadow-xl shadow-red-950"
                title="End call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
