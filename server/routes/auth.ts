import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, createObjectId } from '../db.js';
import { generateToken, requireAuth, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Register new user & creator channel
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, handle } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = db.users.find(u => u.email.toLowerCase() === normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = createObjectId();
    const channelId = createObjectId();
    const now = new Date().toISOString();

    const formattedHandle = handle 
      ? (handle.startsWith('@') ? handle : `@${handle}`).toLowerCase().replace(/[^a-z0-9_@]/g, '')
      : `@${name.toLowerCase().replace(/[^a-z0-9_]/g, '')}_${Math.floor(Math.random() * 1000)}`;

    const newUser = {
      _id: userId,
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=e11d48,0284c7,7c3aed`,
      role: 'creator' as const,
      channelId,
      createdAt: now,
      updatedAt: now
    };

    const newChannel = {
      _id: channelId,
      userId,
      name: name.trim(),
      handle: formattedHandle,
      avatar: newUser.avatar,
      banner: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80',
      description: `Welcome to ${name.trim()}'s official channel.`,
      subscriberCount: 0,
      videoCount: 0,
      totalViews: 0,
      verified: false,
      createdAt: now,
      updatedAt: now
    };

    db.users.push(newUser);
    db.channels.push(newChannel);
    db.save();

    const token = generateToken(newUser);

    return res.status(201).json({
      token,
      user: {
        _id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        avatar: newUser.avatar,
        role: newUser.role,
        channelId: newUser.channelId
      },
      channel: newChannel
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Server error during registration. Please try again.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.users.find(u => u.email.toLowerCase() === normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password credentials.' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password credentials.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended by the platform administrator.' });
    }

    const channel = user.channelId ? db.channels.find(c => c._id === user.channelId) : undefined;
    const token = generateToken(user);

    return res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        channelId: user.channelId
      },
      channel
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error during login. Please try again.' });
  }
});

// Current User Details
router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const channel = req.channel;

  return res.json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      channelId: user.channelId
    },
    channel
  });
});

// Update Profile / Channel
router.put('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { name, avatar, banner, description, handle } = req.body;

    if (name) user.name = name.trim();
    if (avatar) user.avatar = avatar;
    user.updatedAt = new Date().toISOString();

    let channel = user.channelId ? db.channels.find(c => c._id === user.channelId) : null;
    if (channel) {
      if (name) channel.name = name.trim();
      if (avatar) channel.avatar = avatar;
      if (banner) channel.banner = banner;
      if (description !== undefined) channel.description = description;
      if (handle) channel.handle = handle.startsWith('@') ? handle : `@${handle}`;
      channel.updatedAt = new Date().toISOString();
    }

    db.save();

    return res.json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        channelId: user.channelId
      },
      channel
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

export default router;
