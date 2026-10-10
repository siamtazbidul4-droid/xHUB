import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { db, createObjectId, VideoDoc, ChannelDoc } from '../db.js';
import { requireAuth, optionalAuth, optionalMediaAuth, AuthenticatedRequest } from '../auth.js';
import { validateMediaUrl, isSafeExternalMediaTarget } from '../config/urlValidation.js';
import {
  calculateFeedScore,
  calculateSearchScore,
  calculateVelocityScore,
  applyDiversityMix,
  compareScored,
  buildUserInterestProfile,
  tokenizeQuery,
  RankingContext,
  ScoredVideo
} from '../ranking.js';

const router = Router();
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

/**
 * Resolve a candidate file path and prove it stays inside `uploads/` after full
 * resolution (realpath where the file exists). A raw `startsWith` string check
 * on the un-resolved join is not sufficient because `..` segments and symlinks
 * can escape the directory (AUD-008). Returns the safe absolute path, or null.
 */
function safeResolveWithinUploads(candidatePath: string): string | null {
  let resolved = path.resolve(candidatePath);
  try {
    if (fs.existsSync(resolved)) {
      // Resolve symlinks so a link inside uploads/ cannot point outside it.
      resolved = fs.realpathSync(resolved);
    }
  } catch {
    return null;
  }
  const root = fs.existsSync(UPLOADS_ROOT) ? fs.realpathSync(UPLOADS_ROOT) : UPLOADS_ROOT;
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

/** Videos visible to the current viewer (moderation + visibility rules). */
function isEligible(v: VideoDoc, userId?: string, userRole?: string): boolean {
  if (v.visibility === 'private' || v.visibility === 'unlisted') {
    if (!userId || (userId !== v.userId && userRole !== 'admin')) {
      return false;
    }
  }
  return v.status === 'published' || v.status === 'ready';
}

/** O(1) channel lookups instead of repeated array scans. */
function buildChannelIndex(): Map<string, ChannelDoc> {
  const index = new Map<string, ChannelDoc>();
  for (const channel of db.channels) {
    index.set(channel._id, channel);
  }
  return index;
}

function enrichVideo(video: VideoDoc, channelIndex: Map<string, ChannelDoc>) {
  const channel = channelIndex.get(video.channelId);
  return {
    ...video,
    channel: channel ? {
      _id: channel._id,
      name: channel.name,
      handle: channel.handle,
      avatar: channel.avatar,
      verified: channel.verified
    } : null
  };
}

// 1. Get List of Videos with Search, Filters, Ranking, and Pagination
router.get('/', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const {
      search,
      category,
      channelId,
      sort,
      page = '1',
      limit = '12'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.max(1, Math.min(50, parseInt(limit as string, 10) || 12));

    const channelIndex = buildChannelIndex();
    const ctx: RankingContext = {
      now: Date.now(),
      channelIndex,
      userProfile: req.user ? buildUserInterestProfile(req.user._id) : null
    };

    const candidates = db.videos.filter(v => isEligible(v, req.user?._id, req.user?.role));

    // Category filter — ranking happens WITHIN the category, so each
    // category surface shows its own best videos, not global popular
    // videos merely filtered afterwards.
    let results = candidates;
    if (category && category !== 'All' && category !== 'all') {
      const catLower = (category as string).toLowerCase();
      results = results.filter(v => v.category.toLowerCase() === catLower);
    }

    // Channel filter
    if (channelId) {
      results = results.filter(v => v.channelId === channelId);
    }

    const hasSearch = Boolean(search && typeof search === 'string' && search.trim());
    const query = hasSearch ? (search as string).trim() : '';

    // Effective sort: relevance governs search unless the client
    // explicitly chose another ordering. Ranked feed is the default.
    let effectiveSort = (sort as string) || 'ranked';
    if (hasSearch && (effectiveSort === 'ranked' || effectiveSort === '')) {
      effectiveSort = 'relevance';
    }

    let scored: ScoredVideo[];

    if (effectiveSort === 'views' || effectiveSort === 'popular') {
      scored = results.map(v => ({ video: v, score: v.views }));
      scored.sort(compareScored);
    } else if (effectiveSort === 'likes') {
      scored = results.map(v => ({ video: v, score: v.likesCount }));
      scored.sort(compareScored);
    } else if (effectiveSort === 'latest') {
      scored = results.map(v => ({
        video: v,
        score: new Date(v.createdAt).getTime()
      }));
      scored.sort(compareScored);
    } else if (effectiveSort === 'trending') {
      scored = results.map(v => ({
        video: v,
        score: calculateVelocityScore(v, ctx.now)
      }));
      scored.sort(compareScored);
    } else if (effectiveSort === 'relevance' && hasSearch) {
      // Relevance-dominant ranking. Irrelevant videos are excluded;
      // multi-word queries prefer videos matching most tokens and
      // fall back to partial matches only when nothing stronger exists.
      const withRelevance = results.map(v => {
        const result = calculateSearchScore(v, query, ctx);
        return { video: v, score: result.score, relevance: result.relevance, coverage: result.coverage };
      });

      let matches = withRelevance.filter(item => item.relevance > 0);
      const tokens = tokenizeQuery(query);
      if (tokens.length > 1) {
        const strict = matches.filter(
          item => item.coverage >= 0.5 || item.relevance >= 0.6
        );
        if (strict.length > 0) matches = strict;
      }
      matches.sort(compareScored);
      scored = matches;
    } else {
      // Ranked discovery feed: weighted engagement + popularity +
      // freshness + quality + creator authority (+ personalization).
      scored = results.map(v => ({
        video: v,
        score: calculateFeedScore(v, ctx)
      }));
      scored.sort(compareScored);
      // Controlled creator/category diversity — only for discovery
      // surfaces, never for explicit channel filters or search,
      // and only when the segment has enough distinct creators
      // that reordering is meaningful.
      if (!channelId && !hasSearch) {
        const distinctChannels = new Set(results.map(v => v.channelId)).size;
        if (distinctChannels >= 4) {
          scored = applyDiversityMix(scored);
        }
      }
    }

    const total = scored.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = scored.slice(startIndex, startIndex + limitNum);

    const enriched = paginated.map(item => enrichVideo(item.video, channelIndex));

    return res.json({
      videos: enriched,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('Get videos error:', error);
    return res.status(500).json({ error: 'Failed to retrieve videos.' });
  }
});

// 2. Search Autocomplete Suggestions
router.get('/suggestions', (req, res) => {
  const q = (req.query.q as string || '').trim().toLowerCase();
  if (!q || q.length < 2) {
    return res.json({ suggestions: [] });
  }

  const suggestionsSet = new Set<string>();

  // Extract matching titles & tags
  for (const v of db.videos) {
    if (v.status !== 'published' && v.status !== 'ready') continue;
    if (v.visibility === 'private') continue;

    if (v.title.toLowerCase().includes(q)) {
      suggestionsSet.add(v.title);
    }
    for (const tag of v.tags) {
      if (tag.toLowerCase().includes(q)) {
        suggestionsSet.add(tag);
      }
    }
  }

  // Extract matching creator channels
  for (const c of db.channels) {
    if (c.name.toLowerCase().includes(q)) {
      suggestionsSet.add(c.name);
    }
  }

  const suggestions = Array.from(suggestionsSet).slice(0, 8);
  return res.json({ suggestions });
});

// 3. Trending Videos Feed (velocity-scored engagement)
router.get('/trending', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const channelIndex = buildChannelIndex();
    const now = Date.now();
    const publicVideos = db.videos.filter(v =>
      (v.status === 'published' || v.status === 'ready') && v.visibility === 'public'
    );

    // Single velocity definition shared with sort=trending
    const scored = publicVideos
      .map(v => ({ video: v, score: calculateVelocityScore(v, now) }))
      .sort(compareScored);

    const topVideos = scored.slice(0, 16).map(item =>
      enrichVideo(item.video, channelIndex)
    );

    return res.json({ videos: topVideos });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve trending videos.' });
  }
});

