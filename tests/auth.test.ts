/**
 * Authorization regression tests for AUD-003 (suspension) and AUD-004/006
 * (single role-backed admin policy).
 *
 * These tests operate entirely on the in-memory `db` structure and never call
 * db.save(), so no file is written and no existing record is altered on disk.
 * Run with:  npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { optionalAuth, optionalMediaAuth, requireAdmin, requirePlatformAdmin, AuthenticatedRequest } from '../server/auth.js';
import { db } from '../server/db.js';

// Load .env for JWT_SECRET so the suite runs with `npm test` alone. The signing
// secret is only used to mint short-lived test tokens in-process.
dotenv.config();

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('JWT_SECRET must be set to run auth tests.');
}

interface TestUser {
  _id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatar: string;
  role: 'user' | 'creator' | 'admin';
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

// Synthetic users appended to the in-memory arrays only (never persisted).
const activeUser: TestUser = {
  _id: 'test_active_user',
  email: 'active@test.local',
  passwordHash: 'x',
  name: 'Active',
  avatar: '',
  role: 'creator',
  status: 'active',
  createdAt: '', updatedAt: ''
};
const suspendedUser: TestUser = {
  ...activeUser,
  _id: 'test_suspended_user',
  email: 'suspended@test.local',
  status: 'suspended'
};
const adminUser: TestUser = {
  ...activeUser,
  _id: 'test_admin_user',
  email: 'admin@test.local',
  role: 'admin'
};

db.users.push(activeUser, suspendedUser, adminUser);

function tokenFor(userId: string): string {
  return jwt.sign({ userId }, SECRET as string, { expiresIn: '1h' });
}

function mockReq(authHeader?: string): AuthenticatedRequest {
  return { headers: authHeader ? { authorization: authHeader } : {} } as AuthenticatedRequest;
}

function mockRes() {
  const res: { statusCode: number; body: unknown; status(c: number): typeof res; json(b: unknown): typeof res } = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
  return res;
}

test('optionalAuth attaches an active user', () => {
  const req = mockReq(`Bearer ${tokenFor(activeUser._id)}`);
  let called = false;
  optionalAuth(req, mockRes() as never, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user?._id, activeUser._id);
});

test('optionalAuth does NOT attach a suspended user (AUD-003)', () => {
  const req = mockReq(`Bearer ${tokenFor(suspendedUser._id)}`);
  let called = false;
  optionalAuth(req, mockRes() as never, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user, undefined);
});

test('optionalAuth ignores an invalid token and continues as guest', () => {
  const req = mockReq('Bearer not-a-valid-token');
  let called = false;
  optionalAuth(req, mockRes() as never, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user, undefined);
});

test('requireAdmin denies an ordinary creator', () => {
  const req = mockReq(`Bearer ${tokenFor(activeUser._id)}`);
  const res = mockRes();
  let called = false;
  requireAdmin(req, res as never, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('requireAdmin allows a current administrator', () => {
  const req = mockReq(`Bearer ${tokenFor(adminUser._id)}`);
  const res = mockRes();
  let called = false;
  requireAdmin(req, res as never, () => { called = true; });
  assert.equal(called, true);
});

test('requirePlatformAdmin applies the same role-backed policy', () => {
  const creatorReq = mockReq(`Bearer ${tokenFor(activeUser._id)}`);
  const creatorRes = mockRes();
  requirePlatformAdmin(creatorReq, creatorRes as never, () => { });
  assert.equal(creatorRes.statusCode, 403);

  const adminReq = mockReq(`Bearer ${tokenFor(adminUser._id)}`);
  let called = false;
  requirePlatformAdmin(adminReq, mockRes() as never, () => { called = true; });
  assert.equal(called, true);
});

test('demotion takes effect immediately (no stale JWT role) (AUD-004)', () => {
  // Admin -> creator role change in the live data.
  adminUser.role = 'creator';
  const req = mockReq(`Bearer ${tokenFor(adminUser._id)}`);
  const res = mockRes();
  let called = false;
  requireAdmin(req, res as never, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  adminUser.role = 'admin'; // restore for any later test
});

test('requireAdmin rejects a suspended administrator (defense in depth)', () => {
  const suspendedAdmin = { ...adminUser, _id: 'test_suspended_admin', email: 'sa@test.local', role: 'admin' as const, status: 'suspended' as const };
  db.users.push(suspendedAdmin);
  const req = mockReq(`Bearer ${tokenFor(suspendedAdmin._id)}`);
  const res = mockRes();
  let called = false;
  requireAdmin(req, res as never, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

// ---------------------------------------------------------------------------
// optionalMediaAuth (PRIV-1): media elements cannot send an Authorization
// header, so a `token` query parameter is also accepted for playback/download.
// ---------------------------------------------------------------------------

function mockMediaReq(authHeader?: string, queryToken?: string): AuthenticatedRequest {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    query: queryToken ? { token: queryToken } : {}
  } as unknown as AuthenticatedRequest;
}

test('optionalMediaAuth attaches a user from a Bearer header', () => {
  const req = mockMediaReq(`Bearer ${tokenFor(activeUser._id)}`);
  let called = false;
  optionalMediaAuth(req, mockRes() as never, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user?._id, activeUser._id);
});

test('optionalMediaAuth attaches a user from a token query parameter', () => {
  const req = mockMediaReq(undefined, tokenFor(activeUser._id));
  let called = false;
  optionalMediaAuth(req, mockRes() as never, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user?._id, activeUser._id);
});

test('optionalMediaAuth does NOT attach a suspended user via query token', () => {
  const req = mockMediaReq(undefined, tokenFor(suspendedUser._id));
  let called = false;
  optionalMediaAuth(req, mockRes() as never, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user, undefined);
});

test('optionalMediaAuth continues as guest for an invalid query token', () => {
  const req = mockMediaReq(undefined, 'not-a-valid-token');
  let called = false;
  optionalMediaAuth(req, mockRes() as never, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user, undefined);
});

test('optionalMediaAuth continues as guest with no token at all', () => {
  const req = mockMediaReq();
  let called = false;
  optionalMediaAuth(req, mockRes() as never, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user, undefined);
});
