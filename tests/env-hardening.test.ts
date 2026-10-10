/**
 * Regression tests for AUD-016: production must refuse to boot with the known
 * default JWT secret, while development only warns.
 *
 * Run with:  npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const DEFAULT_SECRET = 'kinetix-secure-jwt-key-99182374615243';

// Import fresh so process.env changes are observed by validateEnv().
async function freshValidateEnv() {
  return import(`../server/config/env.js?ts=${Date.now()}`) as Promise<{
    validateEnv: () => void;
  }>;
}

test('production boot fails closed when JWT_SECRET is the known default', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const { validateEnv } = await freshValidateEnv();
    assert.throws(() => validateEnv(), /default|Refusing to start/i);
  } finally {
    process.env.NODE_ENV = prevEnv;
    process.env.JWT_SECRET = prevSecret;
  }
});

test('development only warns when JWT_SECRET is the known default', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const { validateEnv } = await freshValidateEnv();
    assert.doesNotThrow(() => validateEnv());
  } finally {
    process.env.NODE_ENV = prevEnv;
    process.env.JWT_SECRET = prevSecret;
  }
});

test('production boot succeeds with a strong non-default secret', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-strong-non-default-secret-value-0123456789abcdef';
    const { validateEnv } = await freshValidateEnv();
    assert.doesNotThrow(() => validateEnv());
  } finally {
    process.env.NODE_ENV = prevEnv;
    process.env.JWT_SECRET = prevSecret;
  }
});
