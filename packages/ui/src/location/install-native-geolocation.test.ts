import { describe, expect, it, vi } from 'vitest';
import { installNativeGeolocation } from './install-native-geolocation';

describe('installNativeGeolocation', () => {
  it('Capacitor yokken navigator.geolocation’a dokunmaz', () => {
    const geo = { getCurrentPosition: vi.fn() };
    const win = {
      navigator: { geolocation: geo },
      Capacitor: undefined,
    } as unknown as Window;
    expect(installNativeGeolocation(win)).toBe(false);
    expect(win.navigator.geolocation).toBe(geo);
  });

  it('native eklentiyi getCurrentPosition köprüsüne bağlar', async () => {
    const plugin = {
      requestPermissions: vi.fn(async () => ({ location: 'granted' })),
      getCurrentPosition: vi.fn(async () => ({
        timestamp: 1,
        coords: { latitude: 35.18, longitude: 33.38, accuracy: 8 },
      })),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    const win = {
      navigator: {},
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: { Geolocation: plugin },
      },
    } as unknown as Window;
    expect(installNativeGeolocation(win)).toBe(true);
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      win.navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('geo failed')));
    });
    expect(position.coords.latitude).toBe(35.18);
    expect(plugin.requestPermissions).toHaveBeenCalled();
  });
});