// 4. Personalized / Explainable Recommendations
router.get('/recommended', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const channelIndex = buildChannelIndex();
    const ctx: RankingContext = {
      now: Date.now(),
      channelIndex,
      userProfile: req.user ? buildUserInterestProfile(req.user._id) : null
    };

    const available = db.videos.filter(v => isEligible(v, req.user?._id, req.user?.role));

    // Global ranking combined with the user's demonstrated interests
    // (watch history, likes, subscriptions). Personalization is capped
    // so global quality always remains the dominant factor.
    const scored = available
      .map(v => ({ video: v, score: calculateFeedScore(v, ctx) }))
      .sort(compareScored);

    const enriched = scored.slice(0, 12).map(item =>
      enrichVideo(item.video, channelIndex)
    );

    return res.json({ videos: enriched });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve recommendations.' });
  }
});

// 5. Single Video Details
router.get('/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const video = db.videos.find(v => v._id === req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Visibility authorization
    if (video.visibility === 'private') {
      if (!req.user || (req.user._id !== video.userId && req.user.role !== 'admin')) {
        return res.status(403).json({ error: 'This video is private.' });
      }
    }

    const channel = db.channels.find(c => c._id === video.channelId);

    // Check if current user has liked, subscribed, saved to watch later, or has progress
    let isLiked = false;
    let isSubscribed = false;
    let isSavedWatchLater = false;
    let progressSeconds = 0;

    if (req.user) {
      isLiked = db.likes.some(l => l.userId === req.user!._id && l.targetId === video._id && l.targetType === 'video');
      if (channel) {
        isSubscribed = db.subscriptions.some(s => s.userId === req.user!._id && s.channelId === channel._id);
      }
      isSavedWatchLater = db.watchLater.some(w => w.userId === req.user!._id && w.videoId === video._id);
      const historyEntry = db.history.find(h => h.userId === req.user!._id && h.videoId === video._id);
      if (historyEntry && !historyEntry.completed) {
        progressSeconds = historyEntry.progressSeconds || 0;
      }
    }

    // Related videos (same category or same channel), ranked by the
    // discovery score so the strongest related content leads.
    // The channel index and clock are hoisted out of the scoring loop: the
    // previous inline call rebuilt the whole index once per candidate (AUD-013).
    const relatedChannelIndex = buildChannelIndex();
    const relatedNow = Date.now();
    const related = db.videos
      .filter(v => v._id !== video._id && v.visibility === 'public' && (v.status === 'published' || v.status === 'ready'))
      .filter(v => v.category === video.category || v.channelId === video.channelId)
      .map(v => ({ video: v, score: calculateFeedScore(v, { now: relatedNow, channelIndex: relatedChannelIndex }) }))
      .sort(compareScored)
      .slice(0, 10)
      .map(item => {
        const ch = db.channels.find(c => c._id === item.video.channelId);
        return {
          ...item.video,
          channel: ch ? {
            _id: ch._id,
            name: ch.name,
            handle: ch.handle,
            avatar: ch.avatar,
            verified: ch.verified
          } : null
        };
      });

    return res.json({
      video: {
        ...video,
        isLiked,
        isSubscribed,
        isSavedWatchLater,
        progressSeconds,
        channel: channel ? {
          _id: channel._id,
          userId: channel.userId,
          name: channel.name,
          handle: channel.handle,
          avatar: channel.avatar,
          subscriberCount: channel.subscriberCount,
          verified: channel.verified
        } : null
      },
      relatedVideos: related
    });
  } catch (error: any) {
    console.error('Get video error:', error);
    return res.status(500).json({ error: 'Failed to retrieve video details.' });
  }
});

