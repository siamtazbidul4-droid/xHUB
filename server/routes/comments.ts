import { Router } from 'express';
import { db, createObjectId, CommentDoc } from '../db.js';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../auth.js';
import { removedCommentCount, decrementCount } from '../utils/commentCounts.js';

const router = Router();

// 1. Get Comments for a Video
router.get('/video/:videoId', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { videoId } = req.params;

    // Visibility authorization: private video comment threads must not
    // leak to anonymous viewers or non-owners (matches GET /api/videos/:id).
    const video = db.videos.find(v => v._id === videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }
    if (video.visibility === 'private') {
      if (!req.user || (req.user._id !== video.userId && req.user.role !== 'admin')) {
        return res.status(403).json({ error: 'This video is private.' });
      }
    }

    const allComments = db.comments.filter(c => c.videoId === videoId);

    // Split top-level and replies
    const topLevel = allComments.filter(c => !c.parentId);
    const replies = allComments.filter(c => !!c.parentId);

    const enrichComment = (c: CommentDoc) => {
      const user = db.users.find(u => u._id === c.userId);
      const channel = db.channels.find(ch => ch._id === c.channelId);
      const isLiked = req.user
        ? db.likes.some(l => l.userId === req.user!._id && l.targetId === c._id && l.targetType === 'comment')
        : false;

      return {
        ...c,
        author: {
          name: channel?.name || user?.name || 'Anonymous',
          handle: channel?.handle || '@user',
          avatar: channel?.avatar || user?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=user',
          verified: channel?.verified || false
        },
        isLiked
      };
    };

    const tree = topLevel.map(parent => {
      const parentReplies = replies
        .filter(r => r.parentId === parent._id)
        .map(enrichComment);

      return {
        ...enrichComment(parent),
        replies: parentReplies
      };
    });

    // Sort by latest or top
    tree.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ comments: tree, total: allComments.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load comments.' });
  }
});

// 2. Add Comment or Reply
router.post('/video/:videoId', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { videoId } = req.params;
    const { content, parentId = null } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content cannot be empty.' });
    }

    const video = db.videos.find(v => v._id === videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Visibility authorization: only the owner (or an admin) may comment
    // on a private video.
    if (video.visibility === 'private') {
      if (!req.user || (req.user._id !== video.userId && req.user.role !== 'admin')) {
        return res.status(403).json({ error: 'This video is private.' });
      }
    }

    // Reply parents must exist, belong to this video, and be top-level
    // comments. Anything else would create an orphaned reply that the
    // comment tree can never render while still inflating counts.
    let parentComment: CommentDoc | null = null;
    if (parentId) {
      parentComment = db.comments.find(c => c._id === parentId) || null;
      if (!parentComment) {
        return res.status(404).json({ error: 'Parent comment not found.' });
      }
      if (parentComment.videoId !== video._id) {
        return res.status(400).json({ error: 'Parent comment does not belong to this video.' });
      }
      if (parentComment.parentId) {
        return res.status(400).json({ error: 'Replies can only be posted to top-level comments.' });
      }
    }

    const user = req.user!;
    const channelId = user.channelId || user._id;
    const cleanContent = content.trim();
    const now = new Date().toISOString();

    const newComment: CommentDoc = {
      _id: createObjectId(),
      videoId,
      userId: user._id,
      channelId,
      content: cleanContent,
      parentId: parentId || null,
      likesCount: 0,
      replyCount: 0,
      createdAt: now,
      updatedAt: now
    };

    db.comments.push(newComment);
    video.commentsCount += 1;

    // If reply, increment parent's replyCount and notify parent comment author
    if (parentComment) {
      parentComment.replyCount += 1;
      if (parentComment.userId !== user._id) {
        db.notifications.push({
          _id: createObjectId(),
          userId: parentComment.userId,
          type: 'comment',
          title: 'New Reply',
          message: `${user.name} replied to your comment on "${video.title}"`,
          link: `/watch/${video._id}`,
          read: false,
          createdAt: now
        });
      }
    } else {
      // Top level comment: notify video creator
      if (video.userId !== user._id) {
        db.notifications.push({
          _id: createObjectId(),
          userId: video.userId,
          type: 'comment',
          title: 'New Comment',
          message: `${user.name} commented on your video "${video.title}"`,
          link: `/watch/${video._id}`,
          read: false,
          createdAt: now
        });
      }
    }

    db.save();

    const authorChannel = db.channels.find(c => c._id === channelId);

    return res.status(201).json({
      comment: {
        ...newComment,
        author: {
          name: authorChannel?.name || user.name,
          handle: authorChannel?.handle || '@user',
          avatar: authorChannel?.avatar || user.avatar,
          verified: authorChannel?.verified || false
        },
        replies: [],
        isLiked: false
      }
    });
  } catch (err: any) {
    console.error('Post comment error:', err);
    return res.status(500).json({ error: 'Failed to post comment.' });
  }
});

// 3. Edit Comment
router.put('/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const comment = db.comments.find(c => c._id === req.params.id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (comment.userId !== req.user!._id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to edit this comment.' });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content cannot be empty.' });
    }

    comment.content = content.trim();
    comment.updatedAt = new Date().toISOString();
    db.save();

    return res.json({ comment });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update comment.' });
  }
});

// 4. Delete Comment
router.delete('/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const commentIndex = db.comments.findIndex(c => c._id === req.params.id);
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    const comment = db.comments[commentIndex];
    if (comment.userId !== req.user!._id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to delete this comment.' });
    }

    const video = db.videos.find(v => v._id === comment.videoId);

    // If this was a reply, decrement parent reply count
    if (comment.parentId) {
      const parent = db.comments.find(c => c._id === comment.parentId);
      if (parent && parent.replyCount > 0) {
        parent.replyCount -= 1;
      }
    }

    // Cascade to direct replies. The video comment counter must be reduced by
    // exactly the number of documents actually removed — the parent plus its
    // replies — and never below zero (AUD-009).
    const removedCount = removedCommentCount(comment, db.comments);

    db.comments = db.comments.filter(c => c._id !== comment._id && c.parentId !== comment._id) as any;

    if (video) {
      video.commentsCount = decrementCount(video.commentsCount, removedCount);
    }

    db.save();

    return res.json({ message: 'Comment deleted successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

// 5. Toggle Comment Like
router.post('/:id/like', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const comment = db.comments.find(c => c._id === req.params.id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    const userId = req.user!._id;
    const existingIndex = db.likes.findIndex(
      l => l.userId === userId && l.targetId === comment._id && l.targetType === 'comment'
    );

    let isLiked = false;

    if (existingIndex !== -1) {
      db.likes.splice(existingIndex, 1);
      comment.likesCount = Math.max(0, comment.likesCount - 1);
      isLiked = false;
    } else {
      db.likes.push({
        _id: createObjectId(),
        userId,
        targetId: comment._id,
        targetType: 'comment',
        createdAt: new Date().toISOString()
      });
      comment.likesCount += 1;
      isLiked = true;
    }

    db.save();

    return res.json({ isLiked, likesCount: comment.likesCount });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle comment like.' });
  }
});

export default router;
