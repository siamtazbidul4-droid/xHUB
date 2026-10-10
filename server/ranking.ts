/**
 * Video Discovery & Ranking Engine
 *
 * Deterministic, weighted ranking model for the Kinetix feed, category,
 * and search surfaces. All scores are computed from data that actually
 * exists in the platform's data model:
 *
 *   VideoDoc:  views, likesCount, commentsCount, tags[], category,
 *             duration, fileSize, status, visibility, createdAt
 *   ChannelDoc: subscriberCount, verified
 *   WatchHistoryDoc / SubscriptionDoc / LikeDoc (per-user personalization)
 *
 * Signals intentionally NOT fabricated: shares, saves, watch-completion
 * aggregates and historical engagement snapshots do not exist in the data
 * model, so true engagement velocity cannot be derived. Recency-weighted
 * engagement decay is used as the best available proxy.
 *
 * All math is NaN/Infinity-safe: divisions are guarded, logarithms only
 * operate on values >= 1, and every normalized signal is clamped to [0, 1].
 */

import { db, VideoDoc, ChannelDoc } from './db.js';

// ---------------------------------------------------------------------------
// Safe math helpers
// ---------------------------------------------------------------------------

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Engagement rate: numerator / max(denominator, 1), clamped to [0, 1]. */
export function safeRate(numerator: number, denominator: number): number {
  const num = Number.isFinite(numerator) ? Math.max(0, numerator) : 0;
  const den = Number.isFinite(denominator) ? denominator : 0;
  return clamp01(num / Math.max(1, den));
}

/**
 * Sample-confidence-weighted rate. A video with 2 views and 3 likes
 * must not score the same "100% like rate" as a video with 1,000
 * views and 1,000 likes. Rates are dampened until the denominator
 * reaches `confidenceScale` observations (default 100 views).
 */
export function confidentRate(
  numerator: number,
  denominator: number,
  confidenceScale = 100
): number {
  const rate = safeRate(numerator, denominator);
  const observations = Number.isFinite(denominator) ? Math.max(0, denominator) : 0;
  const confidence = clamp01(observations / Math.max(1, confidenceScale));
  return rate * confidence;
}

/**
 * Logarithmic normalization: raw counts are compressed so a video with
 * 1,000,000 views is not treated as 1000x better than one with 1,000.
 * `reference` is the count that scores 1.0.
 */
export function logScale(value: number, reference: number): number {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const ref = Number.isFinite(reference) && reference > 1 ? reference : 1000;
  return clamp01(Math.log10(1 + v) / Math.log10(1 + ref));
}

// ---------------------------------------------------------------------------
// Ranking signals
// ---------------------------------------------------------------------------

export interface ChannelLookup {
  get(channelId: string): ChannelDoc | undefined;
}

/**
 * Engagement: mix of absolute engagement (log-normalized) and engagement
 * RATE (likes & comments per view). Rate normalization prevents a huge old
 * video from automatically beating a smaller video with stronger engagement.
 */
export function calculateEngagementScore(video: VideoDoc): number {
  const likeRate = confidentRate(video.likesCount, video.views);
  const commentRate = confidentRate(video.commentsCount, video.views);
  const likesNorm = logScale(video.likesCount, 100_000);
  const commentsNorm = logScale(video.commentsCount, 10_000);

  return clamp01(
    0.30 * likesNorm +
    0.20 * commentsNorm +
    0.25 * likeRate +
    0.25 * commentRate
  );
}

/** Popularity: log-normalized views, likes and comments. Never the sole signal. */
export function calculatePopularityScore(video: VideoDoc): number {
  return clamp01(
    0.60 * logScale(video.views, 1_000_000) +
    0.25 * logScale(video.likesCount, 100_000) +
    0.15 * logScale(video.commentsCount, 10_000)
  );
}

/**
 * Freshness: exponential decay over hours since publication.
 * Half-life of 7 days — a video published now scores 1.0, ~0.5 after a
 * week, ~0.13 after a month. Old videos decay toward 0 but can still rank
 * through engagement/popularity; they never disappear.
 */
export function calculateFreshnessScore(video: VideoDoc, now: number): number {
  const publishedMs = new Date(video.createdAt).getTime();
  const ageHours = Number.isFinite(publishedMs)
    ? Math.max(0, (now - publishedMs) / (1000 * 60 * 60))
    : 0;
  const HALF_LIFE_HOURS = 24 * 7;
  return Math.exp(-(ageHours * Math.LN2) / HALF_LIFE_HOURS);
}

