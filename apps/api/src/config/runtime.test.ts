import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isVercelRuntime, shouldServeApiDocs } from './runtime.js';

const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../app.ts'), 'utf8');

describe('runtime flags', () => {
  it('serves docs locally and skips them on Vercel', () => {
    expect(isVercelRuntime({})).toBe(false);
    expect(shouldServeApiDocs({})).toBe(true);
    expect(isVercelRuntime({ VERCEL: '1' })).toBe(true);
    expect(shouldServeApiDocs({ VERCEL: '1' })).toBe(false);
  });

  it('gates swagger-ui behind shouldServeApiDocs in the API app', () => {
    expect(appSource).toContain('shouldServeApiDocs()');
    expect(appSource).toContain("pluginTimeout: isVercelRuntime() ? 25_000 : 10_000");
  });
});

