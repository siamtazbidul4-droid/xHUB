import React, { useState, useEffect } from 'react';
import { Video, Channel, Category } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { VideoCard } from '../components/video/VideoCard.js';
import { Search, Filter, CheckCircle2, User, Compass } from 'lucide-react';

interface SearchPageProps {
  query: string;
  onSelectVideo: (id: string) => void;
  onSelectChannel: (id: string) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  query,
  onSelectVideo,
  onSelectChannel
}) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [matchingChannels, setMatchingChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('relevance');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ categories: Category[] }>('/api/categories')
      .then(res => setCategories(res.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const performSearch = async () => {
      setIsLoading(true);
      try {
        let endpoint = `/api/videos?search=${encodeURIComponent(query)}&sort=${sortBy}`;
        if (selectedCategory !== 'All') {
          endpoint += `&category=${encodeURIComponent(selectedCategory)}`;
        }

        const [videoRes, channelRes] = await Promise.all([
          apiRequest<{ videos: Video[] }>(endpoint),
          apiRequest<{ channels: Channel[] }>(`/api/channels?search=${encodeURIComponent(query)}`)
        ]);

        setVideos(videoRes.videos || []);
        setMatchingChannels(channelRes.channels || []);
      } catch (err) {
        // Silently handle
      } finally {
        setIsLoading(false);
      }
    };

    if (query) {
      performSearch();
    }
  }, [query, sortBy, selectedCategory]);

  return (
    <div className="max-w-7xl mx-auto pb-16 space-y-6">
      {/* Search Header & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Search className="w-6 h-6 text-rose-500" />
            <span>Search Results</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Found {videos.length} videos and {matchingChannels.length} creator channels
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-rose-500"
          >
            <option value="All">All Categories</option>
            {categories.filter(c => c.name !== 'All').map(c => (
              <option key={c._id} value={c.name}>{c.name}</option>
            ))}
          </select>

          {/* Sort Filter */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-rose-500"
          >
            <option value="relevance">Most Relevant</option>
            <option value="latest">Latest</option>
            <option value="views">Most Viewed</option>
            <option value="likes">Highest Rated</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-video bg-slate-200 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Matching Channels Spotlight */}
          {matchingChannels.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                Creators
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {matchingChannels.slice(0, 3).map((ch) => (
                  <div
                    key={ch._id}
                    onClick={() => onSelectChannel(ch._id)}
                    className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs hover:shadow-md cursor-pointer flex items-center gap-4 transition-all"
                  >
                    <img
                      src={ch.avatar}
                      alt={ch.name}
                      className="w-14 h-14 rounded-full object-cover border border-slate-200"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-sm text-slate-900 truncate">{ch.name}</h4>
                        {ch.verified && <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">{ch.handle}</p>
                      <p className="text-xs text-slate-500 mt-1 font-medium">
                        {ch.subscriberCount.toLocaleString()} subscribers
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Video Grid */}
          <div className="space-y-3 pt-2">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">
              Videos
            </h3>
            {videos.length === 0 ? (
              <div className="p-16 text-center bg-slate-50 border border-slate-200 rounded-3xl space-y-3">
                <Compass className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">No matching videos</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Try adjusting your search terms or selecting a different category.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
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
        </>
      )}
    </div>
  );
};
