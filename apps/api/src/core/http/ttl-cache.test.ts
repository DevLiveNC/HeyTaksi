import { describe, expect, it } from 'vitest';
import { TtlCache } from './ttl-cache.js';

describe('TtlCache', () => {
  it('returns stored values until they expire', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', 'one');
    expect(cache.get('a')).toBe('one');
  });

  it('evicts expired entries', () => {
    const cache = new TtlCache<string>(-1);
    cache.set('a', 'one');
    expect(cache.get('a')).toBeUndefined();
  });

  it('drops the oldest entry when full', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});