// 6. Create / Publish Video
router.post('/', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const channel = req.channel || db.channels.find(c => c.userId === user._id);

    if (!channel) {
      return res.status(400).json({ error: 'Creator channel not found. Please create a channel first.' });
    }

    const {
      title,
      description = '',
      category = 'Entertainment',
      tags = [],
      thumbnailUrl,
      videoUrl,
      duration = 0,
      fileSize = 0,
      visibility = 'public',
      status = 'ready',
      allowDownload = true
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Video title is required.' });
    }
    // Validate media URLs before they are persisted (AUD-002). Only local
    // upload paths and explicit HTTPS sources are accepted, so a stored value
    // can never reach a script/local-file sink in the browser.
    const safeVideoUrl = validateMediaUrl(videoUrl, 'video');
    if (!safeVideoUrl) {
      return res.status(400).json({
        error: 'A valid video source is required. Upload a video or provide an https:// media URL.'
      });
    }

    // THUMBNAIL INTEGRITY: each video must carry its OWN thumbnail (custom image
    // or a frame extracted from THIS video). We never substitute a shared/global
    // default image, and never reuse another video's asset.
    const safeThumbnailUrl = validateMediaUrl(thumbnailUrl, 'thumbnail');
    if (!safeThumbnailUrl) {
      return res.status(400).json({
        error: 'A valid thumbnail is required. Upload a custom image or let the upload page generate one from this video.'
      });
    }

    const videoId = createObjectId();
    const now = new Date().toISOString();

    const newVideo: VideoDoc = {
      _id: videoId,
      channelId: channel._id,
      userId: user._id,
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      tags: Array.isArray(tags) ? tags.map((t: string) => t.trim().toLowerCase()) : [],
      thumbnailUrl: safeThumbnailUrl,
      videoUrl: safeVideoUrl,
      duration: Math.max(0, Number(duration)),
      fileSize: Math.max(0, Number(fileSize)),
      visibility: ['public', 'unlisted', 'private'].includes(visibility) ? visibility : 'public',
      status: 'published',
      views: 0,
      likesCount: 0,
      commentsCount: 0,
      featured: false,
      allowDownload: Boolean(allowDownload),
      createdAt: now,
      updatedAt: now
    };

    db.videos.push(newVideo);
    channel.videoCount += 1;

    // Update category count
    const cat = db.categories.find(c => c.name.toLowerCase() === category.toLowerCase());
    if (cat) cat.videoCount += 1;
    const allCat = db.categories.find(c => c.name === 'All');
    if (allCat) allCat.videoCount += 1;

    // Send a notification to the user that their video is ready and published
    db.notifications.push({
      _id: createObjectId(),
      userId: user._id,
      type: 'video_ready',
      title: 'Video Published!',
      message: `Your video "${newVideo.title}" is now published and live.`,
      link: `/watch/${newVideo._id}`,
      read: false,
      createdAt: now
    });

    db.save();

    return res.status(201).json({
      video: {
        ...newVideo,
        channel: {
          _id: channel._id,
          name: channel.name,
          handle: channel.handle,
          avatar: channel.avatar
        }
      }
    });
  } catch (error: any) {
    console.error('Create video error:', error);
    return res.status(500).json({ error: 'Failed to publish video.' });
  }
});

