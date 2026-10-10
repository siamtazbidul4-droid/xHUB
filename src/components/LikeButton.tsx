import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ThumbsUp } from 'lucide-react';
import { useToast } from '../context/ToastContext.js';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const BURST_DOTS = [
  { x: -14, y: -10 },
  { x: 2, y: -15 },
  { x: 14, y: -10 },
  { x: -14, y: 8 },
  { x: 2, y: 13 },
  { x: 14, y: 8 },
];

interface LikeButtonProps {
  videoId: string;
  isLiked: boolean;
  likesCount: number;
  onStateChange?: (isLiked: boolean, likesCount: number) => void;
  compact?: boolean;
  className?: string;
}

export const LikeButton: React.FC<LikeButtonProps> = ({
  videoId,
  isLiked,
  likesCount,
  onStateChange,
  compact = false,
  className = ''
}) => {
  const toast = useToast();
  const { user, openAuthModal } = useAuth();
  const [pending, setPending] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const [iconAnimKey, setIconAnimKey] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const lastActionRef = useRef<'like' | 'unlike' | null>(null);
  const inflightRef = useRef(false);
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up burst dots after animation completes (460ms + buffer).
  useEffect(() => {
    if (!showBurst) return;
    const t = setTimeout(() => setShowBurst(false), 560);
    return () => clearTimeout(t);
  }, [showBurst, burstKey]);

  const handlePointerDown = useCallback(() => {
    if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    setIsPressed(true);
    pressTimeoutRef.current = setTimeout(() => setIsPressed(false), 160);
  }, []);

  const handleToggle = useCallback(async () => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (inflightRef.current) return;
    inflightRef.current = true;

    const prevLiked = isLiked;
    const prevCount = likesCount;
    const nextLiked = !prevLiked;
    // Optimistic count: never goes negative, matches backend Math.max(0, ...) contract.
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

    lastActionRef.current = nextLiked ? 'like' : 'unlike';
    setPending(true);
    onStateChange?.(nextLiked, nextCount);

    // Animation only on genuine user interaction, never on rerender.
    setIconAnimKey(k => k + 1);
    if (nextLiked) {
      setBurstKey(k => k + 1);
      setShowBurst(true);
    }

    try {
      const res = await apiRequest<{ isLiked: boolean; likesCount: number }>(
        `/api/videos/${videoId}/like`,
        { method: 'POST' }
      );
      // Reconcile with the authoritative backend response.
      onStateChange?.(res.isLiked, res.likesCount);
      if (res.isLiked !== prevLiked) {
        toast.success(res.isLiked ? 'Added to Liked Videos' : 'Removed from Liked Videos');
      }
    } catch (err: unknown) {
      // Roll back optimistic state and count on failure.
      onStateChange?.(prevLiked, prevCount);
      setIconAnimKey(0);
      setShowBurst(false);
      toast.error('Could not update like', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      inflightRef.current = false;
      setPending(false);
      lastActionRef.current = null;
    }
  }, [user, isLiked, likesCount, videoId, onStateChange, toast, openAuthModal]);

  // State visuals (rose accent matches existing palette: rose-600 for liked).
  const activeStyles = 'bg-rose-50 border-rose-200 text-rose-600 font-bold';
  const inactiveStyles = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50';
  const stateStyles = isLiked ? activeStyles : inactiveStyles;
  const pendingStyles = pending ? 'kinetix-pending' : '';
  const pressStyles = isPressed ? 'kinetix-press' : '';

  return (
    <button
      onClick={handleToggle}
      onPointerDown={handlePointerDown}
      aria-pressed={isLiked}
      aria-label={isLiked ? 'Unlike video' : 'Like video'}
      aria-busy={pending}
      className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all ${stateStyles} ${pendingStyles} ${pressStyles} ${className}`}
    >
      <span className="relative inline-flex" aria-hidden="true">
        <ThumbsUp
          className={`w-4 h-4 ${isLiked ? 'fill-rose-600 text-rose-600' : ''} ${isLiked ? 'kinetix-like-icon-active' : 'kinetix-like-icon-inactive'}`}
          key={`icon-${iconAnimKey}`}
        />
        {showBurst && (
          <span key={`burst-${burstKey}`} className="absolute inset-0 pointer-events-none">
            {BURST_DOTS.map((d, i) => (
              <span
                key={`${burstKey}-${i}`}
                className="kinetix-burst-dot text-rose-600"
                style={{
                  ['--burst-x' as any]: `${d.x}px`,
                  ['--burst-y' as any]: `${d.y}px`,
                  animationDelay: `${i * 25}ms`
                }}
              />
            ))}
          </span>
        )}
      </span>
      <span>{likesCount}</span>
    </button>
  );
};

export default LikeButton;
