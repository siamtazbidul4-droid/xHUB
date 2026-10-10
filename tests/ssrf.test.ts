/**
 * Regression tests for AUD-018: outbound media target validation (SSRF / open
 * redirect hardening for the stream + download handlers).
 *
 * Run with:  npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeExternalMediaTarget } from '../server/config/urlValidation.js';

test('allows an ordinary public https CDN target', () => {
  assert.equal(isSafeExternalMediaTarget('https://cdn.example.com/media/clip.mp4'), true);
  assert.equal(isSafeExternalMediaTarget('https://commondatastorage.googleapis.com/x/a.mp4'), true);
});

test('rejects loopback IPv4 (SSRF)', () => {
  assert.equal(isSafeExternalMediaTarget('https://127.0.0.1:3111/api/health'), false);
  assert.equal(isSafeExternalMediaTarget('https://127.0.0.1/x.mp4'), false);
});

test('rejects private, link-local, CGNAT and reserved IPv4 ranges', () => {
  for (const url of [
    'https://10.0.0.5/x.mp4',
    'https://192.168.1.10/x.mp4',
    'https://172.16.5.4/x.mp4',
    'https://172.31.255.255/x.mp4',
    'https://169.254.169.254/latest/meta-data/',
    'https://100.64.0.1/x.mp4',
    'https://0.0.0.0/x.mp4',
    'https://239.1.1.1/x.mp4',
  ]) {
    assert.equal(isSafeExternalMediaTarget(url), false, `should reject: ${url}`);
  }
});

test('rejects IPv6 loopback and unique-local/link-local targets', () => {
  for (const url of [
    'https://[::1]/x.mp4',
    'https://[::]/x.mp4',
    'https://[fd00::1]/x.mp4',
    'https://[fe80::1]/x.mp4',
  ]) {
    assert.equal(isSafeExternalMediaTarget(url), false, `should reject: ${url}`);
  }
});

test('rejects internal aliases', () => {
  assert.equal(isSafeExternalMediaTarget('https://localhost/x.mp4'), false);
  assert.equal(isSafeExternalMediaTarget('https://metadata/x.mp4'), false);
  assert.equal(isSafeExternalMediaTarget('https://db.internal/x.mp4'), false);
});

test('rejects non-https schemes and credentialed URLs', () => {
  assert.equal(isSafeExternalMediaTarget('http://cdn.example.com/x.mp4'), false);
  assert.equal(isSafeExternalMediaTarget('javascript:alert(1)'), false);
  assert.equal(isSafeExternalMediaTarget('file:///etc/passwd'), false);
  assert.equal(isSafeExternalMediaTarget('https://user:pass@cdn.example.com/x.mp4'), false);
});

test('rejects non-strings and malformed values', () => {
  assert.equal(isSafeExternalMediaTarget(undefined), false);
  assert.equal(isSafeExternalMediaTarget(123), false);
  assert.equal(isSafeExternalMediaTarget('not a url'), false);
  assert.equal(isSafeExternalMediaTarget(''), false);
});