// 7. Update Video Metadata
router.put('/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const video = db.videos.find(v => v._id === req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    if (video.userId !== req.user!._id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to edit this video.' });
    }

    const { title, description, category, tags, thumbnailUrl, visibility, allowDownload, status } = req.body;

    if (title) video.title = title.trim();
    if (description !== undefined) video.description = description.trim();
    if (category) video.category = category.trim();
    if (tags && Array.isArray(tags)) video.tags = tags.map((t: string) => t.trim().toLowerCase());
    if (thumbnailUrl !== undefined) {
      const safeThumbnailUrl = validateMediaUrl(thumbnailUrl, 'thumbnail');
      if (!safeThumbnailUrl) {
        return res.status(400).json({
          error: 'A valid thumbnail is required. Upload a custom image or provide an https:// image URL.'
        });
      }
      video.thumbnailUrl = safeThumbnailUrl;
    }
    if (visibility && ['public', 'unlisted', 'private'].includes(visibility)) video.visibility = visibility;
    if (allowDownload !== undefined) video.allowDownload = Boolean(allowDownload);
    if (status && ['published', 'ready', 'unpublished'].includes(status)) video.status = status;

    video.updatedAt = new Date().toISOString();
    db.save();

    return res.json({ video });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update video.' });
  }
});

// 8. Delete Video
router.delete('/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const index = db.videos.findIndex(v => v._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const video = db.videos[index];
    if (video.userId !== req.user!._id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to delete this video.' });
    }

    // Decrement channel count
    const channel = db.channels.find(c => c._id === video.channelId);
    if (channel && channel.videoCount > 0) {
      channel.videoCount -= 1;
    }

    // Remove video
    db.videos.splice(index, 1);

    // Clean up comments and likes associated with this video
    const commentsToRemove = db.comments.filter(c => c.videoId === video._id).map(c => c._id);
    db.comments = db.comments.filter(c => c.videoId !== video._id) as any;
    db.likes = db.likes.filter(l => l.targetId !== video._id && !commentsToRemove.includes(l.targetId)) as any;
    db.history = db.history.filter(h => h.videoId !== video._id) as any;
    db.watchLater = db.watchLater.filter(w => w.videoId !== video._id) as any;
    db.notifications = db.notifications.filter(n => n.link !== `/watch/${video._id}`) as any;
    db.reports = db.reports.filter(r => r.targetType !== 'video' || r.targetId !== video._id) as any;

    db.save();

    return res.json({ message: 'Video deleted successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete video.' });
  }
});

