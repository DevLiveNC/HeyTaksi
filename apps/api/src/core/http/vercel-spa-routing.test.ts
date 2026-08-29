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

describe('SPA API proxy', () => {
  const sources = (['admin', 'passenger', 'driver'] as const).map((app) => ({
    app,
    source: readFileSync(join(repoRoot, 'apps', app, 'api', 'index.js'), 'utf8'),
  }));

  it('keeps the three frontend proxies identical', () => {
    expect(sources[0]?.source).toBe(sources[1]?.source);
    expect(sources[0]?.source).toBe(sources[2]?.source);
  });

  it.each(sources)('$app strips encoding headers and catches upstream fetch failures', ({ source }) => {
    expect(source).toMatch(/content-encoding/);
    expect(source).toMatch(/accept-encoding/);
    expect(source).toMatch(/duplex/);
    expect(source).toMatch(/API_UNREACHABLE/);
    expect(source).toMatch(/try \{/);
    expect(source).toMatch(/catch \{/);
  });
});
