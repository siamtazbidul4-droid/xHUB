/**
 * Pure helper for the comment-count invariant (AUD-009).
 *
 * Kept in a standalone module so the counting rule can be unit-tested without
 * booting Express or touching the JSON store.
 */

/**
 * Number of comment documents that are physically removed when deleting
 * `comment`: the comment itself plus every direct reply whose `parentId`
 * points at it. The video's `commentsCount` must be reduced by exactly this
 * amount and never below zero.
 */
export function removedCommentCount(
  comment: { _id: string },
  allComments: Array<{ _id?: string; parentId?: string | null; videoId?: string }>
): number {
  const directReplies = allComments.filter(c => c.parentId === comment._id).length;
  return 1 + directReplies;
}

/** Apply a removal to a running counter, clamped at zero. */
export function decrementCount(current: number, removed: number): number {
  return Math.max(0, current - removed);
}