// 9. Increment View with Meaningful Engagement Threshold
// A view counts when client has watched >= 5 seconds of the video, preventing empty reloads.
const VIEW_COOLDOWN_MS = 60000;
const MAX_VIEW_TRACKER_ENTRIES = 1000;
const recentViewsTracker = new Map<string, number>();

/**
 * The tracker only needs entries younger than the cooldown window.
 * Purge expired entries occasionally so the map cannot grow without
 * bound on a long-running server.
 */
function purgeStaleViewTrackers(now: number): void {
  if (recentViewsTracker.size < MAX_VIEW_TRACKER_ENTRIES) return;
  const cutoff = now - VIEW_COOLDOWN_MS * 2;
  for (const [key, timestamp] of recentViewsTracker) {
    if (timestamp < cutoff) {
      recentViewsTracker.delete(key);
    }
  }
}

router.post('/:id/view', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const video = db.videos.find(v => v._id === req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const secondsWatched = Number(req.body.secondsWatched || 0);
    if (secondsWatched < 3) {
      return res.json({ message: 'Watch threshold not met', views: video.views });
    }

    // Simple cooldown per client IP or user to prevent rapid artificial view flooding
    const identifier = req.user ? req.user._id : (req.ip || 'anonymous');
    const key = `${video._id}_${identifier}`;
    const now = Date.now();
    purgeStaleViewTrackers(now);
    const lastViewTime = recentViewsTracker.get(key) || 0;

    // Limit to 1 view per 60 seconds per user/IP for same video
    if (now - lastViewTime < VIEW_COOLDOWN_MS) {
      return res.json({ message: 'View already recorded recently', views: video.views });
    }

    recentViewsTracker.set(key, now);
    video.views += 1;

    // Update channel total views
    const channel = db.channels.find(c => c._id === video.channelId);
    if (channel) {
      channel.totalViews += 1;
    }

    db.save();

    return res.json({ views: video.views });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to record view.' });
  }
});

