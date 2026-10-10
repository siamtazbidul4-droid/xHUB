import React, { useState, useEffect } from 'react';
import { Video, Category } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { VideoCard } from '../components/video/VideoCard.js';
import { Compass, Play } from 'lucide-react';

interface HomePageProps {
  onSelectVideo: (id: string) => void;
  onSelectChannel: (id: string) => void;
  selectedCategory?: string;
  initialTab?: 'foryou' | 'latest' | 'trending' | 'recommended';
}

export const HomePage: React.FC<HomePageProps> = ({
  onSelectVideo,
  onSelectChannel,
  selectedCategory = 'All',
  initialTab
}) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentCategory, setCurrentCategory] = useState<string>(selectedCategory);
  const [activeTab, setActiveTab] = useState<'foryou' | 'latest' | 'trending' | 'recommended'>(initialTab || 'foryou');
  const [featuredVideo, setFeaturedVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentCategory(selectedCategory || 'All');
  }, [selectedCategory]);

  // Load Categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await apiRequest<{ categories: Category[] }>('/api/categories');
        setCategories(data.categories || []);
      } catch (err) {
        // Silently handle
      }
    };
    fetchCategories();
  }, []);

  // Load Videos based on active tab & category
  useEffect(() => {
    const fetchVideos = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // "For You" is the ranked discovery feed; the other tabs map
        // directly onto the equivalent server-side orderings.
        const sortParam = activeTab === 'foryou' ? 'ranked' : activeTab;
        let endpoint = `/api/videos?sort=${sortParam}&limit=24`;
        if (currentCategory && currentCategory !== 'All' && currentCategory !== 'all') {
          endpoint += `&category=${encodeURIComponent(currentCategory)}`;
        }

        if (activeTab === 'trending' && (!currentCategory || currentCategory === 'All')) {
          endpoint = '/api/videos/trending';
        } else if (activeTab === 'recommended' && (!currentCategory || currentCategory === 'All')) {
          endpoint = '/api/videos/recommended';
        }

        const data = await apiRequest<{ videos: Video[] }>(endpoint);
        const list = data.videos || [];
        setVideos(list);

        // Find featured spotlight video
        if (list.length > 0 && !featuredVideo) {
          const featured = list.find(v => v.featured) || list[0];
          setFeaturedVideo(featured);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load videos.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideos();
  }, [currentCategory, activeTab]);

  return (
    <div className="space-y-2 pb-12">
      {/* Category Pills Bar — sticky offset is 0 because `main` is the scroll
          container (the fixed header sits outside it), so top-0 pins the bar
          flush under the header instead of pushing it 64px down the scrollport. */}
      <div className="sticky top-0 z-30 bg-white py-1.5 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {categories.map((cat) => {
          const isSelected = (currentCategory || 'All').toLowerCase() === cat.name.toLowerCase();
          return (
            <button
              key={cat._id}
              onClick={() => setCurrentCategory(cat.name)}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isSelected
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
              }`}
            >
              {cat.name}
              {cat.videoCount > 0 && cat.name !== 'All' && (
                <span className={`ml-1.5 text-[10px] font-normal ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                  {cat.videoCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hero Featured Video Spotlight (Shown when on "All") */}
      {featuredVideo && (!currentCategory || currentCategory === 'All') && (
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0">
            <img
              src={featuredVideo.thumbnailUrl}
              alt={featuredVideo.title}
              className="w-full h-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />
          </div>

          <div className="relative p-5 sm:p-8 max-w-3xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-white/10 text-xs font-semibold rounded-md text-slate-300">
                {featuredVideo.category}
              </span>
            </div>

            <h1 className="text-xl sm:text-3xl font-bold tracking-tight leading-tight">
              {featuredVideo.title}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 leading-relaxed">
              {featuredVideo.description}
            </p>

            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onSelectVideo(featuredVideo._id)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-xl text-sm transition-colors"
              >
                <Play className="w-4 h-4 fill-slate-900" />
                <span>Watch now</span>
              </button>

              <button
                onClick={() => featuredVideo.channel?._id && onSelectChannel(featuredVideo.channel._id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-colors"
              >
                <img
                  src={featuredVideo.channel?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=creator'}
                  alt={featuredVideo.channel?.name || 'Creator'}
                  className="w-6 h-6 rounded-full object-cover"
                />
                <span>{featuredVideo.channel?.name}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discovery Tabs Bar */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setActiveTab('foryou')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
              activeTab === 'foryou'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>For You</span>
          </button>

          <button
            onClick={() => setActiveTab('latest')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
              activeTab === 'latest'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Latest</span>
          </button>

          <button
            onClick={() => setActiveTab('trending')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
              activeTab === 'trending'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Trending</span>
          </button>

          <button
            onClick={() => setActiveTab('recommended')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
              activeTab === 'recommended'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Recommended</span>
          </button>
        </div>

        <span className="text-xs font-medium text-slate-400 hidden sm:inline">
          {videos.length} videos
        </span>
      </div>

      {/* Video Content Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-3">
              <div className="aspect-video bg-slate-200 rounded-lg w-full" />
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-5/6" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-12 text-center bg-rose-50 border border-rose-100 rounded-xl text-rose-700">
          <p className="font-bold text-base">Failed to load video feed</p>
          <p className="text-xs text-rose-500 mt-1">{error}</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <Compass className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="font-bold text-slate-800 text-base">No videos found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            There are currently no videos published in this category. You can be the first to upload one!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
          {videos.map((video, index) => (
            <VideoCard
              key={video._id}
              video={video}
              onSelectVideo={onSelectVideo}
              onSelectChannel={onSelectChannel}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
};
