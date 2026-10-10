import fs from 'fs';
import path from 'path';
import { logger } from './utils/logger.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function createObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const machineAndProcess = Math.floor(Math.random() * 0xffffffffffff).toString(16).padStart(12, '0');
  const counter = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `${timestamp}${machineAndProcess}${counter}`.slice(0, 24);
}

export interface UserDoc {
  _id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatar: string;
  role: 'user' | 'creator' | 'admin';
  status?: 'active' | 'suspended';
  channelId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelDoc {
  _id: string;
  userId: string;
  name: string;
  handle: string;
  avatar: string;
  banner: string;
  description: string;
  subscriberCount: number;
  videoCount: number;
  totalViews: number;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VideoDoc {
  _id: string;
  channelId: string;
  userId: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  thumbnailUrl: string;
  videoUrl: string;
  duration: number;
  fileSize: number;
  visibility: 'public' | 'unlisted' | 'private';
  status: 'uploading' | 'uploaded' | 'processing' | 'ready' | 'published' | 'failed' | 'unpublished';
  views: number;
  likesCount: number;
  commentsCount: number;
  featured?: boolean;
  allowDownload?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryDoc {
  _id: string;
  name: string;
  slug: string;
  description: string;
  videoCount: number;
}

export interface CommentDoc {
  _id: string;
  videoId: string;
  userId: string;
  channelId: string;
  content: string;
  parentId: string | null;
  likesCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LikeDoc {
  _id: string;
  userId: string;
  targetId: string;
  targetType: 'video' | 'comment';
  createdAt: string;
}

export interface SubscriptionDoc {
  _id: string;
  userId: string;
  channelId: string;
  createdAt: string;
}

export interface WatchHistoryDoc {
  _id: string;
  videoId: string;
  userId: string;
  watchedAt: string;
  progressSeconds: number;
  completed: boolean;
}

export interface WatchLaterDoc {
  _id: string;
  videoId: string;
  userId: string;
  addedAt: string;
}

export interface NotificationDoc {
  _id: string;
  userId: string;
  type: 'subscriber' | 'comment' | 'video_ready' | 'system';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface ReportDoc {
  _id: string;
  reporterUserId: string;
  targetId: string;
  targetType: 'video' | 'comment';
  reason: 'spam' | 'harassment' | 'copyright' | 'misleading' | 'inappropriate' | 'other';
  notes: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseSchema {
  users: UserDoc[];
  channels: ChannelDoc[];
  videos: VideoDoc[];
  categories: CategoryDoc[];
  comments: CommentDoc[];
  likes: LikeDoc[];
  subscriptions: SubscriptionDoc[];
  history: WatchHistoryDoc[];
  watchLater: WatchLaterDoc[];
  notifications: NotificationDoc[];
  reports: ReportDoc[];
}

const DB_BACKUP_FILE = path.join(DATA_DIR, 'db.backup.json');

function emptyDatabase(): DatabaseSchema {
  return {
    users: [],
    channels: [],
    videos: [],
    categories: [],
    comments: [],
    likes: [],
    subscriptions: [],
    history: [],
    watchLater: [],
    notifications: [],
    reports: []
  };
}

function parseDatabaseContent(content: string): DatabaseSchema {
  const parsed = JSON.parse(content);
  return {
    users: parsed.users || [],
    channels: parsed.channels || [],
    videos: parsed.videos || [],
    categories: parsed.categories || [],
    comments: parsed.comments || [],
    likes: parsed.likes || [],
    subscriptions: parsed.subscriptions || [],
    history: parsed.history || [],
    watchLater: parsed.watchLater || [],
    notifications: parsed.notifications || [],
    reports: parsed.reports || []
  };
}

function readDatabaseFile(filePath: string): DatabaseSchema {
  // Strip a UTF-8 BOM if present — JSON.parse rejects it otherwise.
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  return parseDatabaseContent(content);
}

function loadDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      return readDatabaseFile(DB_FILE);
    } else if (fs.existsSync(DB_BACKUP_FILE)) {
      return readDatabaseFile(DB_BACKUP_FILE);
    }
  } catch (err) {
    logger.error({ err }, 'Error loading database file, checking backup');
    if (fs.existsSync(DB_BACKUP_FILE)) {
      try {
        return readDatabaseFile(DB_BACKUP_FILE);
      } catch (backupErr) {
        logger.error({ err: backupErr }, 'Backup database failed to load');
      }
    }
  }
  return emptyDatabase();
}

export function saveDatabase(): void {
  // Serialize persistence so two overlapping mutations cannot interleave
  // temp-file writes or leave a torn backup (AUD-005). Node's single-threaded
  // execution model means the synchronous body below cannot be pre-empted by
  // another save once it starts, so the guard prevents re-entrancy from
  // nested calls rather than true thread concurrency.
  if (isSaving) {
    logger.warn('saveDatabase() re-entered while a previous write was in progress; skipping duplicate write');
    return;
  }
  isSaving = true;
  try {
    const serialized = JSON.stringify(dbMemory, null, 2);
    const tempFile = path.join(DATA_DIR, `db.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`);
    fs.writeFileSync(tempFile, serialized, 'utf-8');
    fs.renameSync(tempFile, DB_FILE);

    // Backup failure must not be silently swallowed: the primary file is
    // already durable at this point, but the operator needs to know the
    // recovery copy is stale.
    try {
      fs.writeFileSync(DB_BACKUP_FILE, serialized, 'utf-8');
    } catch (backupErr) {
      logger.error({ err: backupErr }, 'Database backup write failed; primary file is current but backup is stale');
    }
  } catch (err) {
    // Surface the failure instead of pretending the mutation was persisted.
    logger.error({ err }, 'Error saving database file');
    throw err;
  } finally {
    isSaving = false;
  }
}

let dbMemory: DatabaseSchema = loadDatabase();
let isSaving = false;

export const db = {
  get users() { return dbMemory.users; },
  set users(val) { dbMemory.users = val; },
  get channels() { return dbMemory.channels; },
  set channels(val) { dbMemory.channels = val; },
  get videos() { return dbMemory.videos; },
  set videos(val) { dbMemory.videos = val; },
  get categories() { return dbMemory.categories; },
  set categories(val) { dbMemory.categories = val; },
  get comments() { return dbMemory.comments; },
  set comments(val) { dbMemory.comments = val; },
  get likes() { return dbMemory.likes; },
  set likes(val) { dbMemory.likes = val; },
  get subscriptions() { return dbMemory.subscriptions; },
  set subscriptions(val) { dbMemory.subscriptions = val; },
  get history() { return dbMemory.history; },
  set history(val) { dbMemory.history = val; },
  get watchLater() { return dbMemory.watchLater; },
  set watchLater(val) { dbMemory.watchLater = val; },
  get notifications() { return dbMemory.notifications; },
  set notifications(val) { dbMemory.notifications = val; },
  get reports() { return dbMemory.reports; },
  set reports(val) { dbMemory.reports = val; },
  save: saveDatabase,
  reset: () => {
    dbMemory = emptyDatabase();
    saveDatabase();
  }
};