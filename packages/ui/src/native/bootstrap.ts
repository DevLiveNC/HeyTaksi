import { detectNativeShell } from '@heytaksi/shared';
import { hydrateNativeStorage } from '../auth/session-store';
import { installNativeGeolocation } from '../location/install-native-geolocation';

export async function bootstrapNativeRuntime(
  storageKey: string,
  appearance: 'light' | 'dark' = 'light',
): Promise<void> {
  if (!detectNativeShell()) return;

  const [{ App }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
    import('@capacitor/geolocation'),
    import('@capacitor/preferences'),
  ]);

  installNativeGeolocation();
  await hydrateNativeStorage(storageKey);

  try {
    await StatusBar.setStyle({ style: appearance === 'dark' ? Style.Light : Style.Dark });
  } catch {
    /* web veya eklenti yok */
  }

  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) window.history.back();
    else void App.exitApp();
  });

  try {
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    /* native splash yok */
  }
}
