import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireAuth, AuthenticatedRequest } from '../auth.js';
import { db, createObjectId } from '../db.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const VIDEOS_DIR = path.join(UPLOADS_ROOT, 'videos');
const THUMBNAILS_DIR = path.join(UPLOADS_ROOT, 'thumbnails');
const CHUNKS_DIR = path.join(UPLOADS_ROOT, 'chunks');

// Ensure directories exist
[UPLOADS_ROOT, VIDEOS_DIR, THUMBNAILS_DIR, CHUNKS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure Multer for single uploads
const singleStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, THUMBNAILS_DIR);
    } else {
      cb(null, VIDEOS_DIR);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || (file.mimetype.startsWith('image/') ? '.jpg' : '.mp4');
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, uniqueName);
  }
});

const uploadSingle = multer({
  storage: singleStorage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max for direct single-file upload
  },
  fileFilter: (req, file, cb) => {
    const allowedImage = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const allowedVideo = ['video/mp4', 'video/webm', 'video/quicktime', 'video/mkv', 'video/x-matroska'];

    if (allowedImage.includes(file.mimetype) || allowedVideo.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Please upload standard MP4/WebM video or JPG/PNG image.`));
    }
  }
});

// Multer for chunk uploads
const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.body.sessionId;
    const sessionDir = path.join(CHUNKS_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    const chunkIndex = req.body.chunkIndex;
    cb(null, `chunk_${chunkIndex}.part`);
  }
});

const uploadChunk = multer({ storage: chunkStorage });

// 1. Single direct upload (thumbnails or smaller videos)
// Limit: 30 requests per 15 min per user
router.post('/single', requireAuth, rateLimiter({ windowMs: 15 * 60 * 1000, max: 30, keyGenerator: (req) => req.user?._id || req.ip || 'anonymous' }), uploadSingle.single('file'), (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided in request.' });
    }

    const isImage = req.file.mimetype.startsWith('image/');
    const relativeUrl = isImage 
      ? `/uploads/thumbnails/${req.file.filename}` 
      : `/uploads/videos/${req.file.filename}`;

    return res.json({
      url: relativeUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      type: isImage ? 'image' : 'video'
    });
  } catch (err: any) {
    console.error('Upload single error:', err);
    return res.status(500).json({ error: err.message || 'File upload failed.' });
  }
});

// 2. Chunked Upload: Initialize
interface ChunkSession {
  sessionId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  receivedChunks: Set<number>;
  createdAt: number;
}
const activeSessions = new Map<string, ChunkSession>();

// Cleanup stale chunk sessions and orphan directories (older than 2 hours)
setInterval(() => {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.createdAt > TWO_HOURS) {
      const dir = path.join(CHUNKS_DIR, sessionId);
      if (fs.existsSync(dir)) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      }
      activeSessions.delete(sessionId);
    }
  }

  // Also sweep chunks dir for any directories not in activeSessions that are old
  try {
    if (fs.existsSync(CHUNKS_DIR)) {
      const entries = fs.readdirSync(CHUNKS_DIR);
      for (const entry of entries) {
        const fullPath = path.join(CHUNKS_DIR, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && now - stat.mtimeMs > TWO_HOURS && !activeSessions.has(entry)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      }
    }
  } catch {}
}, 30 * 60 * 1000); // Check every 30 minutes

router.post('/chunk/init', requireAuth, rateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => req.user?._id || req.ip || 'anonymous' }), (req: AuthenticatedRequest, res) => {
  const { fileName, fileSize, totalChunks, mimeType } = req.body;
  if (!fileName || !totalChunks) {
    return res.status(400).json({ error: 'fileName and totalChunks are required.' });
  }

  const sessionId = createObjectId();
  const sessionDir = path.join(CHUNKS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  activeSessions.set(sessionId, {
    sessionId,
    userId: req.user!._id,
    fileName,
    fileSize: Number(fileSize) || 0,
    totalChunks: Number(totalChunks),
    receivedChunks: new Set<number>(),
    createdAt: Date.now()
  });

  return res.json({
    sessionId,
    message: 'Chunked upload session initialized successfully.',
    totalChunks: Number(totalChunks)
  });
});

// 3. Chunked Upload: Upload Chunk
// Limit: 500 requests per 15 min per user (allows large files with many chunks)
router.post('/chunk', requireAuth, rateLimiter({ windowMs: 15 * 60 * 1000, max: 500, keyGenerator: (req) => req.user?._id || req.ip || 'anonymous' }), uploadChunk.single('chunk'), (req: AuthenticatedRequest, res) => {
  const { sessionId, chunkIndex } = req.body;
  if (!sessionId || chunkIndex === undefined) {
    return res.status(400).json({ error: 'sessionId and chunkIndex are required.' });
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Upload session expired or invalid.' });
  }
  // A session belongs to the user who initialized it. Without this check any
  // authenticated user could inject chunks into another uploader's session
  // (AUD-007).
  if (session.userId !== req.user!._id) {
    return res.status(403).json({ error: 'This upload session belongs to another user.' });
  }

  const index = Number(chunkIndex);
  if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
    return res.status(400).json({ error: 'chunkIndex is out of range for this session.' });
  }

  session.receivedChunks.add(index);
  const progressPercent = Math.round((session.receivedChunks.size / session.totalChunks) * 100);

  return res.json({
    sessionId,
    chunkIndex: index,
    chunksReceived: session.receivedChunks.size,
    totalChunks: session.totalChunks,
    progressPercent
  });
});

// 4. Chunked Upload: Finalize / Stitch
// Limit: 20 requests per 15 min per user
router.post('/chunk/finalize', requireAuth, rateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => req.user?._id || req.ip || 'anonymous' }), async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.body;
    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Upload session not found.' });
    }
    if (session.userId !== req.user!._id) {
      return res.status(403).json({ error: 'This upload session belongs to another user.' });
    }

    const sessionDir = path.join(CHUNKS_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Chunk directory missing.' });
    }

    const ext = path.extname(session.fileName).toLowerCase() || '.mp4';
    const finalFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
    const finalFilePath = path.join(VIDEOS_DIR, finalFilename);

    const writeStream = fs.createWriteStream(finalFilePath);

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(sessionDir, `chunk_${i}.part`);
      if (!fs.existsSync(chunkPath)) {
        writeStream.destroy();
        return res.status(400).json({ error: `Missing chunk ${i}. Finalize aborted.` });
      }
      const chunkBuffer = fs.readFileSync(chunkPath);
      writeStream.write(chunkBuffer);
    }

    writeStream.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(true));
      writeStream.on('error', reject);
    });

    // Cleanup chunk directory
    fs.rmSync(sessionDir, { recursive: true, force: true });
    activeSessions.delete(sessionId);

    const stats = fs.statSync(finalFilePath);

    return res.json({
      url: `/uploads/videos/${finalFilename}`,
      filename: finalFilename,
      originalName: session.fileName,
      size: stats.size,
      status: 'uploaded'
    });
  } catch (err: any) {
    console.error('Finalize chunk error:', err);
    return res.status(500).json({ error: 'Failed to stitch video chunks: ' + err.message });
  }
});

// 5. Cancel chunk upload session
// Limit: 20 requests per 15 min per user
router.post('/chunk/cancel', requireAuth, rateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => req.user?._id || req.ip || 'anonymous' }), (req: AuthenticatedRequest, res) => {
  const { sessionId } = req.body;
  const session = sessionId ? activeSessions.get(sessionId) : undefined;
  if (session && session.userId !== req.user!._id) {
    return res.status(403).json({ error: 'This upload session belongs to another user.' });
  }
  if (sessionId && activeSessions.has(sessionId)) {
    const sessionDir = path.join(CHUNKS_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    activeSessions.delete(sessionId);
  }
  return res.json({ message: 'Upload session canceled and cleaned up.' });
});

export default router;