/**
 * Velocity proxy. The data model keeps no historical engagement snapshots,
 * so true velocity (engagement gained in the last N hours) cannot be
 * computed. Recency-weighted engagement is the closest available proxy:
 * strong engagement on a young video indicates rapid early traction.
 */
export function calculateVelocityScore(video: VideoDoc, now: number): number {
  const ageHours = Math.max(
    0.5,
    (now - new Date(video.createdAt).getTime()) / (1000 * 60 * 60)
  );
  const engagement = video.views * 1.0 + video.likesCount * 4.0 + video.commentsCount * 6.0;
  return engagement / Math.pow(ageHours + 2, 1.2);
}

/**
 * Quality: processing-complete media with real duration and complete
 * metadata. Deliberately modest — file size / resolution do NOT rank a
 * video higher; completeness and playability do.
 */
export function calculateQualityScore(video: VideoDoc): number {
  const durationScore =
    video.duration >= 60 ? 1 : video.duration >= 30 ? 0.6 : 0.3;

  const metadataParts = [
    Boolean(video.description && video.description.trim()),
    Array.isArray(video.tags) && video.tags.length > 0,
    Boolean(video.thumbnailUrl && video.thumbnailUrl.trim())
  ];
  const metadataScore = metadataParts.filter(Boolean).length / metadataParts.length;

  return clamp01(0.5 * durationScore + 0.5 * metadataScore);
}

/**
 * Creator authority: log-normalized subscriber count plus a verified bonus.
 * Secondary signal only — a large channel does NOT make every upload
 * outrank a highly engaging video from a smaller creator.
 */
export function calculateCreatorAuthorityScore(channel: ChannelDoc | undefined): number {
  if (!channel) return 0;
  return clamp01(
    0.7 * logScale(channel.subscriberCount, 1_000_000) +
    0.3 * (channel.verified ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------
// Personalization (authenticated users only)
// ---------------------------------------------------------------------------

export interface UserInterestProfile {
  /** lowercased category -> normalized affinity in [0, 1] */
  categoryAffinity: Map<string, number>;
  subscribedChannelIds: Set<string>;
}

/**
 * Derives a user's interest profile from legitimate behavioral data that
 * already exists: watch history (recency-weighted), liked videos and
 * channel subscriptions. No new tracking is introduced.
 */
export function buildUserInterestProfile(userId: string): UserInterestProfile {
  const categoryScores = new Map<string, number>();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const entry of db.history) {
    if (entry.userId !== userId) continue;
    const video = db.videos.find(v => v._id === entry.videoId);
    if (!video) continue;
    const watchedMs = new Date(entry.watchedAt).getTime();
    const daysAgo = Number.isFinite(watchedMs)
      ? Math.max(0, (now - watchedMs) / DAY_MS)
      : 30;
    // Recent history counts more; completion confirms interest.
    const weight = (1 / (1 + daysAgo / 14)) * (entry.completed ? 1.5 : 1);
    const key = video.category.toLowerCase();
    categoryScores.set(key, (categoryScores.get(key) || 0) + weight);
  }

  for (const like of db.likes) {
    if (like.userId !== userId || like.targetType !== 'video') continue;
    const video = db.videos.find(v => v._id === like.targetId);
    if (!video) continue;
    const key = video.category.toLowerCase();
    categoryScores.set(key, (categoryScores.get(key) || 0) + 1);
  }

  const maxScore = Math.max(0, ...Array.from(categoryScores.values()));
  const categoryAffinity = new Map<string, number>();
  if (maxScore > 0) {
    for (const [key, score] of categoryScores) {
      categoryAffinity.set(key, score / maxScore);
    }
  }

  const subscribedChannelIds = new Set<string>(
    db.subscriptions
      .filter(s => s.userId === userId)
      .map(s => s.channelId)
  );

  return { categoryAffinity, subscribedChannelIds };
}

/**
 * Personalization multiplier in [1.0, 1.25]. A user's demonstrated
 * interests boost relevant content modestly but can never override global
 * quality — the boost is capped at +25%.
 */
export function calculatePersonalizationMultiplier(
  video: VideoDoc,
  profile: UserInterestProfile | null | undefined
): number {
  if (!profile) return 1;
  const affinity = profile.categoryAffinity.get(video.category.toLowerCase()) || 0;
  const subscribedBoost = profile.subscribedChannelIds.has(video.channelId) ? 0.07 : 0;
  return 1 + Math.min(0.25, 0.18 * affinity + subscribedBoost);
}

// ---------------------------------------------------------------------------
// Final feed score
// ---------------------------------------------------------------------------

export interface RankingContext {
  now: number;
  channelIndex: ChannelLookup;
  userProfile?: UserInterestProfile | null;
}

/**
 * Final discovery score for anonymous and authenticated users.
 *
 *   FinalScore = 0.34 * Engagement
 *              + 0.20 * Popularity
 *              + 0.20 * Freshness
 *              + 0.16 * Quality
 *              + 0.10 * CreatorAuthority
 *
 * then scaled by the (capped) personalization multiplier for signed-in
 * users. Weights sum to 1.0 so no single signal can dominate.
 */
export function calculateFeedScore(
  video: VideoDoc,
  ctx: RankingContext
): number {
  const channel = ctx.channelIndex.get(video.channelId);
  const base =
    0.34 * calculateEngagementScore(video) +
    0.20 * calculatePopularityScore(video) +
    0.20 * calculateFreshnessScore(video, ctx.now) +
    0.16 * calculateQualityScore(video) +
    0.10 * calculateCreatorAuthorityScore(channel);
  return base * calculatePersonalizationMultiplier(video, ctx.userProfile);
}

// ---------------------------------------------------------------------------
// Deterministic ordering & diversity
// ---------------------------------------------------------------------------

export interface ScoredVideo {
  video: VideoDoc;
  score: number;
}

/** Deterministic tie-break chain: score, views, likes, age, _id. */
export function compareScored(a: ScoredVideo, b: ScoredVideo): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.video.views !== a.video.views) return b.video.views - a.video.views;
  if (b.video.likesCount !== a.video.likesCount) return b.video.likesCount - a.video.likesCount;
  const ageA = new Date(a.video.createdAt).getTime();
  const ageB = new Date(b.video.createdAt).getTime();
  if (ageB !== ageA) return ageB - ageA;
  return a.video._id < b.video._id ? -1 : a.video._id > b.video._id ? 1 : 0;
}

