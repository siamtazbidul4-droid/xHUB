import React, { useState, useEffect } from 'react';
import { Video, CommentItem } from '../types/index.js';
import { apiRequest, mediaUrl, formatViews, formatRelativeTime } from '../api/client.js';
import { VideoPlayer } from '../components/player/VideoPlayer.js';
import { VideoCard } from '../components/video/VideoCard.js';
import { LikeButton } from '../components/LikeButton.js';
import { SubscribeButton } from '../components/SubscribeButton.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { ConfirmModal } from '../components/common/ConfirmModal.js';
import { Modal } from '../components/common/Modal.js';
import {
  ThumbsUp,
  Share2,
  Download,
  Clock,
  Flag,
  CheckCircle2,
  MessageSquare,
  CornerDownRight,
  MoreVertical,
  Edit2,
  Trash2,
  Send,
  ChevronDown,
  ChevronUp,
  Check
} from 'lucide-react';

interface WatchPageProps {
  videoId: string;
  onSelectVideo: (id: string) => void;
  onSelectChannel: (id: string) => void;
}

export const WatchPage: React.FC<WatchPageProps> = ({
  videoId,
  onSelectVideo,
  onSelectChannel
}) => {
  const { user, openAuthModal } = useAuth();
  const toast = useToast();

  const [video, setVideo] = useState<Video | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Engagement state
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isSavedWatchLater, setIsSavedWatchLater] = useState(false);

  // Comments state
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentInput, setCommentInput] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [replyInputMap, setReplyInputMap] = useState<Record<string, string>>({});
  const [activeReplyBoxId, setActiveReplyBoxId] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});

  // Editing comment state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  // Delete comment confirmation
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);

  // Report modal state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTargetType, setReportTargetType] = useState<'video' | 'comment'>('video');
  const [reportTargetId, setReportTargetId] = useState<string>(videoId);
  const [reportReason, setReportReason] = useState<'spam' | 'harassment' | 'copyright' | 'misleading' | 'inappropriate' | 'other'>('spam');
  const [reportNotes, setReportNotes] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Stored state
  const lastSavedSecondRef = React.useRef<number>(0);
  const hasCrossedThresholdRef = React.useRef<boolean>(false);

  // Load video details and related videos
  useEffect(() => {
    // Reset the watch-history debounce tracker so the new video records
    // its own 15-second boundaries instead of inheriting the previous
    // video's last-saved second (which would skip the new video's first
    // save and could leave short videos unrecorded entirely).
    lastSavedSecondRef.current = 0;
    hasCrossedThresholdRef.current = false;

    const fetchVideoDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiRequest<{ video: Video; relatedVideos: Video[] }>(`/api/videos/${videoId}`);
        setVideo(data.video);
        setIsLiked(Boolean(data.video.isLiked));
        setLikesCount(data.video.likesCount || 0);
        setIsSubscribed(Boolean(data.video.isSubscribed));
        setIsSavedWatchLater(Boolean(data.video.isSavedWatchLater));
        setSubscribersCount(data.video.channel?.subscriberCount || 0);
        setRelatedVideos(data.relatedVideos || []);

        // Load comments
        loadComments(videoId);
      } catch (err: any) {
        setError(err.message || 'Video not found or inaccessible.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideoDetails();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [videoId]);

  const loadComments = async (vid: string) => {
    try {
      const data = await apiRequest<{ comments: CommentItem[]; total: number }>(`/api/comments/video/${vid}`);
      setComments(data.comments || []);
      // Server total counts every comment document (top-level + replies),
      // matching video.commentsCount in the database.
      setCommentsTotal(typeof data.total === 'number' ? data.total : (data.comments || []).length);
    } catch (err: unknown) {
      toast.error('Failed to load comments', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  // Watch Progress & History recording with strict 3s eligibility threshold
  // and 15s debouncing for subsequent progress updates.
  const handleTimeUpdate = (currentTime: number, duration: number, isPlaying: boolean, accumulatedWatchedMs: number) => {
    if (user && isPlaying && accumulatedWatchedMs >= 3000) {
      const curSec = Math.floor(currentTime);
      if (!hasCrossedThresholdRef.current) {
        // First time crossing the 3-second eligibility threshold — save immediately.
        hasCrossedThresholdRef.current = true;
        lastSavedSecondRef.current = curSec;
        apiRequest('/api/library/history', {
          method: 'POST',
          body: JSON.stringify({
            videoId,
            progressSeconds: curSec,
            completed: duration > 0 && currentTime / duration > 0.9
          })
        }).catch(() => {});
      } else if (curSec > 0 && curSec % 15 === 0 && curSec !== lastSavedSecondRef.current) {
        // Subsequent saves debounced at 15-second boundaries to avoid spam.
        lastSavedSecondRef.current = curSec;
        apiRequest('/api/library/history', {
          method: 'POST',
          body: JSON.stringify({
            videoId,
            progressSeconds: curSec,
            completed: duration > 0 && currentTime / duration > 0.9
          })
        }).catch(() => {});
      }
    }
  };

  const handleVideoEnded = () => {
    if (user && (video?.duration || 0) >= 3) {
      apiRequest('/api/library/history', {
        method: 'POST',
        body: JSON.stringify({
          videoId,
          progressSeconds: Math.floor(video?.duration || 0),
          completed: true
        })
      }).catch(() => {});
    }
  };

  // View count increment when threshold (>= 4s) met
  const handleViewThresholdMet = async () => {
    try {
      const res = await apiRequest<{ views: number }>(`/api/videos/${videoId}/view`, {
        method: 'POST',
        body: JSON.stringify({ secondsWatched: 5 })
      });
      if (res && res.views) {
        setVideo(prev => prev ? { ...prev, views: res.views } : null);
      }
    } catch (err) {
      // Silently handle
    }
  };

  // Toggle Like / Unlike — handled by the reusable LikeButton component.
  const handleLikeStateChange = (nextLiked: boolean, nextCount: number) => {
    setIsLiked(nextLiked);
    setLikesCount(nextCount);
  };

  // Toggle Subscribe / Unsubscribe — handled by the reusable SubscribeButton component.
  const handleSubscribeStateChange = (nextSubscribed: boolean, nextCount: number) => {
    setIsSubscribed(nextSubscribed);
    setSubscribersCount(nextCount);
  };

  // Share link
  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Link Copied to Clipboard!', 'You can now share this video with friends.');
  };

  // Real Download Video
  const handleDownload = () => {
    if (!video) return;
    // Media/download URLs cannot carry an Authorization header, so the token
    // is included as a query parameter for the server's media-auth path.
    const downloadUrl = mediaUrl(`/api/videos/${video._id}/download`);
    // Trigger real download via anchor
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${video.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Download started', `Downloading "${video.title}"`);
  };

  // Toggle Watch Later
  const handleWatchLater = async () => {
    if (!user) {
      openAuthModal();
      return;
    }
    try {
      const res = await apiRequest<{ isSaved: boolean }>(`/api/library/watch-later/${videoId}`, { method: 'POST' });
      setIsSavedWatchLater(res.isSaved);
      toast.success(res.isSaved ? 'Saved to Watch Later' : 'Removed from Watch Later');
    } catch (err: any) {
      toast.error('Error', err.message);
    }
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    if (!commentInput.trim()) return;

    setIsPostingComment(true);
    try {
      const res = await apiRequest<{ comment: CommentItem }>(`/api/comments/video/${videoId}`, {
        method: 'POST',
        body: JSON.stringify({ content: commentInput })
      });
      setComments(prev => [res.comment, ...prev]);
      setCommentsTotal(prev => prev + 1);
      setCommentInput('');
      toast.success('Comment posted successfully');
    } catch (err: any) {
      toast.error('Failed to post comment', err.message);
    } finally {
      setIsPostingComment(false);
    }
  };

  // Add Reply
  const handleAddReply = async (parentCommentId: string) => {
    if (!user) {
      openAuthModal();
      return;
    }
    const content = replyInputMap[parentCommentId];
    if (!content || !content.trim()) return;

    try {
      const res = await apiRequest<{ comment: CommentItem }>(`/api/comments/video/${videoId}`, {
        method: 'POST',
        body: JSON.stringify({ content, parentId: parentCommentId })
      });

      setComments(prev =>
        prev.map(c => {
          if (c._id === parentCommentId) {
            return {
              ...c,
              replyCount: (c.replyCount || 0) + 1,
              replies: [...(c.replies || []), res.comment]
            };
          }
          return c;
        })
      );
      setCommentsTotal(prev => prev + 1);

      setReplyInputMap(prev => ({ ...prev, [parentCommentId]: '' }));
      setActiveReplyBoxId(null);
      setExpandedReplies(prev => ({ ...prev, [parentCommentId]: true }));
      toast.success('Reply posted');
    } catch (err: any) {
      toast.error('Failed to post reply', err.message);
    }
  };

  // Delete Comment
  const handleConfirmDeleteComment = async () => {
    if (!commentToDelete) return;
    // Backend cascades deletion to direct replies; mirror that in the total.
    const target = comments.find(c => c._id === commentToDelete);
    const nestedReplyCount = target ? (target.replies || []).length : 0;
    try {
      await apiRequest(`/api/comments/${commentToDelete}`, { method: 'DELETE' });
      setComments(prev =>
        prev
          .filter(c => c._id !== commentToDelete)
          .map(c => ({
            ...c,
            replies: (c.replies || []).filter(r => r._id !== commentToDelete)
          }))
      );
      setCommentsTotal(prev => Math.max(0, prev - 1 - nestedReplyCount));
      toast.success('Comment deleted');
    } catch (err: any) {
      toast.error('Failed to delete comment', err.message);
    } finally {
      setCommentToDelete(null);
    }
  };

  // Save Edited Comment
  const handleSaveEditComment = async (commentId: string) => {
    if (!editingContent.trim()) return;
    try {
      await apiRequest(`/api/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editingContent.trim() })
      });
      setComments(prev =>
        prev.map(c => {
          if (c._id === commentId) {
            return { ...c, content: editingContent.trim(), updatedAt: new Date().toISOString() };
          }
          if (c.replies) {
            return {
              ...c,
              replies: c.replies.map(r => r._id === commentId ? { ...r, content: editingContent.trim(), updatedAt: new Date().toISOString() } : r)
            };
          }
          return c;
        })
      );
      setEditingCommentId(null);
      setEditingContent('');
      toast.success('Comment updated successfully');
    } catch (err: any) {
      toast.error('Failed to update comment', err.message);
    }
  };

  // Submit Report
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    setIsSubmittingReport(true);
    try {
      await apiRequest('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetId: reportTargetId || videoId,
          targetType: reportTargetType || 'video',
          reason: reportReason,
          notes: reportNotes
        })
      });
      setIsReportModalOpen(false);
      setReportNotes('');
      toast.success('Report Submitted', 'Our moderation team will review this content.');
    } catch (err: any) {
      toast.error('Failed to submit report', err.message);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="aspect-video bg-slate-200 rounded-3xl w-full" />
        <div className="h-8 bg-slate-200 rounded w-2/3" />
        <div className="h-12 bg-slate-200 rounded w-1/3" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="max-w-2xl mx-auto my-16 p-10 text-center bg-slate-50 border border-slate-200 rounded-3xl space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Video Unavailable</h2>
        <p className="text-sm text-slate-500 leading-relaxed">{error || 'This video could not be loaded.'}</p>
        <button
          onClick={() => onSelectVideo('home')}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          Return to Discovery Feed
        </button>
      </div>
    );
  }

  return (
    <div className={`mx-auto pb-16 transition-all ${isTheaterMode ? 'max-w-full px-2' : 'max-w-7xl'}`}>
      <div className={`grid gap-8 ${isTheaterMode ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
        {/* Left Column: Player, Video Info, Comments */}
        <div className={`space-y-6 ${isTheaterMode ? 'w-full' : 'lg:col-span-2'}`}>
          {/* Real Video.js Player Component */}
          <div className="w-full">
            <VideoPlayer
              src={video.videoUrl.startsWith('/uploads/') ? mediaUrl(`/api/videos/${video._id}/stream`) : video.videoUrl}
              poster={video.thumbnailUrl}
              title={video.title}
              initialTime={video.progressSeconds || 0}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleVideoEnded}
              onViewThresholdMet={handleViewThresholdMet}
              isTheaterMode={isTheaterMode}
              onToggleTheaterMode={() => setIsTheaterMode(!isTheaterMode)}
            />
          </div>

          {/* Title & Stats */}
          <div className="space-y-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {video.title}
            </h1>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-b border-slate-100 pb-4">
              {/* Creator channel info & Subscribe */}
              <div className="flex items-center gap-3">
                <div
                  onClick={() => video.channel?._id && onSelectChannel(video.channel._id)}
                  className="cursor-pointer"
                >
                  <img
                    src={video.channel?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=creator'}
                    alt={video.channel?.name || 'Creator'}
                    className="w-11 h-11 rounded-full object-cover border border-slate-200 hover:ring-2 hover:ring-rose-500/50 transition-all"
                  />
                </div>
                <div>
                  <div
                    onClick={() => video.channel?._id && onSelectChannel(video.channel._id)}
                    className="flex items-center gap-1.5 cursor-pointer hover:underline"
                  >
                    <span className="font-bold text-slate-900 text-sm">{video.channel?.name}</span>
                    {video.channel?.verified && (
                      <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    {formatViews(subscribersCount).replace('views', 'subscribers')}
                  </p>
                </div>

                {user && video.channel && video.channel.userId !== user._id && (
                  <SubscribeButton
                    channelId={video.channel._id}
                    channelName={video.channel.name}
                    isSubscribed={isSubscribed}
                    subscriberCount={subscribersCount}
                    onStateChange={handleSubscribeStateChange}
                    size="md"
                  />
                )}
              </div>

              {/* Action buttons (Like, Share, Download, Watch Later, Report) */}
              <div className="flex flex-wrap items-center gap-2">
                <LikeButton
                  videoId={videoId}
                  isLiked={isLiked}
                  likesCount={likesCount}
                  onStateChange={handleLikeStateChange}
                />

                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-all"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>

                {video.allowDownload && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                )}

                <button
                  onClick={handleWatchLater}
                  className="p-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-all"
                  title="Watch Later"
                  aria-label="Save to Watch Later"
                >
                  {isSavedWatchLater ? <Check className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => setIsReportModalOpen(true)}
                  className="p-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-rose-600 rounded-xl transition-all"
                  title="Report content"
                  aria-label="Report video"
                >
                  <Flag className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Description Box */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span>{formatViews(video.views)}</span>
              <span>•</span>
              <span>{formatRelativeTime(video.createdAt)}</span>
              <span>•</span>
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-600 font-semibold uppercase">
                {video.category}
              </span>
            </div>

            {/* Clickable Tags */}
{video.tags && video.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {video.tags.map((tag, idx) => (
                      <span key={`${tag}-${idx}`} className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer">
                        #{tag}
                  </span>
                ))}
              </div>
            )}

            <p className={`text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line ${
              isDescriptionExpanded ? '' : 'line-clamp-3'
            }`}>
              {video.description}
            </p>

            {video.description && video.description.length > 150 && (
              <button
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                className="text-xs font-bold text-slate-900 hover:text-rose-600 flex items-center gap-1 pt-1"
              >
                <span>{isDescriptionExpanded ? 'Show less' : 'Show more'}</span>
                {isDescriptionExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Comments Section */}
          <div className="space-y-6 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-rose-500" />
                <span>Comments ({commentsTotal})</span>
              </h3>
            </div>

            {/* Add Comment Input Form */}
            <form onSubmit={handleAddComment} className="flex gap-3">
              <img
                src={user?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=guest'}
                alt="Your avatar"
                className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200"
              />
              <div className="flex-1 space-y-2">
                <textarea
                  rows={2}
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder={user ? 'Add a thoughtful comment...' : 'Sign in to join the conversation...'}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all resize-none"
                  onFocus={() => {
                    if (!user) openAuthModal();
                  }}
                />
                {commentInput.trim() && (
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCommentInput('')}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPostingComment}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <span>Post Comment</span>
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </form>

            {/* Threaded Comments List */}
            <div className="space-y-5 divide-y divide-slate-100">
              {comments.map((comment) => (
                <div key={comment._id} className="pt-4 first:pt-0 space-y-3">
                  <div className="flex items-start gap-3">
                    <img
                      src={comment.author.avatar}
                      alt={comment.author.name}
                      className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs sm:text-sm text-slate-900">
                          {comment.author.name}
                        </span>
                        {comment.author.verified && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        )}
                        <span className="text-[11px] text-slate-400 font-medium">
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                      </div>

                      {editingCommentId === comment._id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            rows={2}
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-rose-500"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditingContent('');
                              }}
                              className="px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditComment(comment._id)}
                              className="px-3.5 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs sm:text-sm text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">
                          {comment.content}
                        </p>
                      )}

                      {/* Comment Actions (Like, Reply, Edit, Delete, Report) */}
                      <div className="flex items-center gap-4 mt-2">
                        <button
                          onClick={() => {
                            if (!user) return openAuthModal();
                            apiRequest(`/api/comments/${comment._id}/like`, { method: 'POST' })
                              .then(() => {
                                loadComments(videoId);
                              })
                              .catch((err: unknown) => {
                                toast.error('Failed to update comment like', err instanceof Error ? err.message : 'Please try again.');
                              });
                          }}
                          className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                            comment.isLiked ? 'text-rose-600 font-bold' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <ThumbsUp className={`w-3.5 h-3.5 ${comment.isLiked ? 'fill-current' : ''}`} />
                          <span>{comment.likesCount || 0}</span>
                        </button>

                        <button
                          onClick={() => setActiveReplyBoxId(activeReplyBoxId === comment._id ? null : comment._id)}
                          className="text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
                        >
                          Reply
                        </button>

                        {(user?._id === comment.userId || user?.role === 'admin') && (
                          <>
                            <button
                              onClick={() => {
                                setEditingCommentId(comment._id);
                                setEditingContent(comment.content);
                              }}
                              className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setCommentToDelete(comment._id)}
                              className="text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              Delete
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => {
                            setReportTargetType('comment');
                            setReportTargetId(comment._id);
                            setIsReportModalOpen(true);
                          }}
                          className="text-slate-300 hover:text-slate-500 transition-colors ml-auto"
                          title="Report comment"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Reply Input Box */}
                      {activeReplyBoxId === comment._id && (
                        <div className="mt-3 flex gap-2">
                          <input
                            type="text"
                            placeholder="Write a reply..."
                            value={replyInputMap[comment._id] || ''}
                            onChange={(e) =>
                              setReplyInputMap(prev => ({ ...prev, [comment._id]: e.target.value }))
                            }
                            className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-rose-500"
                          />
                          <button
                            onClick={() => handleAddReply(comment._id)}
                            className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700"
                          >
                            Reply
                          </button>
                        </div>
                      )}

                      {/* Replies List */}
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-3 pl-4 border-l-2 border-slate-100 space-y-3">
                          {comment.replies.map((reply) => (
                            <div key={reply._id} className="flex items-start gap-2.5">
                              <img
                                src={reply.author.avatar}
                                alt={reply.author.name}
                                className="w-7 h-7 rounded-full object-cover shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-slate-900">
                                    {reply.author.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {formatRelativeTime(reply.createdAt)}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
                                  {reply.content}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Up Next / Related Videos */}
        <div className="space-y-4">
          <h3 className="font-bold text-base text-slate-900">Related Videos</h3>
          <div className="space-y-3">
            {relatedVideos.map((rv) => (
              <VideoCard
                key={rv._id}
                video={rv}
                isCompact
                onSelectVideo={onSelectVideo}
                onSelectChannel={onSelectChannel}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Report Modal */}
      <Modal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        title="Report Content to Moderation"
      >
        <form onSubmit={handleSubmitReport} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Reason for Report
            </label>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500"
            >
              <option value="spam">Spam or misleading metadata</option>
              <option value="harassment">Harassment or hate speech</option>
              <option value="copyright">Copyright or IP infringement</option>
              <option value="inappropriate">Inappropriate or harmful content</option>
              <option value="other">Other policy violation</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Additional Details
            </label>
            <textarea
              rows={3}
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              placeholder="Please provide timestamp or specific context..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsReportModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingReport}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
            >
              {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Comment Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(commentToDelete)}
        onClose={() => setCommentToDelete(null)}
        onConfirm={handleConfirmDeleteComment}
        title="Delete Comment"
        message="Are you sure you want to delete this comment? This action cannot be undone."
        confirmText="Delete"
        isDestructive
      />
    </div>
  );
};
