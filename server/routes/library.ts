import { Router } from 'express';
import { db, createObjectId } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Helper to enrich video docs with channel info
function enrichVideo(videoId: string) {
  const v = db.videos.find(vid => vid._id === videoId);
  if (!v) return null;
  const ch = db.channels.find(c => c._id === v.channelId);
  return {
    ...v,
    channel: ch ? {
      _id: ch._id,
      name: ch.name,
      handle: ch.handle,
      avatar: ch.avatar,
      verified: ch.verified
    } : null
  };
}

// 1. Watch History: Get History
router.get('/history', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!._id;
    const historyEntries = db.history
      .filter(h => h.userId === userId)
      .sort((a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime());

    const result = historyEntries
      .map(entry => {
        const video = enrichVideo(entry.videoId);
        if (!video) return null;
        return {
          ...entry,
          video
        };
      })
      .filter(Boolean);

    return res.json({ history: result });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch watch history.' });
  }
});

// Watch History: Save / Update Progress
// Server-side eligibility: a NEW history entry is only created when the client
// reports progress of at least MIN_HISTORY_SECONDS (3 seconds). This mirrors
// the client-side 3000ms accumulated-playback threshold in VideoPlayer/WatchPage
// (client uses milliseconds, server seconds — same 3-second rule, documented conversion).
const MIN_HISTORY_SECONDS = 3;
router.post('/history', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!._id;
    const { videoId, progressSeconds = 0, completed = false } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required.' });
    }

    const progress = Number(progressSeconds);
    if (!Number.isFinite(progress) || progress < 0) {
      return res.status(400).json({ error: 'progressSeconds must be a non-negative number.' });
    }

    const existingIndex = db.history.findIndex(h => h.userId === userId && h.videoId === videoId);
    const now = new Date().toISOString();

    if (existingIndex === -1 && progress < MIN_HISTORY_SECONDS) {
      // Below-threshold watch: do not create a new watch-history entry.
      return res.status(400).json({ error: `Watch history requires at least ${MIN_HISTORY_SECONDS} seconds of playback.` });
    }

    if (existingIndex !== -1) {
      db.history[existingIndex].watchedAt = now;
      db.history[existingIndex].progressSeconds = Number(progressSeconds);
      db.history[existingIndex].completed = Boolean(completed);
    } else {
      db.history.push({
        _id: createObjectId(),
        userId,
        videoId,
        watchedAt: now,
        progressSeconds: Number(progressSeconds),
        completed: Boolean(completed)
      });
    }

    db.save();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to record history.' });
  }
});

// Watch History: Remove Single or Clear All
router.delete('/history/:videoId', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!._id;
  const { videoId } = req.params;

  if (videoId === 'clear-all') {
    db.history = db.history.filter(h => h.userId !== userId) as any;
  } else {
    db.history = db.history.filter(h => !(h.userId === userId && h.videoId === videoId)) as any;
  }

  db.save();
  return res.json({ message: 'History updated.' });
});

// 2. Liked Videos
router.get('/liked', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!._id;
    const likedTargetIds = db.likes
      .filter(l => l.userId === userId && l.targetType === 'video')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(l => l.targetId);

    const videos = likedTargetIds
      .map(id => enrichVideo(id))
      .filter(Boolean);

    return res.json({ videos });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch liked videos.' });
  }
});

// 3. Watch Later: Get List
router.get('/watch-later', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!._id;
    const items = db.watchLater
      .filter(w => w.userId === userId)
      .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
      .map(w => {
        const video = enrichVideo(w.videoId);
        return video ? { ...w, video } : null;
      })
      .filter(Boolean);

    return res.json({ items });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch Watch Later list.' });
  }
});

// Watch Later: Toggle
router.post('/watch-later/:videoId', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!._id;
    const { videoId } = req.params;

    const existingIndex = db.watchLater.findIndex(w => w.userId === userId && w.videoId === videoId);
    let isSaved = false;

    if (existingIndex !== -1) {
      db.watchLater.splice(existingIndex, 1);
      isSaved = false;
    } else {
      db.watchLater.push({
        _id: createObjectId(),
        userId,
        videoId,
        addedAt: new Date().toISOString()
      });
      isSaved = true;
    }

    db.save();
    return res.json({ isSaved });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update Watch Later.' });
  }
});

// 4. Subscriptions Feed
router.get('/subscriptions', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!._id;
    const subscribedChannelIds = db.subscriptions
      .filter(s => s.userId === userId)
      .map(s => s.channelId);

    const subscribedChannels = db.channels.filter(c => subscribedChannelIds.includes(c._id));

    const videos = db.videos
      .filter(v => subscribedChannelIds.includes(v.channelId) && (v.status === 'published' || v.status === 'ready') && v.visibility === 'public')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(v => enrichVideo(v._id))
      .filter(Boolean);

    return res.json({
      channels: subscribedChannels,
      videos
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch subscriptions feed.' });
  }
});

// 5. Creator Studio: My Uploaded Videos
router.get('/my-videos', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!._id;
    const myVideos = db.videos
      .filter(v => v.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const enriched = myVideos.map(v => enrichVideo(v._id)).filter(Boolean);

    return res.json({ videos: enriched });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch uploaded videos.' });
  }
});

export default router;