/**
 * Controlled feed diversity. The highest-ranked video always leads.
 * After that, a candidate is skipped (and retried next) when its
 * creator or category already appears in the trailing window — but
 * only while a roughly equal alternative exists (within
 * `minScoreRatio` of the current best), so ranking quality is
 * never destroyed to force variety. Fully deterministic.
 */
export function applyDiversityMix(
  items: ScoredVideo[],
  windowSize = 3,
  minScoreRatio = 0.75
): ScoredVideo[] {
  if (items.length <= windowSize + 1) return items;

  const pool = items.slice();
  const selected: ScoredVideo[] = [];

  while (pool.length > 0) {
    const recentChannels = new Set(
      selected.slice(-windowSize).map(s => s.video.channelId)
    );
    const recentCategories = new Set(
      selected.slice(-windowSize).map(s => s.video.category.toLowerCase())
    );

    // Pool is sorted descending, so pool[0].score is the best
    // remaining. Only candidates near that score may be reordered.
    const scoreFloor = pool[0].score * minScoreRatio;

    const findPick = (requireFreshCategory: boolean): number => {
      for (let i = 0; i < pool.length; i++) {
        const candidate = pool[i];
        if (candidate.score < scoreFloor) break;
        const v = candidate.video;
        const channelFresh = !recentChannels.has(v.channelId);
        const categoryFresh = !recentCategories.has(v.category.toLowerCase());
        if (channelFresh && (!requireFreshCategory || categoryFresh)) {
          return i;
        }
      }
      return -1;
    };

    let pickIndex = findPick(true);
    // Relax to creator diversity only, then to plain rank order.
    if (pickIndex === -1) pickIndex = findPick(false);
    if (pickIndex === -1) pickIndex = 0;

    selected.push(pool.splice(pickIndex, 1)[0]);
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Search relevance ranking
// ---------------------------------------------------------------------------

export type SearchMatchField =
  | 'title_exact'
  | 'title_start'
  | 'title_tokens'
  | 'title_prefix'
  | 'title_substring'
  | 'title_token_partial'
  | 'tag_exact'
  | 'tag'
  | 'tag_tokens'
  | 'category_exact'
  | 'category'
  | 'description'
  | 'description_token'
  | 'channel';

export interface SearchRelevance {
  relevance: number; // [0, 1]
  coverage: number; // [0, 1] fraction of query tokens matched (weighted)
  matchedField: SearchMatchField | null;
}

export function tokenizeQuery(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Query relevance hierarchy:
 *
 *   exact title match > title starts-with > all tokens as title words
 *   > title word prefixes > title substring > partial title tokens
 *   > exact tag > tag substring > all tokens in tags
 *   > exact category > category match > description > description token
 *   > channel name
 *
 * A small token-coverage bonus rewards matching more of the query
 * across fields, but the field hierarchy always dominates.
 */
export function calculateSearchRelevance(
  video: VideoDoc,
  query: string,
  channelName?: string
): SearchRelevance {
  const q = query.trim().toLowerCase();
  if (!q) return { relevance: 0, coverage: 0, matchedField: null };

  const tokens = tokenizeQuery(q);
  const titleL = video.title.toLowerCase();
  const titleWords = titleL.split(/[^a-z0-9]+/).filter(Boolean);
  const descL = video.description.toLowerCase();
  const tagsL = (Array.isArray(video.tags) ? video.tags : []).map(t => t.toLowerCase());
  const catL = video.category.toLowerCase();
  const channelL = (channelName || '').toLowerCase();

  let best = 0;
  let matchedField: SearchMatchField | null = null;

  const consider = (value: number, field: SearchMatchField) => {
    if (value > best) {
      best = value;
      matchedField = field;
    }
  };

  if (titleL === q) consider(1.0, 'title_exact');
  if (titleL.startsWith(q)) consider(0.9, 'title_start');
  if (tokens.length > 0 && tokens.every(t => titleWords.includes(t))) {
    consider(0.8, 'title_tokens');
  }
  if (tokens.length > 0 && tokens.every(t => titleWords.some(w => w.startsWith(t)))) {
    consider(0.7, 'title_prefix');
  }
  if (titleL.includes(q)) consider(0.6, 'title_substring');

  if (tokens.length > 0) {
    const titleHits = tokens.filter(
      t => titleWords.includes(t) || titleWords.some(w => w.startsWith(t))
    ).length;
    if (titleHits > 0 && titleHits < tokens.length) {
      consider(0.3 + 0.15 * (titleHits / tokens.length), 'title_token_partial');
    }
  }

  if (tagsL.includes(q)) consider(0.55, 'tag_exact');
  else if (tagsL.some(t => t.includes(q))) consider(0.45, 'tag');
  else if (tokens.length > 0 && tokens.every(t => tagsL.some(tag => tag.includes(t)))) {
    consider(0.4, 'tag_tokens');
  }

  if (catL === q) consider(0.5, 'category_exact');
  else if (catL.includes(q)) consider(0.4, 'category');

  if (descL.includes(q)) consider(0.25, 'description');
  else if (tokens.some(t => descL.includes(t))) consider(0.18, 'description_token');

  if (channelL && channelL.includes(q)) consider(0.15, 'channel');

  // Weighted token coverage: title matches count 3x, tags 2x, rest 1x.
  let coverageWeight = 0;
  for (const t of tokens) {
    let w = 0;
    if (titleWords.includes(t) || titleWords.some(word => word.startsWith(t))) w = 3;
    else if (tagsL.some(tag => tag.includes(t))) w = 2;
    else if (catL.includes(t) || descL.includes(t) || (channelL && channelL.includes(t))) w = 1;
    coverageWeight += w;
  }
  const coverage = tokens.length > 0 ? clamp01(coverageWeight / (tokens.length * 3)) : 0;

  const relevance = clamp01(best + 0.15 * coverage);
  return { relevance, coverage, matchedField };
}

/**
 * Search ranking: relevance dominates (squared to widen the gap between
 * strong and weak matches), with engagement, freshness and popularity as
 * tie-breaking context. A relevant video beats a popular irrelevant one.
 */
export function calculateSearchScore(
  video: VideoDoc,
  query: string,
  ctx: RankingContext
): SearchRelevance & { score: number } {
  const channel = ctx.channelIndex.get(video.channelId);
  const { relevance, coverage, matchedField } = calculateSearchRelevance(
    video,
    query,
    channel?.name
  );
  const score =
    100 *
    (0.70 * relevance * relevance +
      0.15 * calculateEngagementScore(video) +
      0.08 * calculateFreshnessScore(video, ctx.now) +
      0.07 * calculatePopularityScore(video));
  return { relevance, coverage, matchedField, score };
}
