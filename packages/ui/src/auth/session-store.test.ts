import { describe, expect, it, vi } from 'vitest';
import { describeDevice, persistKeyedStorage, readLocal, syncKeyedStorage } from './session-store';

function memoryWindow(overrides: Record<string, unknown> = {}) {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile Safari' },
    crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
    location: { protocol: 'https:', hostname: 'example.test', port: '' },
    ...overrides,
  } as unknown as Window;
}

describe('session-store', () => {
  it('web cihazını mobil user-agent ile adlandırır', () => {
    const device = describeDevice(memoryWindow());
    expect(device.platform).toBe('web');
    expect(device.name).toBe('Mobil web');
    expect(device.id).toMatch(/11111111/);
  });

  it('Capacitor android platformunu cihaz kaydına yazar', () => {
    const win = memoryWindow({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    });
    expect(describeDevice(win)).toMatchObject({ platform: 'android', name: 'Android' });
  });

  it('native Preferences boşken localStorage değerini yukarı taşır', async () => {
    const prefs = {
      store: new Map<string, string>(),
      async get({ key }: { key: string }) {
        return { value: this.store.get(key) ?? null };
      },
      async set({ key, value }: { key: string; value: string }) {
        this.store.set(key, value);
      },
      async remove({ key }: { key: string }) {
        this.store.delete(key);
      },
    };
    const win = memoryWindow({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { Preferences: prefs } },
    });
    persistKeyedStorage('heytaksi.session', '{"ok":true}', win);
    expect(readLocal('heytaksi.session', win)).toBe('{"ok":true}');
    await Promise.resolve();
    expect(prefs.store.get('heytaksi.session')).toBe('{"ok":true}');
  });

  it('Preferences dolu localStorage boşken oturumu geri yükler', async () => {
    const prefs = {
      async get() {
        return { value: '{"accessToken":"x"}' };
      },
      set: vi.fn(),
      remove: vi.fn(),
    };
    const win = memoryWindow({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { Preferences: prefs } },
    });
    await syncKeyedStorage('heytaksi.passenger.session', win);
    expect(readLocal('heytaksi.passenger.session', win)).toBe('{"accessToken":"x"}');
  });
});
