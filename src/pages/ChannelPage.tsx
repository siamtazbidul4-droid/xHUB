import React, { useState, useEffect } from 'react';
import { Channel, Video } from '../types/index.js';
import { apiRequest, formatViews } from '../api/client.js';
import { VideoCard } from '../components/video/VideoCard.js';
import { SubscribeButton } from '../components/SubscribeButton.js';
import { EditChannelModal } from '../components/channel/EditChannelModal.js';
import { useAuth } from '../context/AuthContext.js';
import { CheckCircle2, Film, Info, Calendar, Users, Eye, Settings } from 'lucide-react';

interface ChannelPageProps {
  channelId: string;
  onSelectVideo: (id: string) => void;
  onSelectChannel: (id: string) => void;
}

export const ChannelPage: React.FC<ChannelPageProps> = ({
  channelId,
  onSelectVideo,
  onSelectChannel
}) => {
  const { user, openAuthModal } = useAuth();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'videos' | 'about'>('videos');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const isOwner = user && channel && (user.channelId === channel._id || user._id === channel.userId);

  const fetchChannel = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ channel: Channel; videos: Video[] }>(`/api/channels/${channelId}`);
      setChannel(res.channel);
      setVideos(res.videos || []);
      setIsSubscribed(Boolean(res.channel.isSubscribed));
      setSubscriberCount(res.channel.subscriberCount || 0);
    } catch (err: any) {
      setError(err.message || 'Channel not found');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChannel();
  }, [channelId]);

  const handleSubscribeStateChange = (nextSubscribed: boolean, nextCount: number) => {
    setIsSubscribed(nextSubscribed);
    setSubscriberCount(nextCount);
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="h-48 bg-slate-200 rounded-3xl w-full" />
        <div className="flex gap-4 items-center">
          <div className="w-20 h-20 rounded-full bg-slate-200" />
          <div className="space-y-2">
            <div className="h-5 bg-slate-200 rounded w-48" />
            <div className="h-4 bg-slate-200 rounded w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-slate-50 border border-slate-200 rounded-3xl space-y-3">
        <h3 className="font-bold text-slate-800 text-lg">Channel Not Found</h3>
        <p className="text-xs text-slate-500">{error || 'This creator channel does not exist.'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-16 space-y-6">
      {/* Channel Banner */}
      <div className="relative h-44 sm:h-64 rounded-3xl overflow-hidden bg-slate-100 border border-slate-200 shadow-xs">
        <img
          src={channel.banner || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80'}
          alt={channel.name}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Profile Header Details */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-4">
          <img
            src={channel.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=creator'}
            alt={channel.name}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-white shadow-md -mt-10 sm:-mt-12 z-10"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {channel.name}
              </h1>
              {channel.verified && (
                <CheckCircle2 className="w-5 h-5 text-rose-500 shrink-0" />
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{channel.handle}</p>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 font-medium">
              <span>{formatViews(subscriberCount).replace('views', 'subscribers')}</span>
              <span>•</span>
              <span>{videos.length} videos</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isOwner ? (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Customize Channel</span>
            </button>
          ) : (
            <SubscribeButton
              channelId={channel._id}
              channelName={channel.name}
              isSubscribed={isSubscribed}
              subscriberCount={subscriberCount}
              onStateChange={handleSubscribeStateChange}
              size="lg"
              showCount
            />
          )}
        </div>
      </div>

      {/* Tabs (Videos, About) */}
      <div className="border-b border-slate-200/80 flex gap-6 px-2">
        <button
          onClick={() => setActiveTab('videos')}
          className={`flex items-center gap-2 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'videos'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Videos ({videos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('about')}
          className={`flex items-center gap-2 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'about'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>About Channel</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'videos' ? (
        videos.length === 0 ? (
          <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs">
            This creator has not published any public videos yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {videos.map((v) => (
              <VideoCard
                key={v._id}
                video={v}
                onSelectVideo={onSelectVideo}
                onSelectChannel={onSelectChannel}
              />
            ))}
          </div>
        )
      ) : (
        <div className="max-w-2xl bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">Description</h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {channel.description || 'No description provided by creator.'}
            </p>
          </div>

          <hr className="border-slate-100" />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Subscribers
              </span>
              <p className="font-bold text-slate-900 text-sm">{subscriberCount.toLocaleString()}</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Total Views
              </span>
              <p className="font-bold text-slate-900 text-sm">{(channel.totalViews || 0).toLocaleString()}</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5" />
                Videos
              </span>
              <p className="font-bold text-slate-900 text-sm">{videos.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Customize Channel Modal */}
      <EditChannelModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSaved={fetchChannel}
      />
    </div>
  );
};
