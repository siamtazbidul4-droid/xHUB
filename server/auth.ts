import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db, UserDoc, ChannelDoc } from './db.js';
import { getJwtSecret } from './config/env.js';

export interface AuthenticatedRequest extends Request {
  user?: UserDoc;
  channel?: ChannelDoc;
}

let cachedJwtSecret: string | null = null;

function getSecret(): string {
  if (!cachedJwtSecret) {
    cachedJwtSecret = getJwtSecret();
  }
  return cachedJwtSecret;
}

export function generateToken(user: UserDoc): string {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
      channelId: user.channelId
    },
    getSecret(),
    { expiresIn: '7d' }
  );
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getSecret()) as { userId: string };
    const user = db.users.find(u => u._id === decoded.userId);
    // Suspended accounts must never gain authenticated privileges, even on
    // endpoints that merely enrich a public response (see AUD-003).
    // endpoints that merely enrich a public response. They fall through as an
    // anonymous guest, so genuinely public browsing still works.
    if (user && user.status !== 'suspended') {
      req.user = user;
      if (user.channelId) {
        req.channel = db.channels.find(c => c._id === user.channelId);
      }
    }
  } catch (err) {
    // Invalid/expired token in optionalAuth - continue as guest
  }
  next();
}

/**
 * Resolve the authenticated user for MEDIA requests whose URL is set directly
 * on a <video>/<img> element (or a download anchor), where the browser cannot
 * attach an `Authorization` header.
 *
 * The JWT is accepted from the `Authorization: Bearer` header first, then from
 * a `token` query parameter as a fallback. This is deliberately scoped to
 * read-only media playback/download and never relaxes `requireAuth`, which
 * remains header-only. The token is still fully verified and the account is
 * still required to be present and non-suspended, so no new privilege is
 * granted — it only lets the owner's own browser authenticate the media fetch.
 */
export function optionalMediaAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    const queryToken = req.query.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      token = queryToken;
    }
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, getSecret()) as { userId: string };
    const user = db.users.find(u => u._id === decoded.userId);
    if (user && user.status !== 'suspended') {
      req.user = user;
      if (user.channelId) {
        req.channel = db.channels.find(c => c._id === user.channelId);
      }
    }
  } catch {
    // Invalid/expired token in a media request - continue as guest so public
    // media still plays; authorization below still enforces private access.
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getSecret()) as { userId: string };
    const user = db.users.find(u => u._id === decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended by the platform administrator.' });
    }
    req.user = user;
    if (user.channelId) {
      req.channel = db.channels.find(c => c._id === user.channelId);
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
}

/**
 * Single, server-authoritative administrator policy.
 *
 * Privilege is decided from the CURRENT database role resolved in
 * requireAuth() — never from the JWT `role` claim (which goes stale after a
 * demotion) and never from a mutable email address (which an ordinary
 * registration could otherwise impersonate). requireAuth() has already
 * rejected missing/suspended accounts before this runs.
 *
 * `requirePlatformAdmin` is retained as the name used by the admin console,
 * but now enforces the same role-backed policy so that `/api/admin/*` and
 * `/api/categories/*` cannot disagree about who is an administrator.
 */
function isCurrentAdmin(req: AuthenticatedRequest): boolean {
  return Boolean(req.user && req.user.role === 'admin');
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!isCurrentAdmin(req)) {
      return res.status(403).json({ error: 'Access forbidden. Administrator privileges required.' });
    }
    next();
  });
}

export function requirePlatformAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!isCurrentAdmin(req)) {
      return res.status(403).json({ error: 'Access forbidden. Platform administrator privileges required.' });
    }
    next();
  });
}
