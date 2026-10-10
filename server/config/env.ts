const REQUIRED_VARS = ['JWT_SECRET'] as const;
const DEFAULT_JWT_SECRET = 'kinetix-secure-jwt-key-99182374615243';

function validateEnv() {
  const missing = REQUIRED_VARS.filter(key => !process.env[key] || process.env[key].trim() === '');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Set them in .env or export them before starting the server.`
    );
  }

  if (process.env.JWT_SECRET === DEFAULT_JWT_SECRET) {
    // A shared, publicly-known secret lets anyone forge sessions for any user.
    // Development may run on it (with a loud warning), but a production boot
    // must fail closed rather than serve with a compromised signing key.
    if (isProduction()) {
      throw new Error(
        'Refusing to start: JWT_SECRET is set to the known default value in production. ' +
        'Generate a strong random secret before starting the server.'
      );
    }
    console.warn('[config] WARNING: Using default JWT secret. Set a strong JWT_SECRET in production.');
  }

  if (!getAdminEmail()) {
    console.warn('[config] ADMIN_EMAIL is not set. The admin login endpoint will be unavailable.');
  }

  if (!getAdminPassword()) {
    console.warn('[config] ADMIN_PASSWORD is not set. The admin login endpoint will be unavailable.');
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.warn('[config] Invalid PORT value. Defaulting to 3000.');
  }
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('JWT_SECRET environment variable is required.');
  }
  return secret;
}

/**
 * Server-side administrator credentials.
 *
 * These values never leave the server. They are used exclusively by the
 * admin login endpoint to verify credentials and are never returned through
 * any API response or exposed to the client bundle.
 */
export function getAdminEmail(): string | undefined {
  const email = process.env.ADMIN_EMAIL;
  if (!email || email.trim() === '') {
    return undefined;
  }
  return email.trim();
}

export function getAdminPassword(): string | undefined {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password === '') {
    return undefined;
  }
  return password;
}

export function getPort(): number {
  const port = parseInt(process.env.PORT || '3000', 10);
  if (isNaN(port) || port < 1 || port > 65535) return 3000;
  return port;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getAppUrl(): string {
  return process.env.APP_URL || `http://localhost:${getPort()}`;
}

export { validateEnv };