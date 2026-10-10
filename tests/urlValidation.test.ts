/**
 * Focused regression tests for the security and integrity fixes (AUD-017).
 *
 * Run with:  npm test
 * Uses the built-in node:test runner executed through tsx — no extra deps.
 *
 * These tests exercise pure logic (no server boot, no network, no disk writes).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaUrl, isValidMediaUrl } from '../server/config/urlValidation.js';

test('video: accepts local upload paths', () => {
  assert.equal(validateMediaUrl('/uploads/videos/1699999999_ab12cde.mp4', 'video'),
    '/uploads/videos/1699999999_ab12cde.mp4');
});

test('video: rejects an upload path for the wrong asset kind', () => {
  assert.equal(validateMediaUrl('/uploads/thumbnails/pic.png', 'video'), null);
  assert.equal(validateMediaUrl('/uploads/videos/clip.mp4', 'thumbnail'), null);
});

test('video: rejects traversal and nested local paths', () => {
  assert.equal(validateMediaUrl('/uploads/videos/../../etc/passwd', 'video'), null);
  assert.equal(validateMediaUrl('/uploads/videos/sub/clip.mp4', 'video'), null);
  assert.equal(validateMediaUrl('/uploads/videos/..%2F..%2Fapp.js', 'video'), null);
});

test('video: accepts absolute https sources (CDN support preserved)', () => {
  const ok = validateMediaUrl('https://cdn.example.com/media/clip.mp4', 'video');
  assert.equal(ok, 'https://cdn.example.com/media/clip.mp4');
});

test('video: rejects dangerous and unsupported schemes', () => {
  const bad = [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'http://insecure.example.com/clip.mp4', // mixed content / MITM
    '//evil.example.com/clip.mp4',          // protocol-relative
    'not a url at all',
    '',
    '   ',
  ];
  for (const value of bad) {
    assert.equal(validateMediaUrl(value, 'video'), null, `should reject: ${value}`);
  }
});

test('thumbnail: accepts https and rejects non-strings', () => {
  assert.equal(validateMediaUrl('https://img.example.com/a.png', 'thumbnail'),
    'https://img.example.com/a.png');
  assert.equal(validateMediaUrl(undefined as unknown, 'thumbnail'), null);
  assert.equal(validateMediaUrl(123 as unknown, 'thumbnail'), null);
});

test('media url: embedded credentials are rejected', () => {
  assert.equal(validateMediaUrl('https://user:pass@example.com/a.mp4', 'video'), null);
});

test('isValidMediaUrl mirrors validateMediaUrl', () => {
  assert.equal(isValidMediaUrl('/uploads/videos/a.mp4', 'video'), true);
  assert.equal(isValidMediaUrl('javascript:alert(1)', 'video'), false);
});
