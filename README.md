# Kinetix Video Platform

Premium video content and creator platform with long-form playback, chunked
uploads, real creator channels, subscriptions, comments, and admin moderation.

It is a single Node/Express server that:
- serves the React SPA (built with Vite) from `dist/`,
- exposes the `/api/*` routes, and
- persists data in a local JSON file (`data/db.json`) with uploaded media under
  `uploads/`.

## Requirements

- Node.js >= 20 (developed and verified on Node 22)
- npm

## Local development

```bash
npm install
cp .env.example .env      # then fill in JWT_SECRET (see below)
npm run dev               # Express + Vite middleware on http://localhost:3000
```

`npm run dev` mounts Vite in middleware mode, so the API and the SPA are served
from the same origin with hot reload.

## Environment variables

Copy `.env.example` to `.env` and set at minimum:

| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | Yes | Signs auth tokens. Must be a strong random value (>= 32 chars). |
| `ADMIN_EMAIL` | Prod | Administrator login identity for `/api/admin/login`. |
| `ADMIN_PASSWORD` | Prod | Administrator password. Never exposed to the client. |
| `NODE_ENV` | Prod | Set to `production` on the server. |
| `PORT` | No | Defaults to `3000`. Render injects this automatically. |
| `TRUST_PROXY` | Prod (behind proxy) | Number of trusted proxy hops. Set to `1` on Render. |
| `ALLOWED_ORIGINS` | No | Extra comma-separated CORS origins (same-origin needs none). |
| `APP_URL` | No | Base URL used for self-referential links. |

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The server **fails closed** in production if `JWT_SECRET` is missing or left at
the shipped default value.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server (Express + Vite middleware). |
| `npm run build` | Builds the SPA into `dist/`. |
| `npm start` | Production server (`tsx server.ts`). |
| `npm test` | Unit tests via the Node test runner. |
| `npm run lint` | TypeScript type check (`tsc --noEmit`). |

## Deploying to Render

A `render.yaml` blueprint is included. It defines a **Web Service** with:

- Build: `npm ci && npm run build`
- Start: `npm start`
- Health check: `/api/health`
- A **persistent disk** mounted at the project working directory so `data/` and
  `uploads/` survive deploys and restarts.

Set `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` as Render environment
variables (they are declared with `sync: false` and are never stored in the
blueprint).

### Storage limitations (important)

Persistence is a local JSON file, not a managed database. As a result:

- A **persistent disk is required**; without it all data and uploads are lost on
  every deploy or restart.
- A persistent disk pins the service to a **single instance**. Do not scale
  horizontally — the JSON store and the in-process rate limiter are not
  multi-instance safe.
- The JSON store is **not transaction-safe**. Writes are serialized in-process
  and written via a temp file + atomic rename, but concurrent writers across
  processes are not supported.

## Security notes

- Passwords are hashed with bcrypt; auth uses short-lived JWTs.
- Suspended accounts lose access immediately, from the live user record.
- Administrator authorization is role-backed from the server-side record, never
  from a client-supplied field or a stale JWT claim.
- Media URLs are validated; server-side fetches/redirects reject non-HTTPS and
  loopback/private/reserved targets (SSRF hardening).
- Video bytes are served only through the authorized API routes; the static
  mount serves thumbnails only.