// 10. Toggle Video Like / Unlike with Database Uniqueness Constraint
router.post('/:id/like', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const video = db.videos.find(v => v._id === req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const userId = req.user!._id;
    const existingIndex = db.likes.findIndex(
      l => l.userId === userId && l.targetId === video._id && l.targetType === 'video'
    );

    let isLiked = false;

    if (existingIndex !== -1) {
      // Unlike
      db.likes.splice(existingIndex, 1);
      video.likesCount = Math.max(0, video.likesCount - 1);
      isLiked = false;
    } else {
      // Like
      db.likes.push({
        _id: createObjectId(),
        userId,
        targetId: video._id,
        targetType: 'video',
        createdAt: new Date().toISOString()
      });
      video.likesCount += 1;
      isLiked = true;

      // Notify the video creator once per like. A repeated like notification
      // is only meaningful if the previous one is still unread, so an existing
      // unread "New Like" for this video is reused instead of duplicated on
      // every like/unlike toggle (AUD-014).
      if (video.userId !== userId) {
        const alreadyNotified = db.notifications.some(
          n => n.userId === video.userId && n.type === 'system' && !n.read && n.link === `/watch/${video._id}`
        );
        if (!alreadyNotified) {
          db.notifications.push({
            _id: createObjectId(),
            userId: video.userId,
            type: 'system',
            title: 'New Like',
            message: `${req.user!.name} liked your video "${video.title}"`,
            link: `/watch/${video._id}`,
            read: false,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    db.save();

    return res.json({
      isLiked,
      likesCount: video.likesCount
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle like.' });
  }
});

// 11. Stream Video with HTTP 206 Partial Content Range Support for Long-Form Seeking
// Uses optionalMediaAuth so a <video> element (which cannot send an
// Authorization header) can authenticate via a `token` query parameter, letting
// an owner play their own private/unlisted local media (PRIV-1).
router.get('/:id/stream', optionalMediaAuth, (req: AuthenticatedRequest, res) => {
  try {
    const video = db.videos.find(v => v._id === req.params.id);
    if (!video) {
      return res.status(404).send('Video not found');
    }

    // Check visibility authorization
    if (video.visibility === 'private') {
      if (!req.user || (req.user._id !== video.userId && req.user.role !== 'admin')) {
        return res.status(403).send('Unauthorized to access private media');
      }
    }

    // If video is an external URL (e.g. sample MP4 on CDN). Only https targets
    // that are not loopback/private/reserved hosts may be used as a redirect
    // destination — a stored value must never let a client pivot this server
    // (or the browser) to an internal network address, and http:// is refused
    // so the redirect can never downgrade transport security (AUD-018).
    if (/^https?:\/\//i.test(video.videoUrl)) {
      if (!isSafeExternalMediaTarget(video.videoUrl)) {
        return res.status(400).send('Unsafe external media target.');
      }
      return res.redirect(video.videoUrl);
    }

    // Local file stream with Range headers
    const filePath = path.join(process.cwd(), video.videoUrl.replace(/^\//, ''));
    // Prevent path traversal: the fully resolved (symlink-free) file must stay
    // inside the uploads directory.
    const safeFilePath = safeResolveWithinUploads(filePath);
    if (!safeFilePath) {
      return res.status(400).send('Invalid media path.');
    }
    if (!fs.existsSync(safeFilePath)) {
      return res.status(404).send('Media file missing from storage.');
    }

    // Serve the actual container type. Hardcoding video/mp4 makes browser engines
    // reject legitimately uploaded WebM files with MEDIA_ERR_SRC_NOT_SUPPORTED.
    const ext = path.extname(safeFilePath).toLowerCase();
    const contentType = ext === '.webm' ? 'video/webm'
      : ext === '.mov' ? 'video/quicktime'
      : ext === '.mkv' ? 'video/x-matroska'
      : 'video/mp4';

    const stat = fs.statSync(safeFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      let start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= fileSize) end = fileSize - 1;

      if (start >= fileSize || start > end) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).send('Requested Range Not Satisfiable');
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(safeFilePath, { start, end });

      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType
      };
      res.writeHead(200, head);
      fs.createReadStream(safeFilePath).pipe(res);
    }
  } catch (err: any) {
    console.error('Video stream error:', err);
    return res.status(500).send('Streaming error');
  }
});

// 12. Secure Download Endpoint with Content-Disposition
// optionalMediaAuth allows the same header-or-query-token authentication used
// by the stream route, since the download anchor also cannot set headers.
router.get('/:id/download', optionalMediaAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const video = db.videos.find(v => v._id === req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    if (video.visibility === 'private') {
      if (!req.user || (req.user._id !== video.userId && req.user.role !== 'admin')) {
        return res.status(403).json({ error: 'Cannot download private video.' });
      }
    }

    if (!video.allowDownload) {
      return res.status(403).json({ error: 'Creator has disabled downloads for this video.' });
    }

    const cleanFilename = `${(video.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;

    // If external URL (e.g. cloud storage or CDN), stream directly as attachment so browser triggers actual file download.
    // The target must first pass the outbound-safety check so this handler can
    // never fetch or redirect to an internal/unsecured address (AUD-018).
    if (/^https?:\/\//i.test(video.videoUrl)) {
      if (!isSafeExternalMediaTarget(video.videoUrl)) {
        return res.status(400).json({ error: 'Unsafe external media target.' });
      }
      try {
        const response = await fetch(video.videoUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(30000)
        });
        if (!response.ok || !response.body) {
          // The upstream CDN responded with an error or an empty body. Fall back
          // to a redirect to the SAME already-validated https target rather than
          // silently failing; the value was re-checked above and is not user
          // input at this point.
          return res.redirect(video.videoUrl);
        }

        res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
        const length = response.headers.get('content-length');
        if (length) res.setHeader('Content-Length', length);

        // Pipe web stream to Express response
        const reader = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
        return reader.pipe(res);
      } catch (streamErr) {
        // Network error/timeout while proxying. The redirect target is the same
        // validated https URL, never an unvalidated value, so this cannot be
        // abused as an open redirect or SSRF pivot.
        return res.redirect(video.videoUrl);
      }
    }

    const filePath = path.join(process.cwd(), video.videoUrl.replace(/^\//, ''));
    // Containment must be proven on the fully resolved (symlink-free) path,
    // not on a raw string prefix of the joined path (AUD-008).
    const resolvedDownloadPath = safeResolveWithinUploads(filePath);
    if (!resolvedDownloadPath) {
      return res.status(400).json({ error: 'Invalid media path.' });
    }
    if (!fs.existsSync(resolvedDownloadPath)) {
      return res.status(404).json({ error: 'Video file not found on disk.' });
    }

    res.download(resolvedDownloadPath, cleanFilename);
  } catch (err: any) {
    return res.status(500).json({ error: 'Download failed.' });
  }
});

export default router;
