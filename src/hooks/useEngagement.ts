import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useToast } from '../context/ToastContext';

export type LikeState = {
  isLiked: boolean;
  likesCount: number;
};

export type SubscribeState = {
  isSubscribed: boolean;
  subscriberCount: number;
};

type EngagementSnapshot = {
  like: LikeState;
  subscribe: SubscribeState;
};

/**
 * In-flight mutation guard.
 *
 * The backend like/subscribe endpoints are idempotent toggles (they key off the
 * user's existing like / subscription record), so we:
 *  - coalesce overlapping clicks into one in-flight request, and
 *  - discard responses from requests that a newer request superseded, so an
 *    out-of-order late response can never overwrite newer state.
 */
function usePendingToggle() {
  const [isPending, setIsPending] = useState(false);
  const tokenRef = useRef(0);

  useEffect(() => {
    const ref = tokenRef;
    return () => {
      // Invalidate any pending token when the consumer unmounts.
      ref.current += 1;
    };
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      const token = ++tokenRef.current;
      setIsPending(true);
      try {
        const result = await fn();
        // If a newer request superseded this one, ignore its result.
        return token === tokenRef.current ? result : null;
      } finally {
        if (token === tokenRef.current) setIsPending(false);
      }
    },
    []
  );

  return { isPending, run };
}

/**
 * Like / Subscribe engagement state with optimistic updates, rollback, and
 * reconciled counters. The backend response is always authoritative —
 * optimistic values are speculative and either confirmed or reverted.
 */
export function useEngagement(initial: EngagementSnapshot) {
  const [like, setLike] = useState<LikeState>(initial.like);
  const [subscribe, setSubscribe] = useState<SubscribeState>(initial.subscribe);

  const likeCtl = usePendingToggle();
  const subCtl = usePendingToggle();
  const toast = useToast();

  // Last confirmed (authoritative) values — the rollback target on failure.
  const confirmedRef = useRef<EngagementSnapshot>({
    like: initial.like,
    subscribe: initial.subscribe,
  });

  const commitConfirmed = useCallback((next: EngagementSnapshot) => {
    confirmedRef.current = next;
  }, []);

  /**
   * Like / Unlike. POST /api/videos/:id/like → { isLiked, likesCount }
   * Optimistic toggle, rollback to last confirmed state on failure.
   */
  const toggleLike = useCallback(
    async (videoId: string): Promise<void> => {
      if (!videoId) return;

      const prev = confirmedRef.current.like;
      const optimistic: LikeState = {
        isLiked: !prev.isLiked,
        likesCount: Math.max(0, prev.likesCount + (prev.isLiked ? -1 : 1)),
      };
      setLike(optimistic);

      await likeCtl.run(async () => {
        try {
          const res = await apiRequest<{ isLiked: boolean; likesCount: number }>(
            `/api/videos/${videoId}/like`,
            { method: 'POST' }
          );
          const confirmed: LikeState = {
            isLiked: res.isLiked,
            likesCount: res.likesCount,
          };
          setLike(confirmed);
          commitConfirmed({ ...confirmedRef.current, like: confirmed });
          // Feedback only on genuine state transitions — not on every click.
          if (confirmed.isLiked !== prev.isLiked) {
            toast.success(
              confirmed.isLiked ? 'Added to Liked Videos' : 'Removed from Liked Videos'
            );
          }
          return confirmed;
        } catch (err) {
          setLike(prev);
          toast.error(
            'Failed to update like',
            err instanceof Error ? err.message : 'Please try again.'
          );
          return null;
        }
      });
    },
    [likeCtl, toast, commitConfirmed]
  );

  /**
   * Subscribe / Unsubscribe. POST /api/channels/:id/subscribe
   * → { isSubscribed, subscriberCount }
   */
  const toggleSubscribe = useCallback(
    async (channelId: string): Promise<void> => {
      if (!channelId) return;

      const prev = confirmedRef.current.subscribe;
      const optimistic: SubscribeState = {
        isSubscribed: !prev.isSubscribed,
        subscriberCount: Math.max(0, prev.subscriberCount + (prev.isSubscribed ? -1 : 1)),
      };
      setSubscribe(optimistic);

      await subCtl.run(async () => {
        try {
          const res = await apiRequest<{ isSubscribed: boolean; subscriberCount: number }>(
            `/api/channels/${channelId}/subscribe`,
            { method: 'POST' }
          );
          const confirmed: SubscribeState = {
            isSubscribed: res.isSubscribed,
            subscriberCount: res.subscriberCount,
          };
          setSubscribe(confirmed);
          commitConfirmed({ ...confirmedRef.current, subscribe: confirmed });
          toast.success(res.isSubscribed ? 'Subscribed successfully' : 'Unsubscribed');
          return confirmed;
        } catch (err) {
          setSubscribe(prev);
          toast.error(
            'Failed to update subscription',
            err instanceof Error ? err.message : 'Please try again.'
          );
          return null;
        }
      });
    },
    [subCtl, toast, commitConfirmed]
  );

  return {
    like,
    subscribe,
    toggleLike,
    toggleSubscribe,
    isLikePending: likeCtl.isPending,
    isSubscribePending: subCtl.isPending,
  };
}
