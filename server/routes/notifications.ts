import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Get Notifications for Current User
router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!._id;
  const notifications = db.notifications
    .filter(n => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const unreadCount = notifications.filter(n => !n.read).length;

  return res.json({ notifications, unreadCount });
});

// Mark Single Notification as Read
router.post('/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  const notif = db.notifications.find(n => n._id === req.params.id && n.userId === req.user!._id);
  if (notif) {
    notif.read = true;
    db.save();
  }
  return res.json({ success: true });
});

// Mark All Notifications as Read
router.post('/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!._id;
  db.notifications.forEach(n => {
    if (n.userId === userId) {
      n.read = true;
    }
  });
  db.save();
  return res.json({ success: true });
});

export default router;
