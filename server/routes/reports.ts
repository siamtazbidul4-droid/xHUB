import { Router } from 'express';
import { db, createObjectId } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Submit a report for video or comment
router.post('/', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { targetId, targetType, reason, notes = '' } = req.body;

    if (!targetId || !targetType || !reason) {
      return res.status(400).json({ error: 'Target, targetType, and reason are required.' });
    }

    const validReasons = ['spam', 'harassment', 'copyright', 'misleading', 'inappropriate', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ error: 'Invalid report reason.' });
    }

    const report = {
      _id: createObjectId(),
      reporterUserId: req.user!._id,
      targetId,
      targetType: targetType === 'comment' ? 'comment' as const : 'video' as const,
      reason,
      notes: notes.trim(),
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.reports.push(report);
    db.save();

    return res.status(201).json({
      message: 'Report submitted successfully. Our moderation team will review this shortly.',
      reportId: report._id
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to submit report.' });
  }
});

export default router;
