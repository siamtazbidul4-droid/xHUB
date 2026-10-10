import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { db, createObjectId } from '../db.js';
import { requirePlatformAdmin, generateToken, AuthenticatedRequest } from '../auth.js';
import { getAdminEmail, getAdminPassword } from '../config/env.js';

const router = Router();

/**
 * Constant-time comparison that hashes both inputs to a fixed-length
 * digest first, so neither the length nor the content of the expected
 * secret leaks through timing differences.
 */
function timingSafeMatch(submitted: string, expected: string): boolean {
  const submittedDigest = crypto.createHash('sha256').update(submitted).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(submittedDigest, expectedDigest);
}

function sanitizeAdminUser(user: {
  _id: string;
  email: string;
  name: string;
  avatar: string;
  role: string;
  channelId?: string;
}) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    channelId: user.channelId,
    adminVerified: true
  };
}

// Admin Login — credentials are verified against server-side environment
// variables. The secret never leaves the server and is never returned.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      !email || !password ||
      typeof email !== 'string' || typeof password !== 'string'
    ) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const adminEmail = getAdminEmail();
    const adminPassword = getAdminPassword();

    if (!adminEmail || !adminPassword) {
      // Misconfiguration — reveal nothing about the expected credentials.
      return res.status(503).json({ error: 'Admin login is not configured on this server.' });
    }

    const emailMatch = timingSafeMatch(email.trim().toLowerCase(), adminEmail.toLowerCase());
    const passwordMatch = timingSafeMatch(password, adminPassword);

    if (!emailMatch || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Provision or reuse the administrator identity used for authorization.
    const normalizedEmail = adminEmail.toLowerCase();
    let adminUser = db.users.find(
      u => u.email.toLowerCase() === normalizedEmail && u.role === 'admin'
    );

    if (!adminUser) {
      const now = new Date().toISOString();
      const userId = createObjectId();
      const channelId = createObjectId();
      const passwordHash = await bcrypt.hash(adminPassword, 10);

      adminUser = {
        _id: userId,
        email: normalizedEmail,
        passwordHash,
        name: 'Platform Administrator',
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent('Platform Administrator')}&backgroundColor=e11d48`,
        role: 'admin' as const,
        status: 'active' as const,
        channelId,
        createdAt: now,
        updatedAt: now
      };
      db.users.push(adminUser);

      db.channels.push({
        _id: channelId,
        userId,
        name: 'Platform Administrator',
        handle: '@platform_administrator',
        avatar: adminUser.avatar,
        banner: '',
        description: 'Platform administration account.',
        subscriberCount: 0,
        videoCount: 0,
        totalViews: 0,
        verified: true,
        createdAt: now,
        updatedAt: now
      });

      db.save();
    }

    const channel = adminUser.channelId
      ? db.channels.find(c => c._id === adminUser!.channelId) || null
      : null;

    const token = generateToken(adminUser);

    return res.json({
      token,
      user: sanitizeAdminUser(adminUser),
      channel
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error during admin login. Please try again.' });
  }
});

// 1. Platform Analytics & Metrics
router.get('/metrics', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const totalUsers = db.users.length;
    const totalCreators = db.channels.length;
    const totalVideos = db.videos.length;
    const totalViews = db.videos.reduce((sum, v) => sum + (v.views || 0), 0);
    const totalLikes = db.likes.length;
    const totalComments = db.comments.length;
    const totalSubscriptions = db.subscriptions.length;
    const pendingReports = db.reports.filter(r => r.status === 'pending').length;

    // Storage calculation
    const totalBytes = db.videos.reduce((sum, v) => sum + (v.fileSize || 0), 0);

    // Recent 5 uploads
    const recentUploads = db.videos
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(v => {
        const ch = db.channels.find(c => c._id === v.channelId);
        return {
          _id: v._id,
          title: v.title,
          views: v.views,
          status: v.status,
          visibility: v.visibility,
          createdAt: v.createdAt,
          channelName: ch?.name || 'Unknown'
        };
      });

    return res.json({
      metrics: {
        totalUsers,
        totalCreators,
        totalVideos,
        totalViews,
        totalLikes,
        totalComments,
        totalSubscriptions,
        pendingReports,
        totalStorageMB: Math.round(totalBytes / (1024 * 1024))
      },
      recentUploads
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to compute admin metrics.' });
  }
});

// 2. Manage Users
router.get('/users', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
  const users = db.users.map(u => {
    const ch = u.channelId ? db.channels.find(c => c._id === u.channelId) : null;
    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status || 'active',
      avatar: u.avatar,
      createdAt: u.createdAt,
      channel: ch ? {
        _id: ch._id,
        name: ch.name,
        handle: ch.handle,
        videoCount: ch.videoCount,
        subscriberCount: ch.subscriberCount
      } : null
    };
  });

  return res.json({ users });
});

router.put('/users/:id/role', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
  const user = db.users.find(u => u._id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const { role } = req.body;
  if (!['user', 'creator', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  user.role = role;
  user.updatedAt = new Date().toISOString();
  db.save();

  return res.json({ message: 'User role updated.', user: { _id: user._id, role: user.role } });
});

router.put('/users/:id/status', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
  const user = db.users.find(u => u._id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be active or suspended.' });
  }

  user.status = status;
  user.updatedAt = new Date().toISOString();
  db.save();

  return res.json({ message: 'User status updated.', user: { _id: user._id, status: user.status } });
});

// 3. Manage All Videos (Admin View)
router.get('/videos', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
  const allVideos = db.videos
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(v => {
      const ch = db.channels.find(c => c._id === v.channelId);
      return {
        ...v,
        channel: ch ? {
          _id: ch._id,
          name: ch.name,
          handle: ch.handle
        } : null
      };
    });

  return res.json({ videos: allVideos });
});

router.put('/videos/:id', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
  const video = db.videos.find(v => v._id === req.params.id);
  if (!video) {
    return res.status(404).json({ error: 'Video not found.' });
  }

  const { featured, visibility, status } = req.body;
  if (featured !== undefined) video.featured = Boolean(featured);
  if (visibility && ['public', 'unlisted', 'private'].includes(visibility)) video.visibility = visibility;
  if (status && ['published', 'ready', 'unpublished', 'failed'].includes(status)) video.status = status;

  video.updatedAt = new Date().toISOString();
  db.save();

  return res.json({ video });
});

// 4. Moderation Reports Queue
router.get('/reports', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
  const reports = db.reports
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(r => {
      const reporter = db.users.find(u => u._id === r.reporterUserId);
      let targetInfo: any = null;

      if (r.targetType === 'video') {
        const video = db.videos.find(v => v._id === r.targetId);
        targetInfo = video ? { title: video.title, id: video._id } : { title: '[Deleted Video]', id: r.targetId };
      } else {
        const comment = db.comments.find(c => c._id === r.targetId);
        targetInfo = comment ? { content: comment.content, id: comment._id } : { content: '[Deleted Comment]', id: r.targetId };
      }

      return {
        ...r,
        reporterName: reporter?.name || 'Anonymous',
        targetInfo
      };
    });

  return res.json({ reports });
});

router.put('/reports/:id', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
  const report = db.reports.find(r => r._id === req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  const { status, action } = req.body;
  if (status && ['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
    report.status = status;
  }

  // If action is 'delete_target', perform automatic removal of reported target
  if (action === 'delete_target') {
    if (report.targetType === 'video') {
      const vIndex = db.videos.findIndex(v => v._id === report.targetId);
      if (vIndex !== -1) {
        db.videos.splice(vIndex, 1);
      }
    } else if (report.targetType === 'comment') {
      const cIndex = db.comments.findIndex(c => c._id === report.targetId);
      if (cIndex !== -1) {
        db.comments.splice(cIndex, 1);
      }
    }
    report.status = 'resolved';
  }

  report.updatedAt = new Date().toISOString();
  db.save();

  return res.json({ report });
});

export default router;
