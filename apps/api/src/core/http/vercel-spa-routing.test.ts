import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../../');

describe('frontend Vercel SPA routing', () => {
  it.each(['admin', 'passenger', 'driver'] as const)('%s does not rewrite /api to index.html', (app) => {
    const config = JSON.parse(readFileSync(join(repoRoot, 'apps', app, 'vercel.json'), 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    expect(config.rewrites.some((rule) => rule.source.includes('(?!api/') && rule.destination === '/index.html')).toBe(true);
    expect(config.rewrites.some((rule) => rule.source === '/(.*)' && rule.destination === '/index.html')).toBe(false);
  });
});
