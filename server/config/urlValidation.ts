/**
 * Server-side validation for creator-supplied media URLs (AUD-002).
 *
 * Media URLs reach security-sensitive sinks in the browser:
 *  - `videoUrl` becomes the `src` of the video player / a redirect target.
 *  - `thumbnailUrl` becomes the `src` of an <img>.
 *
 * Two shapes are legitimate in this product:
 *  1. Local upload paths produced by /api/upload (e.g. `/uploads/videos/x.mp4`).
 *  2. Explicit HTTPS sources on the public internet (CDN-hosted sample media,
 *     remote thumbnails), which the platform intentionally supports.
 *
 * Everything else — `javascript:`, `data:`, `vbscript:`, `file:`, protocol
 * relative `//host`, and malformed values — is rejected so a stored value can
 * never be interpreted as script or a local-file reference.
 */

export type MediaKind = 'video' | 'thumbnail';

const LOCAL_VIDEO_PREFIX = '/uploads/videos/';
const LOCAL_THUMBNAIL_PREFIX = '/uploads/thumbnails/';

/**
 * Returns a normalized URL string when the value is a legitimate media source,
 * or `null` when it must be rejected.
 */
export function validateMediaUrl(value: unknown, kind: MediaKind): string | null {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  // Local upload paths. Only the exact prefix for the expected asset kind is
  // accepted, and the remaining segment must be a bare filename (no further
  // slashes, no traversal) so the stored value cannot point outside the folder.
  const localPrefix = kind === 'video' ? LOCAL_VIDEO_PREFIX : LOCAL_THUMBNAIL_PREFIX;
  if (raw.startsWith('/uploads/')) {
    if (!raw.startsWith(localPrefix)) return null;
    const filename = raw.slice(localPrefix.length);
    if (!filename || filename.includes('/') || filename.includes('\\')) return null;
    if (filename.includes('..')) return null;
    return raw;
  }

  // Explicit, absolute HTTPS sources only. Reject everything else (including
  // http://, which would allow mixed-content/MITM injection).
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;

  // A URL with embedded credentials is never a legitimate media source.
  if (parsed.username || parsed.password) return null;

  return parsed.toString();
}

/** Convenience predicate for callers that only need a boolean. */
export function isValidMediaUrl(value: unknown, kind: MediaKind): boolean {
  return validateMediaUrl(value, kind) !== null;
}

/**
 * True when an already-validated https URL is a SAFE OUTBOUND target for the
 * server (stream/download redirect and server-side fetch).
 *
 * validateMediaUrl() only guarantees the scheme/host syntax is acceptable as a
 * browser-facing media source; it intentionally allows loopback/private hosts.
 * The server must NOT be tricked into following a stored value to an internal
 * address (SSRF) or downgrading to a non-https scheme, so every outbound use
 * re-checks the parsed URL here (AUD-018).
 */
export function isSafeExternalMediaTarget(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  return !isPrivateOrReservedHostname(parsed.hostname);
}

/**
 * Reject hostnames that resolve to loopback, link-local, private, or otherwise
 * reserved address space, plus well-known internal aliases. Hostnames that are
 * literal IPs are checked directly; named hosts are matched against a small
 * blocklist of internal aliases (full DNS resolution is deliberately avoided so
 * this stays a pure, synchronous, side-effect-free predicate).
 */
function isPrivateOrReservedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata' || host.endsWith('.internal')) {
    return true;
  }

  // IPv4 literal
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // loopback
    if (a === 0) return true;                        // "this" network
    if (a === 169 && b === 254) return true;         // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true;                       // multicast/reserved
    return false;
  }

  // IPv6 literal (loopback ::1, unspecified ::, unique-local fc00::/7, link-local fe80::/10)
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) return true;
    return false;
  }

  return false;
}
