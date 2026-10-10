import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Check, Plus } from 'lucide-react';
import { useToast } from '../context/ToastContext.js';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { SubscribeCelebration } from './SubscribeCelebration.js';

interface SubscribeButtonProps {
  channelId: string;
  channelName: string;
  isSubscribed: boolean;
  subscriberCount: number;
  onStateChange?: (isSubscribed: boolean, subscriberCount: number) => void;
  onCountChange?: (subscriberCount: number) => void;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-5 py-2.5 text-xs sm:text-sm',
  lg: 'px-6 py-2.5 text-xs sm:text-sm',
};

export const SubscribeButton: React.FC<SubscribeButtonProps> = ({
  channelId,
  channelName,
  isSubscribed,
  subscriberCount,
  onStateChange,
  size = 'md',
  showCount = false,
  className = ''
}) => {
  const toast = useToast();
  const { user, openAuthModal } = useAuth();
  const reducedMotion = useReducedMotion();

  const [pending, setPending] = useState(false);
  const [iconAnimKey, setIconAnimKey] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [celebrationRect, setCelebrationRect] = useState<DOMRect | null>(null);
  const [showConfirmPulse, setShowConfirmPulse] = useState(false);

  const inflightRef = useRef(false);
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handlePointerDown = useCallback(() => {
    if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    setIsPressed(true);
    pressTimeoutRef.current = setTimeout(() => setIsPressed(false), 160);
  }, []);

  const handleCelebrationComplete = useCallback(() => {
    setIsCelebrating(false);
    setCelebrationRect(null);
  }, []);

  const triggerCelebration = useCallback(() => {
    if (!buttonRef.current) return;
    setCelebrationRect(buttonRef.current.getBoundingClientRect());
    setIsCelebrating(true);
  }, []);

  const handleToggle = useCallback(async () => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (inflightRef.current) return;
    inflightRef.current = true;

    const prevSubscribed = isSubscribed;
    const prevCount = subscriberCount;
    const nextSubscribed = !prevSubscribed;
    const nextCount = Math.max(0, prevCount + (nextSubscribed ? 1 : -1));

    setPending(true);
    onStateChange?.(nextSubscribed, nextCount);
    setIconAnimKey(k => k + 1);

    try {
      const res = await apiRequest<{ isSubscribed: boolean; subscriberCount: number }>(
        `/api/channels/${channelId}/subscribe`,
        { method: 'POST' }
      );
      onStateChange?.(res.isSubscribed, res.subscriberCount);
      if (res.isSubscribed !== prevSubscribed) {
        toast.success(res.isSubscribed ? `Subscribed to ${channelName}` : `Unsubscribed from ${channelName}`);
      }

      if (!prevSubscribed && res.isSubscribed) {
        if (reducedMotion) {
          setShowConfirmPulse(true);
        } else {
          triggerCelebration();
        }
      }
    } catch (err: unknown) {
      onStateChange?.(prevSubscribed, prevCount);
      setIconAnimKey(0);
      toast.error('Could not update subscription', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      inflightRef.current = false;
      setPending(false);
    }
  }, [user, isSubscribed, subscriberCount, channelId, channelName, onStateChange, toast, openAuthModal, reducedMotion, triggerCelebration]);

  useEffect(() => {
    if (!showConfirmPulse) return;
    const t = setTimeout(() => setShowConfirmPulse(false), 320);
    return () => clearTimeout(t);
  }, [showConfirmPulse]);

  const activeStyles = 'bg-white border-rose-600 text-rose-600 shadow-sm hover:bg-rose-50 hover:shadow';
  const inactiveStyles = 'bg-gradient-to-b from-rose-500 to-rose-600 border-rose-600 text-white shadow-md hover:to-rose-700 hover:shadow-lg';
  const stateStyles = isSubscribed ? activeStyles : inactiveStyles;
  const pendingStyles = pending ? 'kinetix-pending pointer-events-none' : '';
  const pressStyles = isPressed ? 'kinetix-press' : '';
  const confirmPulse = showConfirmPulse ? 'kinetix-subscribe-confirm' : '';

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        onPointerDown={handlePointerDown}
        aria-pressed={isSubscribed}
        aria-label={isSubscribed ? `Unsubscribe from ${channelName}` : `Subscribe to ${channelName}`}
        aria-busy={pending}
        className={`kinetix-subscribe relative inline-flex items-center gap-1.5 rounded-xl font-semibold border-2 transition-all duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 ${stateStyles} ${pendingStyles} ${pressStyles} ${confirmPulse} ${sizeStyles[size]} ${className}`}
      >
<span className="relative inline-flex" aria-hidden="true">
            {isSubscribed ? (
              <Check
                key={`check-${iconAnimKey}`}
                className={`w-4 h-4 text-rose-600 kinetix-subscribe-pop ${size === 'sm' ? 'w-3.5 h-3.5' : ''}`}
              />
            ) : (
              <Plus
                key={`plus-${iconAnimKey}`}
                className={`w-4 h-4 text-white kinetix-subscribe-pop ${size === 'sm' ? 'w-3.5 h-3.5' : ''}`}
              />
            )}
          </span>
        <span>{isSubscribed ? 'Subscribed' : 'Subscribe'}</span>
        {showCount && <span className="opacity-70 font-bold tabular-nums">{subscriberCount}</span>}
      </button>

      {isCelebrating && celebrationRect && (
        <SubscribeCelebration
          isActive={isCelebrating}
          buttonRect={celebrationRect}
          reducedMotion={reducedMotion}
          onComplete={handleCelebrationComplete}
        />
      )}
    </div>
  );
};

export default SubscribeButton;
