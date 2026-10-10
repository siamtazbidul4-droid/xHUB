import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { seedDatabaseIfEmpty } from './server/seed.js';
import { validateEnv, getPort, isProduction } from './server/config/env.js';
import { corsMiddleware, securityHeaders } from './server/middleware/security.js';
import { rateLimiter } from './server/middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './server/middleware/errorHandler.js';

dotenv.config();

try {
  validateEnv();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

import authRouter from './server/routes/auth.js';
import uploadRouter from './server/routes/upload.js';
import videosRouter from './server/routes/videos.js';
import commentsRouter from './server/routes/comments.js';
import channelsRouter from './server/routes/channels.js';
import libraryRouter from './server/routes/library.js';
import categoriesRouter from './server/routes/categories.js';
import notificationsRouter from './server/routes/notifications.js';
import reportsRouter from './server/routes/reports.js';
import adminRouter from './server/routes/admin.js';

const app = express();
const PORT = getPort();

// Trust proxy metadata only when the operator opts in AND the value is a
// bounded hop count. Rate limiting keys on req.ip, so unbounded trust would
// let clients spoof X-Forwarded-For and bypass limits (AUD-015).
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY || '0', 10);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
  console.log(`[config] Trusting ${trustProxyHops} proxy hop(s) for client IP resolution.`);
} else if (isProduction()) {
  console.warn(
    '[config] running in production without TRUST_PROXY. If this server sits behind a ' +
    'reverse proxy, rate limits will key on the proxy IP. Set TRUST_PROXY to the exact ' +
    'number of trusted hops if applicable.'
  );
}

// Ensure uploads folder exists
const uploadsDir = path.resolve(process.cwd(), 'uploads');
const THUMBNAILS_DIR = path.join(uploadsDir, 'thumbnails');
for (const dir of [uploadsDir, THUMBNAILS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Global middlewares
app.use(corsMiddleware);
app.use(securityHeaders);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Rate limiting
app.use('/api/auth', rateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => req.ip || 'anonymous' }));
app.use('/api/admin/login', rateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyGenerator: (req) => req.ip || 'anonymous' }));
app.use('/api/reports', rateLimiter({ windowMs: 60 * 60 * 1000, max: 10, keyGenerator: (req) => req.user?._id || req.ip || 'anonymous' }));

// Static upload serving for THUMBNAILS only.
//
// Video files are intentionally NOT served from this static mount: serving the
// raw /uploads/videos/<file> path would bypass the per-video visibility
// authorization in GET /api/videos/:id/stream and :id/download, letting anyone
// with a filename fetch a creator's private/unlisted media (PRIV-2). All video
// bytes are served through those authorized API routes instead, which support
// HTTP Range requests. Thumbnails are non-sensitive metadata already returned by
// the public API and are safe to cache statically.
app.use('/uploads/thumbnails', express.static(THUMBNAILS_DIR, {
  acceptRanges: true,
  maxAge: '1d'
}));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/videos', videosRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler for unmatched API routes
app.use('/api', notFoundHandler);

// Global error handler (must be after all routes)
app.use(errorHandler);

async function startServer() {
  // Seed persistent database
  await seedDatabaseIfEmpty();

  if (!isProduction()) {
    // Development mode: Mount Vite middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
    console.log('⚡ Vite dev server middleware mounted');
  } else {
    // Production mode: Serve built static files
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Kinetix Video Platform running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the existing server or set a different PORT.`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });
}

startServer().catch(err => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
