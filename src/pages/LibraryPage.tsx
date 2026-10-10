import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { apiRequest, formatDuration, formatViews, formatRelativeTime } from '../api/client.js';
import { Video } from '../types/index.js';
import { VideoCard } from '../components/video/VideoCard.js';
import { ConfirmModal } from '../components/common/ConfirmModal.js';
import { Modal } from '../components/common/Modal.js';
import {
  History,
  ThumbsUp,
  Clock,
  Tv,
  Video as VideoIcon,
  Trash2,
  Edit,
  ExternalLink,
  Play
} from 'lucide-react';

interface LibraryPageProps {
  initialTab?: string;
  onSelectVideo: (id: string) => void;
  onSelectChannel: (id: string) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  initialTab = 'history',
  onSelectVideo,
  onSelectChannel
}) => {
  const { user, openAuthModal } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'history' | 'liked' | 'watch-later' | 'subscriptions' | 'my-videos'>(
    (initialTab as any) || 'history'
  );

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [likedVideos, setLikedVideos] = useState<Video[]>([]);
  const [watchLaterItems, setWatchLaterItems] = useState<any[]>([]);
  const [subscriptionVideos, setSubscriptionVideos] = useState<Video[]>([]);
  const [myVideos, setMyVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('Entertainment');
  const [editTags, setEditTags] = useState('');
  const [editVisibility, setEditVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [editAllowDownload, setEditAllowDownload] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    apiRequest<{ categories: any[] }>('/api/categories')
      .then(r => setCategories(r.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as any);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    loadTabData();
  }, [user, activeTab]);

  const loadTabData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'history') {
        const res = await apiRequest<{ history: any[] }>('/api/library/history');
        setHistoryItems(res.history || []);
      } else if (activeTab === 'liked') {
        const res = await apiRequest<{ videos: Video[] }>('/api/library/liked');
        setLikedVideos(res.videos || []);
      } else if (activeTab === 'watch-later') {
        const res = await apiRequest<{ items: any[] }>('/api/library/watch-later');
        setWatchLaterItems(res.items || []);
      } else if (activeTab === 'subscriptions') {
        const res = await apiRequest<{ videos: Video[] }>('/api/library/subscriptions');
        setSubscriptionVideos(res.videos || []);
      } else if (activeTab === 'my-videos') {
        const res = await apiRequest<{ videos: Video[] }>('/api/library/my-videos');
        setMyVideos(res.videos || []);
      }
    } catch (err: any) {
      toast.error('Failed to load library data', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAllHistory = async () => {
    try {
      await apiRequest('/api/library/history/clear-all', { method: 'DELETE' });
      setHistoryItems([]);
      toast.success('Watch history cleared');
    } catch (err: any) {
      toast.error('Failed to clear history', err.message);
    } finally {
      setIsClearHistoryConfirmOpen(false);
    }
  };

  const handleDeleteVideo = async () => {
    if (!videoToDelete) return;
    try {
      await apiRequest(`/api/videos/${videoToDelete}`, { method: 'DELETE' });
      setMyVideos(prev => prev.filter(v => v._id !== videoToDelete));
      toast.success('Video deleted permanently');
    } catch (err: any) {
      toast.error('Failed to delete video', err.message);
    } finally {
      setVideoToDelete(null);
    }
  };

  const handleSaveVideoEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVideo) return;
    try {
      const tagsArray = editTags.split(',').map(t => t.trim().toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
      await apiRequest(`/api/videos/${editingVideo._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim(),
          category: editCategory,
          tags: tagsArray,
          visibility: editVisibility,
          allowDownload: editAllowDownload
        })
      });
      setMyVideos(prev =>
        prev.map(v => (v._id === editingVideo._id ? {
          ...v,
          title: editTitle.trim(),
          description: editDesc.trim(),
          category: editCategory,
          tags: tagsArray,
          visibility: editVisibility,
          allowDownload: editAllowDownload
        } : v))
      );
      toast.success('Metadata updated successfully');
      setEditingVideo(null);
    } catch (err: any) {
      toast.error('Failed to update video', err.message);
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-slate-50 border border-slate-200 rounded-3xl space-y-4">
        <History className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Your Personal Library</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Sign in to access your watch history, liked videos, saved watch later playlists, and creator studio.
        </p>
        <button
          onClick={() => openAuthModal('login')}
          className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          Sign In Now
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-16 space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 overflow-x-auto no-scrollbar">
        {[
          { id: 'history', label: 'Watch History', icon: <History className="w-4 h-4" /> },
          { id: 'liked', label: 'Liked Videos', icon: <ThumbsUp className="w-4 h-4" /> },
          { id: 'watch-later', label: 'Watch Later', icon: <Clock className="w-4 h-4" /> },
          { id: 'subscriptions', label: 'Subscriptions Feed', icon: <Tv className="w-4 h-4" /> },
          { id: 'my-videos', label: 'My Uploads', icon: <VideoIcon className="w-4 h-4" /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-video bg-slate-200 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* 1. History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">
                  Recently Watched ({historyItems.length})
                </h3>
                {historyItems.length > 0 && (
                  <button
                    onClick={() => setIsClearHistoryConfirmOpen(true)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All History</span>
                  </button>
                )}
              </div>

              {historyItems.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs">
                  Your watch history is currently empty.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {historyItems.map((item) => (
                    <div key={item._id} className="relative group">
                      <VideoCard
                        video={item.video}
                        onSelectVideo={onSelectVideo}
                        onSelectChannel={onSelectChannel}
                      />
                      {/* Watch Progress Indicator */}
                      {item.progressSeconds > 0 && item.video.duration > 0 && (
                        <div className="absolute bottom-16 left-3.5 right-3.5 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="bg-rose-600 h-full"
                            style={{ width: `${Math.min(100, (item.progressSeconds / item.video.duration) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. Liked Videos Tab */}
          {activeTab === 'liked' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">
                Videos You Liked ({likedVideos.length})
              </h3>
              {likedVideos.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs">
                  No liked videos yet. Tap the thumbs up on any video to save it here!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {likedVideos.map((v) => (
                    <VideoCard
                      key={v._id}
                      video={v}
                      onSelectVideo={onSelectVideo}
                      onSelectChannel={onSelectChannel}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. Watch Later Tab */}
          {activeTab === 'watch-later' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">
                Saved for Later ({watchLaterItems.length})
              </h3>
              {watchLaterItems.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs">
                  Your Watch Later list is empty.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {watchLaterItems.map((item) => (
                    <VideoCard
                      key={item._id}
                      video={item.video}
                      onSelectVideo={onSelectVideo}
                      onSelectChannel={onSelectChannel}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Subscriptions Feed Tab */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">
                Latest from Channels You Follow ({subscriptionVideos.length})
              </h3>
              {subscriptionVideos.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs">
                  No subscription releases yet. Subscribe to your favorite creators to see their videos here.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {subscriptionVideos.map((v) => (
                    <VideoCard
                      key={v._id}
                      video={v}
                      onSelectVideo={onSelectVideo}
                      onSelectChannel={onSelectChannel}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. My Uploads Tab */}
          {activeTab === 'my-videos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">
                  Your Uploaded Content ({myVideos.length})
                </h3>
              </div>

              {myVideos.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs">
                  You haven't uploaded any videos yet. Head over to the Creator Studio to upload your first video!
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-slate-100">
                  {myVideos.map((v) => (
                    <div key={v._id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4 min-w-0">
                        <img
                          src={v.thumbnailUrl}
                          alt={v.title}
                          className="w-24 aspect-video rounded-lg object-cover bg-slate-100 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 truncate">{v.title}</h4>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-medium">
                            <span className="capitalize px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold">
                              {v.visibility}
                            </span>
                            <span>{formatViews(v.views)}</span>
                            <span>{v.likesCount} likes</span>
                            <span>{formatRelativeTime(v.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onSelectVideo(v._id)}
                          className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                          title="Watch video"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingVideo(v);
                            setEditTitle(v.title);
                            setEditDesc(v.description);
                            setEditCategory(v.category || 'Entertainment');
                            setEditTags(v.tags ? v.tags.join(', ') : '');
                            setEditVisibility(v.visibility);
                            setEditAllowDownload(v.allowDownload !== false);
                          }}
                          className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                          title="Edit metadata"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setVideoToDelete(v._id)}
                          className="p-2 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                          title="Delete video"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Clear History Confirmation Modal */}
      <ConfirmModal
        isOpen={isClearHistoryConfirmOpen}
        onClose={() => setIsClearHistoryConfirmOpen(false)}
        onConfirm={handleClearAllHistory}
        title="Clear Watch History"
        message="Are you sure you want to clear your entire watch history? This cannot be undone."
        confirmText="Clear History"
        isDestructive
      />

      {/* Delete Video Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(videoToDelete)}
        onClose={() => setVideoToDelete(null)}
        onConfirm={handleDeleteVideo}
        title="Delete Video Permanently"
        message="Are you sure you want to delete this video? All views, likes, and comments will be permanently erased."
        confirmText="Delete Video"
        isDestructive
      />

      {/* Edit Video Metadata Modal */}
      <Modal
        isOpen={Boolean(editingVideo)}
        onClose={() => setEditingVideo(null)}
        title="Edit Video Details"
      >
        <form onSubmit={handleSaveVideoEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Title</label>
            <input
              type="text"
              required
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-500"
              >
                {categories.filter(c => c.name !== 'All').map(c => (
                  <option key={c._id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Visibility</label>
              <select
                value={editVisibility}
                onChange={(e) => setEditVisibility(e.target.value as any)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-500"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tags (comma separated)</label>
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="e.g. tutorial, animation, 4k"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-500"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-xs font-semibold text-slate-700">Allow Download</span>
            <input
              type="checkbox"
              checked={editAllowDownload}
              onChange={(e) => setEditAllowDownload(e.target.checked)}
              className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingVideo(null)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
