import React from 'react';
import { Video } from '../../types/index.js';
import { formatDuration, formatViews, formatRelativeTime } from '../../api/client.js';
import { CheckCircle2, Clock, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { apiRequest } from '../../api/client.js';

interface VideoCardProps {
  video: Video;
  onSelectVideo?: (id: string) => void;
  onSelectChannel?: (channelId: string) => void;
  isCompact?: boolean;
  index?: number;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onSelectVideo,
  onSelectChannel,
  isCompact = false,
  index = 0
}) => {
  const { user, openAuthModal } = useAuth();
  const toast = useToast();
  const [isSavedWatchLater, setIsSavedWatchLater] = React.useState(false);

  // Alternating hover variant: even index (0, 2, 4...) = red family, odd index (1, 3, 5...) = green family
  const isRedVariant = index % 2 === 0;
  const hoverRing = isRedVariant ? 'group-hover:ring-rose-500/40' : 'group-hover:ring-emerald-500/40';
  const hoverShadow = isRedVariant ? 'group-hover:shadow-rose-900/10' : 'group-hover:shadow-emerald-900/10';
  const hoverScrim = isRedVariant
    ? 'bg-gradient-to-t from-rose-950/30 via-rose-900/10 to-transparent'
    : 'bg-gradient-to-t from-emerald-950/30 via-emerald-900/10 to-transparent';
  const hoverTitleColor = isRedVariant ? 'group-hover:text-rose-700' : 'group-hover:text-emerald-700';
  const hoverAvatarRing = isRedVariant ? 'hover:ring-rose-500/50' : 'hover:ring-emerald-500/50';
  const compactHoverTitleColor = isRedVariant ? 'group-hover:text-rose-600' : 'group-hover:text-emerald-600';

  const handleWatchLaterClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      openAuthModal();
      return;
    }

    try {
      const res = await apiRequest<{ isSaved: boolean }>(`/api/library/watch-later/${video._id}`, {
        method: 'POST'
      });
      setIsSavedWatchLater(res.isSaved);
      if (res.isSaved) {
        toast.success('Saved to Watch Later');
      } else {
        toast.info('Removed from Watch Later');
      }
    } catch (err: any) {
      toast.error('Failed to update Watch Later', err.message);
    }
  };

  if (isCompact) {
    return (
      <div
        onClick={() => onSelectVideo?.(video._id)}
        className="group flex gap-3 cursor-pointer p-2 rounded-xl hover:bg-slate-100/70 transition-colors"
      >
        <div className="relative shrink-0 w-40 aspect-video rounded-lg overflow-hidden bg-slate-100">
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 backdrop-blur-xs text-[11px] font-mono font-medium text-white rounded">
            {formatDuration(video.duration)}
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <h4 className={`text-sm font-semibold text-slate-900 line-clamp-2 leading-snug transition-colors ${compactHoverTitleColor}`}>
              {video.title}
            </h4>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-slate-500 font-medium truncate">
                {video.channel?.name || 'Creator'}
              </span>
              {video.channel?.verified && (
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              )}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            <span>{formatViews(video.views)}</span>
            <span className="mx-1">•</span>
            <span>{formatRelativeTime(video.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelectVideo?.(video._id)}
      className="group flex flex-col cursor-pointer rounded-xl p-1 -m-1 transition-transform duration-200 ease-out motion-reduce:transition-none hover:sm:-translate-y-0.5"
    >
      {/* Thumbnail */}
      <div className={`relative aspect-video w-full bg-slate-100 overflow-hidden rounded-lg ring-1 ring-slate-200/70 transition-all duration-200 ease-out group-hover:shadow-lg ${hoverShadow} ${hoverRing}`}>
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
          loading="lazy"
        />
        {/* Subtle hover scrim — aids duration badge legibility, no layout impact */}
        <div
          className={`absolute inset-0 ${hoverScrim} opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none`}
          aria-hidden="true"
        />
        {/* Duration badge */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/85 text-xs font-medium text-white rounded-md transition-transform duration-200 group-hover:bg-black">
          {formatDuration(video.duration)}
        </div>

        {/* Quick Watch Later button */}
        <button
          onClick={handleWatchLaterClick}
          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/90 backdrop-blur-xs text-white rounded-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity motion-reduce:transition-none"
          title={isSavedWatchLater ? 'Saved to Watch Later' : 'Watch Later'}
          aria-label="Save to Watch Later"
        >
          {isSavedWatchLater ? (
            <Check className="w-4 h-4 text-emerald-500" />
          ) : (
            <Clock className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Info Container */}
      <div className="p-3 flex gap-3">
        {/* Creator Avatar */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (video.channel?._id) onSelectChannel?.(video.channel._id);
          }}
          className="shrink-0"
        >
          <img
            src={video.channel?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=creator'}
            alt={video.channel?.name || 'Creator'}
            className={`w-10 h-10 rounded-full object-cover border border-slate-200/80 transition-all ${hoverAvatarRing}`}
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <h3
            className={`text-sm font-semibold text-slate-900 line-clamp-2 leading-snug transition-colors duration-150 ${hoverTitleColor}`}
            title={video.title}
          >
            {video.title}
          </h3>

          <div
            onClick={(e) => {
              e.stopPropagation();
              if (video.channel?._id) onSelectChannel?.(video.channel._id);
            }}
            className="flex items-center gap-1.5 mt-1.5 cursor-pointer hover:underline"
          >
            <p className="text-xs font-medium text-slate-600 truncate">
              {video.channel?.name || 'Creator'}
            </p>
            {video.channel?.verified && (
              <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 font-medium">
            <span>{formatViews(video.views)}</span>
            <span>•</span>
            <span>{formatRelativeTime(video.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
