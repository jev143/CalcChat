import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Send, Trash2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface VoiceRecorderProps {
  onSendVoiceNote: (audioBlob: Blob, durationSeconds: number) => Promise<void>;
  onCancel: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSendVoiceNote,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    setDuration(0);
    setRecordedBlob(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser or iframe.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 },
        },
      });
      streamRef.current = stream;

      // Realtime Audio Level Analyser for responsive visual feedback
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          audioCtxRef.current = audioCtx;
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyserRef.current = analyser;
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateAudioMeter = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((average / 128) * 100)));
            animFrameRef.current = requestAnimationFrame(updateAudioMeter);
          };
          updateAudioMeter();
        }
      } catch (e) {
        console.warn('AudioContext visualization not available:', e);
      }

      // Check supported MIME type
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorderOptions: MediaRecorderOptions = { mimeType };
      // Keep speech recording at a high, stable Opus bitrate. The browser
      // still controls the final codec details and packetization.
      if (mimeType.includes('webm') || mimeType.includes('ogg')) {
        recorderOptions.audioBitsPerSecond = 96000;
      }
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
      };

      // Let MediaRecorder manage its own chunking. This avoids unnecessary
      // timeslice fragmentation while preserving the browser's final Opus
      // packet when recording stops.
      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      let msg = 'Microphone permission denied or not available.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        msg = 'Microphone access was denied. Please allow microphone permissions in your browser bar.';
      } else if (err?.message) {
        msg = err.message;
      }
      setError(msg);
      setIsRecording(false);
    }
  };

  const finalizeRecording = async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return recordedBlob;

    if (recorder.state === 'inactive') {
      return recordedBlob || (
        audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          : null
      );
    }

    return new Promise<Blob | null>((resolve) => {
      const finish = () => {
        const type = recorder.mimeType || 'audio/webm';
        const finalBlob = new Blob(audioChunksRef.current, { type });
        setRecordedBlob(finalBlob);
        // IMPORTANT: stop microphone tracks only after MediaRecorder has
        // emitted its final data and stop event.
        stopTracks();
        resolve(finalBlob.size > 0 ? finalBlob : null);
      };

      recorder.addEventListener('stop', finish, { once: true });
      try {
        recorder.stop();
      } catch {
        finish();
      }

      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    });
  };

  const handleStopRecording = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    await finalizeRecording();
  };

  const handleSend = async () => {
    let blob = recordedBlob;

    if (!blob && mediaRecorderRef.current && isRecording) {
      blob = await finalizeRecording();
    }

    if (!blob || blob.size === 0) {
      setError('No audio was recorded. Please try again.');
      return;
    }

    setRecordedBlob(blob);
    setSending(true);
    try {
      await onSendVoiceNote(blob, Math.max(1, duration));
    } catch (err) {
      console.error('Error sending audio note:', err);
      setError(err instanceof Error ? err.message : 'Failed to send voice message.');
    } finally {
      setSending(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      id="voice-recorder-bar"
      className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl px-3 py-2 w-full animate-in fade-in duration-200"
    >
      {/* Discard / Cancel */}
      <button
        type="button"
        id="cancel-voice-record-btn"
        onClick={onCancel}
        className="p-2 rounded-xl text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors"
        title="Discard recording"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Recording Status / Waveform */}
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          {isRecording ? (
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
          ) : (
            <Mic className="w-4 h-4 text-emerald-400" />
          )}
          <span className="font-mono text-xs text-neutral-100 font-bold">
            {formatSeconds(duration)}
          </span>
        </div>

        {/* Dynamic Waveform Visualizer */}
        <div className="flex items-center gap-1 flex-1 h-6 overflow-hidden">
          {[40, 70, 90, 60, 30, 80, 100, 50, 65, 85, 45, 95, 75, 55, 80, 60, 40, 90, 70, 50].map(
            (baseHeight, i) => {
              const dynamicHeight = isRecording
                ? Math.min(100, Math.max(15, baseHeight * 0.4 + audioLevel * 0.8))
                : 25;
              return (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-100 ${
                    isRecording ? 'bg-emerald-400' : 'bg-neutral-700'
                  }`}
                  style={{
                    height: `${dynamicHeight}%`,
                  }}
                />
              );
            }
          )}
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="truncate max-w-[160px] text-[11px]">{error}</span>
          <button
            onClick={startRecording}
            className="p-1 text-emerald-400 hover:text-emerald-300"
            title="Retry permission"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          {isRecording && (
            <button
              type="button"
              id="stop-voice-record-btn"
              onClick={handleStopRecording}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-400 transition-colors"
              title="Stop recording"
            >
              <Square className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            id="send-voice-note-btn"
            onClick={handleSend}
            disabled={sending}
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center shadow-md shadow-emerald-950"
            title="Send voice note"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};
