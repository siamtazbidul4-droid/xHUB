const TOKEN_STORAGE_KEY = 'kinetix_auth_token';

/**
 * Listeners notified when the server rejects the stored credentials with a
 * 401, so the auth context can clear its in-memory user state in sync with the
 * token being removed (AUD-011). Kept as a tiny subscription list to avoid a
 * hard dependency from this low-level module up to React.
 */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function emitUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    try {
      listener();
    } catch {
      // A faulty listener must not prevent token cleanup or error propagation.
    }
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Build a same-origin URL for a media element (<video>/<img>) or a download
 * anchor. Those elements cannot attach an Authorization header, so the stored
 * token is appended as a `token` query parameter for the server's media-auth
 * path (PRIV-1). When no token is present the URL is returned unchanged so
 * public media still loads for guests.
 */
export function mediaUrl(endpoint: string): string {
  const token = getToken();
  if (!token) return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}token=${encodeURIComponent(token)}`;
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    signal
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;

  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    // An expired or revoked token is unrecoverable: drop it and tell the auth
    // context so the UI stops presenting a signed-in session. A 403 is a
    // deliberate authorization denial, not a stale credential, so it must not
    // trigger a logout.
    if (response.status === 401 && token) {
      removeToken();
      emitUnauthorized();
    }

    const errorMsg = data && typeof data === 'object' && data.error 
      ? data.error 
      : `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

// Helpers for formatted duration (e.g. 1:04:20 or 14:32)
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Format views (e.g. 1.2M, 45K)
export function formatViews(views: number): string {
  if (!views) return '0 views';
  if (views >= 1000000) {
    return `${(views / 1000000).toFixed(1)}M views`;
  }
  if (views >= 1000) {
    return `${(views / 1000).toFixed(1)}K views`;
  }
  return `${views} views`;
}

// Format relative time (e.g. 2 hours ago, 3 days ago)
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
}
