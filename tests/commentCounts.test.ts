/**
 * Regression tests for the comment-count invariant (AUD-009).
 * Run with:  npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { removedCommentCount, decrementCount } from '../server/utils/commentCounts.js';

test('parent with zero replies removes exactly one document', () => {
  const parent = { _id: 'p1' };
  const all = [parent];
  assert.equal(removedCommentCount(parent, all), 1);
});

test('parent with one reply removes two documents', () => {
  const parent = { _id: 'p1' };
  const all = [
    parent,
    { parentId: 'p1' },
  ];
  assert.equal(removedCommentCount(parent, all), 2);
});

test('parent with multiple replies removes parent plus all replies', () => {
  const parent = { _id: 'p1' };
  const all = [
    parent,
    { parentId: 'p1' },
    { parentId: 'p1' },
    { parentId: 'p1' },
    { parentId: 'other' }, // unrelated comment must not be counted
  ];
  assert.equal(removedCommentCount(parent, all), 4);
});

test('deleting a reply removes only the reply', () => {
  const reply = { _id: 'r1', parentId: 'p1' };
  const all = [{ _id: 'p1', parentId: null }, reply];
  assert.equal(removedCommentCount(reply, all), 1);
});

test('decrementCount never goes below zero', () => {
  assert.equal(decrementCount(3, 1), 2);
  assert.equal(decrementCount(1, 1), 0);
  assert.equal(decrementCount(0, 5), 0);
});
