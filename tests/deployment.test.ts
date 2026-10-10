/**
 * Deployment-contract regression tests (SEL-1 / Render readiness).
 *
 * These assert the package.json wiring that Render relies on, so a future edit
 * cannot silently reintroduce a start command that Node cannot execute
 * (`node server.ts` fails with ERR_MODULE_NOT_FOUND because the source imports
 * use .js specifiers pointing at .ts files).
 *
 * Run with:  npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')
) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines?: { node?: string };
};

test('start script runs the TypeScript entrypoint through a TS-capable runtime', () => {
  const start = pkg.scripts.start;
  assert.ok(start, 'package.json must define a start script');
  // Node cannot execute server.ts directly; a loader/capable runtime is required.
  assert.match(start, /(^|\s)tsx(\s|$)/, 'start must invoke tsx (or another TS runtime)');
  assert.doesNotMatch(start, /^node\s+server\.ts$/, 'start must not be bare `node server.ts`');
});

test('the runtime used by start is a production dependency', () => {
  assert.ok(pkg.dependencies.tsx, 'tsx must be a direct dependency so it is present in production');
});

test('build script produces the client bundle', () => {
  assert.match(pkg.scripts.build, /vite build/);
});

test('an engines.node constraint is declared', () => {
  assert.ok(pkg.engines?.node, 'engines.node should be declared for the deploy runtime');
});
