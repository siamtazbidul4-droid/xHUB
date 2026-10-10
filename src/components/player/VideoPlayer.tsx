import React, { useEffect, useRef, useState, useCallback } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Settings,
  Tv,
  Check
} from 'lucide-react';
import { formatDuration } from '../../api/client.js';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number, duration: number, isPlaying: boolean, accumulatedWatched: number) => void;
  onEnded?: () => void;
  onViewThresholdMet?: () => void;
  isTheaterMode?: boolean;
  onToggleTheaterMode?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  title,
  initialTime = 0,
  onTimeUpdate,
  onEnded,
  onViewThresholdMet,
  isTheaterMode,
  onToggleTheaterMode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  // Accumulated actual playback time in milliseconds. Grows only by the
  // delta between timeupdate ticks while the player was genuinely playing,
  // so page-open time, pauses, tab switches and buffering do not count.
  const accumulatedWatchedMsRef = useRef(0);
  const lastTickMsRef = useRef<number | null>(null);
  const lastCurRef = useRef<number | null>(null);
  // Mirrors isPlaying state for use inside the once-registered timeupdate
  // handler (a plain state read would be a stale closure value).
  const isPlayingRef = useRef(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onViewThresholdMetRef = useRef(onViewThresholdMet);
  const onEndedRef = useRef(onEnded);
  // One-shot view flag as a ref: the video.js timeupdate handler is
  // registered once per src change, so a state value would be captured
  // stale by the closure and the threshold would re-fire every tick.
  const hasTriggeredViewThresholdRef = useRef(false);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
    onViewThresholdMetRef.current = onViewThresholdMet;
    onEndedRef.current = onEnded;
  });

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setIsSettingsOpen(false);
      }
    }, 3000);
  }, [isPlaying]);

  // Handle src changes dynamically without destroying the DOM video element
  useEffect(() => {
    if (!videoRef.current) return;

    if (playerRef.current) {
      // Re-use existing player
      setHasError(false);
      setErrorMessage('');
      setIsLoading(true);
      hasTriggeredViewThresholdRef.current = false;
      setCurrentTime(0);
      accumulatedWatchedMsRef.current = 0;
      lastTickMsRef.current = null;
      lastCurRef.current = null;
      isPlayingRef.current = false;

      playerRef.current.src({
        src,
        type: src.endsWith('.webm') ? 'video/webm' : 'video/mp4'
      });
      if (poster) {
        playerRef.current.poster(poster);
      }
      playerRef.current.load();
      return;
    }

    // Initialize Video.js player once
    const player = videojs(videoRef.current, {
      controls: false,
      autoplay: false,
      preload: 'auto',
      fluid: true,
      poster: poster || undefined,
      sources: [
        {
          src,
          type: src.endsWith('.webm') ? 'video/webm' : 'video/mp4'
        }
      ]
    });

    playerRef.current = player;

    player.on('play', () => {
      isPlayingRef.current = true;
      setIsPlaying(true);
      setIsLoading(false);
    });

    player.on('pause', () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setShowControls(true);
    });

    player.on('waiting', () => {
      setIsLoading(true);
    });

    player.on('playing', () => {
      setIsLoading(false);
    });

    player.on('timeupdate', () => {
      const cur = player.currentTime() || 0;
      const dur = player.duration() || 0;

      // Accumulate actual playback time. Only the delta between consecutive
      // ticks while the player is genuinely playing counts towards the
      // watch-history threshold — so seeking (large/zero/negative deltas),
      // pausing, buffering and tab-switch time are all excluded.
      const nowMs = Date.now();
      const prevCur = lastCurRef.current;
      // A jump in currentTime between ticks means the user seeked: the
      // elapsed wall time across the jump must not count as watched time.
      const isSeek = prevCur !== null && Math.abs(cur - prevCur) > 1.5;
      if (isPlayingRef.current && lastTickMsRef.current !== null && !isSeek) {
        const delta = nowMs - lastTickMsRef.current;
        if (delta > 0 && delta < 1000) {
          accumulatedWatchedMsRef.current += delta;
        }
      }
      lastTickMsRef.current = nowMs;
      lastCurRef.current = cur;

      setCurrentTime(cur);
      setDuration(dur);

      if (onTimeUpdateRef.current) {
        onTimeUpdateRef.current(cur, dur, isPlaying, accumulatedWatchedMsRef.current);
      }

      // View threshold check: 4 seconds watched
      if (cur >= 4 && !hasTriggeredViewThresholdRef.current) {
        hasTriggeredViewThresholdRef.current = true;
        if (onViewThresholdMetRef.current) {
          onViewThresholdMetRef.current();
        }
      }

      // Buffered progress calculation
      const buffered = player.buffered();
      if (buffered && buffered.length > 0) {
        for (let i = 0; i < buffered.length; i++) {
          if (buffered.start(i) <= cur && cur <= buffered.end(i)) {
            setBufferedEnd(buffered.end(i));
            break;
          }
        }
      }
    });

    player.on('loadedmetadata', () => {
      const dur = player.duration() || 0;
      setDuration(dur);
      setIsLoading(false);
      if (initialTime > 0 && initialTime < dur - 5) {
        player.currentTime(initialTime);
      }
    });

    player.on('ended', () => {
      setIsPlaying(false);
      if (onEndedRef.current) onEndedRef.current();
    });

    player.on('volumechange', () => {
      setVolume(player.volume() || 1);
      setIsMuted(player.muted() || false);
    });

    player.on('error', () => {
      const err = player.error();
      setIsLoading(false);
      setHasError(true);
      setErrorMessage(err ? err.message : 'Media stream interrupted or unsupported format.');
    });
  }, [src, poster, initialTime]);

  // Dispose player strictly on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  const handleRetryPlayback = () => {
    setHasError(false);
    setIsLoading(true);
    const player = playerRef.current;
    if (player) {
      player.src({
        src,
        type: src.endsWith('.webm') ? 'video/webm' : 'video/mp4'
      });
      player.load();
      const playPromise = player.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }
  };

  // Update poster if changed
  useEffect(() => {
    if (playerRef.current && poster) {
      playerRef.current.poster(poster);
    }
  }, [poster]);

  // Handle Fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const player = playerRef.current;
      if (!player) return;

      if (e.code === 'Space' || e.key === 'k') {
        e.preventDefault();
        if (player.paused()) player.play();
        else player.pause();
        resetControlsTimeout();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        player.currentTime(Math.max(0, (player.currentTime() || 0) - 5));
        resetControlsTimeout();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        player.currentTime(Math.min(player.duration() || 0, (player.currentTime() || 0) + 5));
        resetControlsTimeout();
      } else if (e.key === 'j') {
        e.preventDefault();
        player.currentTime(Math.max(0, (player.currentTime() || 0) - 10));
        resetControlsTimeout();
      } else if (e.key === 'l') {
        e.preventDefault();
        player.currentTime(Math.min(player.duration() || 0, (player.currentTime() || 0) + 10));
        resetControlsTimeout();
      } else if (e.key === 'm') {
        e.preventDefault();
        player.muted(!player.muted());
        resetControlsTimeout();
      } else if (e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key >= '0' && e.key <= '9') {
        const pct = parseInt(e.key, 10) / 10;
        player.currentTime((player.duration() || 0) * pct);
        resetControlsTimeout();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetControlsTimeout]);

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused()) {
      player.play();
    } else {
      player.pause();
    }
    resetControlsTimeout();
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    player.muted(!player.muted());
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    const player = playerRef.current;
    if (!player) return;
    player.volume(newVol);
    if (newVol > 0 && player.muted()) {
      player.muted(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    const player = playerRef.current;
    if (!player) return;
    player.currentTime(targetTime);
    setCurrentTime(targetTime);
  };

  const skipSeconds = (seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const newTime = Math.max(0, Math.min(duration, (player.currentTime() || 0) + seconds));
    player.currentTime(newTime);
    resetControlsTimeout();
  };

  const setSpeed = (rate: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.playbackRate(rate);
    setPlaybackRate(rate);
    setIsSettingsOpen(false);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative group bg-black w-full overflow-hidden select-none aspect-video rounded-lg"
    >
      <div data-vjs-player className="w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          className="video-js vjs-default-skin w-full h-full object-contain cursor-pointer"
          onClick={togglePlay}
          playsInline
        />
      </div>

      {/* Buffering Indicator */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/30 backdrop-blur-2xs">
          <div className="w-12 h-12 border-4 border-white/20 border-t-rose-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Error State Overlay */}
      {hasError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 text-white p-6 text-center space-y-3">
          <p className="font-bold text-sm sm:text-base text-rose-400">Media Stream Interrupted</p>
          <p className="text-xs text-slate-400 max-w-sm">{errorMessage}</p>
          <button
            onClick={handleRetryPlayback}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Retry Playback</span>
          </button>
        </div>
      )}

      {/* Custom Player Controls Overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-300 bg-gradient-to-t from-black/85 via-transparent to-black/40 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top bar: Video title */}
        <div className="p-4 flex items-center justify-between text-white drop-shadow-md">
          <p className="font-semibold text-sm sm:text-base truncate max-w-xl">{title}</p>
        </div>

        {/* Center Click Play/Pause Ripple Button */}
        <div className="flex items-center justify-center pointer-events-auto">
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white flex items-center justify-center border border-white/20 transition-transform active:scale-90"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 fill-white" />
            ) : (
              <Play className="w-8 h-8 fill-white ml-1" />
            )}
          </button>
        </div>

        {/* Bottom controls panel */}
        <div className="p-4 space-y-2 pointer-events-auto">
          {/* Scrubber Progress Bar */}
          <div className="relative flex items-center group/scrubber cursor-pointer h-4">
            {/* Background track */}
            <div className="absolute inset-x-0 h-1.5 bg-white/25 rounded-full overflow-hidden group-hover/scrubber:h-2 transition-all">
              {/* Buffer Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-white/40 transition-all duration-150"
                style={{ width: `${bufferedPercent}%` }}
              />
              {/* Played Progress Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-rose-600 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Hidden Input Range for precise dragging */}
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-x-0 w-full opacity-0 cursor-pointer h-4 z-10"
              aria-label="Seek video progress"
            />

            {/* Scrubber thumb handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 rounded-full bg-rose-500 border-2 border-white shadow-md pointer-events-none opacity-0 group-hover/scrubber:opacity-100 transition-opacity"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          {/* Action buttons row */}
          <div className="flex items-center justify-between text-white text-xs sm:text-sm font-medium pt-1">
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                onClick={togglePlay}
                className="p-1.5 hover:text-rose-400 transition-colors"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <button
                onClick={() => skipSeconds(-10)}
                className="p-1.5 hover:text-rose-400 transition-colors"
                title="Rewind 10s (J)"
                aria-label="Rewind 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => skipSeconds(10)}
                className="p-1.5 hover:text-rose-400 transition-colors"
                title="Forward 10s (L)"
                aria-label="Forward 10 seconds"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume & Slider */}
              <div className="flex items-center gap-2 group/vol">
                <button
                  onClick={toggleMute}
                  className="p-1.5 hover:text-rose-400 transition-colors"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-20 accent-rose-500 h-1 bg-white/30 rounded-lg cursor-pointer"
                  aria-label="Adjust volume"
                />
              </div>

              {/* Time display */}
              <div className="text-white/80 tabular-nums font-mono text-xs hidden sm:block">
                <span>{formatDuration(currentTime)}</span>
                <span className="mx-1 text-white/40">/</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-4 relative">
              {/* Playback speed menu */}
              <div className="relative">
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="px-2 py-1 rounded-md hover:bg-white/10 text-xs font-semibold flex items-center gap-1 transition-colors"
                  aria-label="Playback speed"
                >
                  <Settings className="w-4 h-4" />
                  <span>{playbackRate}x</span>
                </button>

                {isSettingsOpen && (
                  <div className="absolute right-0 bottom-full mb-2 bg-slate-900/95 backdrop-blur-md border border-white/10 text-white rounded-xl shadow-2xl p-2 w-36 z-50 animate-in fade-in zoom-in-95">
                    <p className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                      Speed
                    </p>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={`speed-${rate}`}
                        onClick={() => setSpeed(rate)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-white/15 transition-colors ${
                          playbackRate === rate ? 'text-rose-400 font-bold bg-white/5' : 'text-slate-200'
                        }`}
                      >
                        <span>{rate === 1 ? 'Normal' : `${rate}x`}</span>
                        {playbackRate === rate && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Theater Mode Toggle */}
              {onToggleTheaterMode && (
                <button
                  onClick={onToggleTheaterMode}
                  className={`p-1.5 hover:text-rose-400 transition-colors hidden md:block ${
                    isTheaterMode ? 'text-rose-400' : 'text-white'
                  }`}
                  title="Theater mode (T)"
                  aria-label="Toggle theater mode"
                >
                  <Tv className="w-4 h-4" />
                </button>
              )}

              {/* Fullscreen Toggle */}
              <button
                onClick={toggleFullscreen}
                className="p-1.5 hover:text-rose-400 transition-colors"
                title="Fullscreen (F)"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
