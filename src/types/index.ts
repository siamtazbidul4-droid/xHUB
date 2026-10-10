export interface User {
  _id: string;
  email: string;
  name: string;
  avatar: string;
  role: 'user' | 'creator' | 'admin';
  status?: 'active' | 'suspended';
  channelId?: string;
  adminVerified?: boolean;
}

export interface Channel {
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
  isSubscribed?: boolean;
}

export interface Video {
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
  channel?: {
    _id: string;
    name: string;
    handle: string;
    avatar: string;
    verified?: boolean;
    subscriberCount?: number;
    userId?: string;
  } | null;
  isLiked?: boolean;
  isSubscribed?: boolean;
  isSavedWatchLater?: boolean;
  progressSeconds?: number;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description: string;
  videoCount: number;
}

export interface CommentAuthor {
  name: string;
  handle: string;
  avatar: string;
  verified: boolean;
}

export interface CommentItem {
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
  author: CommentAuthor;
  isLiked?: boolean;
  replies?: CommentItem[];
}

export interface NotificationItem {
  _id: string;
  userId: string;
  type: 'subscriber' | 'comment' | 'video_ready' | 'system';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface ReportItem {
  _id: string;
  reporterUserId: string;
  reporterName?: string;
  targetId: string;
  targetType: 'video' | 'comment';
  reason: 'spam' | 'harassment' | 'copyright' | 'misleading' | 'inappropriate' | 'other';
  notes: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: string;
  updatedAt: string;
  targetInfo?: {
    title?: string;
    content?: string;
    id: string;
  };
}

export interface AdminMetrics {
  totalUsers: number;
  totalCreators: number;
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalSubscriptions: number;
  pendingReports: number;
  totalStorageMB: number;
}
