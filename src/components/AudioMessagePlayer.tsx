import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

interface AudioMessagePlayerProps {
  audioUrl: string;
  durationSeconds?: number;
  isSentByMe: boolean;
}

export const AudioMessagePlayer: React.FC<AudioMessagePlayerProps> = ({
  audioUrl,
  durationSeconds,
  isSentByMe,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationSeconds || 0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTrackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;
    setIsLoaded(false);
    setLoadError(null);
    setCurrentTime(0);
    setIsPlaying(false);

    const cleanupObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    const loadAudio = async () => {
      try {
        // Media files are protected by the CalcChat HttpOnly session cookie.
        // Fetching with credentials first makes playback reliable even when a
        // browser media element refuses to attach credentials to a protected URL.
        const response = await fetch(audioUrl, { credentials: 'include', cache: 'default' });
        if (!response.ok) throw new Error(`Audio request failed (${response.status})`);
        const blob = await response.blob();
        if (!blob.size) throw new Error('Audio file is empty.');
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        audio.src = objectUrl;
        audio.load();
      } catch (error) {
        if (cancelled) return;
        // Backward compatibility: old messages may contain a direct data/blob URL.
        try {
          audio.src = audioUrl;
          audio.load();
        } catch {
          setLoadError(error instanceof Error ? error.message : 'Unable to load audio.');
        }
      }
    };

    audio.onloadedmetadata = () => {
      if (audio.duration && isFinite(audio.duration)) setTotalDuration(audio.duration);
      setIsLoaded(true);
      setLoadError(null);
    };
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onended = () => { setIsPlaying(false); setCurrentTime(0); };
    audio.onerror = () => {
      setIsPlaying(false);
      setIsLoaded(false);
      setLoadError('Unable to play this voice message. The media may be unavailable.');
    };

    void loadAudio();

    return () => {
      cancelled = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      cleanupObjectUrl();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((error) => {
        console.error('Audio playback failed:', error);
        setLoadError('Tap Play again or check that you are still signed in.');
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressTrackRef.current || !totalDuration) return;
    const rect = progressTrackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * totalDuration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // Visual Waveform bars
  const bars = [40, 70, 95, 60, 30, 85, 100, 50, 75, 45, 90, 60, 35, 80, 65, 45, 95, 70, 50, 85];

  return (
    <div className="flex items-center gap-3 py-1.5 min-w-[240px] max-w-sm select-none" title={loadError || undefined}>
      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow shrink-0 ${
          isSentByMe
            ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
            : 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950'
        }`}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" />
        )}
      </button>

      {/* Waveform & Scrubber */}
      <div className="flex-1 flex flex-col justify-center gap-1.5">
        <div
          ref={progressTrackRef}
          onClick={handleSeek}
          className="relative flex items-center gap-1 h-7 cursor-pointer group"
          title="Click to seek"
        >
          {bars.map((height, i) => {
            const barProgress = (i / bars.length) * 100;
            const isFilled = progressPercent >= barProgress;
            return (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-100 ${
                  isFilled
                    ? isSentByMe
                      ? 'bg-white'
                      : 'bg-emerald-400'
                    : isSentByMe
                    ? 'bg-white/30'
                    : 'bg-neutral-600'
                } ${isPlaying && isFilled ? 'scale-y-110' : ''}`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] font-mono opacity-80 leading-none">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
};
