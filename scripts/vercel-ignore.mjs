#!/usr/bin/env node
/**
 * Vercel ignoreCommand: exit 0 skips the build, exit 1 proceeds.
 * Each project only rebuilds when its app, shared packages, or lockfile change.
 */
import { execSync } from 'node:child_process';

const app = process.argv[2];
if (!app) process.exit(1);

const prev = process.env.VERCEL_GIT_PREVIOUS_SHA;
const curr = process.env.VERCEL_GIT_COMMIT_SHA;
if (!prev || !curr || prev === curr) process.exit(1);

const paths = [
  `apps/${app}`,
  'packages/shared',
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
];

if (app !== 'api') {
  paths.push('packages/ui', 'apps/spa-vite-build.ts');
  if (app === 'driver') paths.push('apps/passenger/src/styles');
}

try {
  execSync(`git diff --quiet ${prev} ${curr} -- ${paths.join(' ')}`, { stdio: 'ignore' });
  console.log(`No relevant changes for ${app}; skipping Vercel build.`);
  process.exit(0);
} catch {
  process.exit(1);
}
