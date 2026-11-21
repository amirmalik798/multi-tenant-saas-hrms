#!/usr/bin/env node
/*
 * Next.js 16.4.x can leave a stale development route validator under
 * .next/dev/types after routes are moved or deleted. The production validator
 * is generated separately under .next/types and remains enabled.
 *
 * Keep routes.d.ts and root-params.d.ts: next-env.d.ts may reference them.
 */
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const staleValidator = path.join(projectRoot, '.next', 'dev', 'types', 'validator.ts');

try {
  if (fs.existsSync(staleValidator)) {
    fs.rmSync(staleValidator, { force: true });
    console.log('[build] Removed stale Next.js development route validator.');
  } else {
    console.log('[build] No stale Next.js development route validator found.');
  }
} catch (error) {
  console.error(
    '[build] Could not remove the stale Next.js development route validator. ' +
      'Stop the Next.js development server and retry.',
  );
  console.error(error);
  process.exit(1);
}
