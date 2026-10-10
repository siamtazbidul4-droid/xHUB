import { Router } from 'express';
import { db, createObjectId } from '../db.js';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../auth.js';

const router = Router();

// 1. Get Channel Details & Videos
router.get('/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const channel = db.channels.find(c => c._id === req.params.id || c.handle.toLowerCase() === req.params.id.toLowerCase());
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found.' });
    }

    const channelVideos = db.videos
      .filter(v => v.channelId === channel._id && (v.status === 'published' || v.status === 'ready') && v.visibility === 'public')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    let isSubscribed = false;
    if (req.user) {
      isSubscribed = db.subscriptions.some(s => s.userId === req.user!._id && s.channelId === channel._id);
    }

    return res.json({
      channel: {
        ...channel,
        isSubscribed
      },
      videos: channelVideos
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load channel.' });
  }
});

// 2. Toggle Subscribe / Unsubscribe
router.post('/:id/subscribe', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const channel = db.channels.find(c => c._id === req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found.' });
    }

    const userId = req.user!._id;

    if (channel.userId === userId) {
      return res.status(400).json({ error: 'You cannot subscribe to your own channel.' });
    }

    const existingIndex = db.subscriptions.findIndex(s => s.userId === userId && s.channelId === channel._id);
    let isSubscribed = false;

    if (existingIndex !== -1) {
      // Unsubscribe
      db.subscriptions.splice(existingIndex, 1);
      channel.subscriberCount = Math.max(0, channel.subscriberCount - 1);
      isSubscribed = false;
    } else {
      // Subscribe
      db.subscriptions.push({
        _id: createObjectId(),
        userId,
        channelId: channel._id,
        createdAt: new Date().toISOString()
      });
      channel.subscriberCount += 1;
      isSubscribed = true;

      // Notify channel owner
      db.notifications.push({
        _id: createObjectId(),
        userId: channel.userId,
        type: 'subscriber',
        title: 'New Subscriber',
        message: `${req.user!.name} subscribed to your channel!`,
        link: `/channel/${channel._id}`,
        read: false,
        createdAt: new Date().toISOString()
      });
    }

    db.save();

    return res.json({
      isSubscribed,
      subscriberCount: channel.subscriberCount
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle subscription.' });
  }
});

// 3. Search / Discover Creators
router.get('/', (req, res) => {
  const q = (req.query.search as string || '').trim().toLowerCase();
  let creators = db.channels.slice();

  if (q) {
    creators = creators.filter(c => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }

  creators.sort((a, b) => b.subscriberCount - a.subscriberCount);
  return res.json({ channels: creators.slice(0, 20) });
});

export default router;
