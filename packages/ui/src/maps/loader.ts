let runtimeBrowserKey = '';

export function setGoogleMapsBrowserKey(key: string) {
  runtimeBrowserKey = key.trim();
}

/** Vite build anahtarı veya çalışma zamanında `/locations/maps-config` ile gelen tarayıcı anahtarı. */
export function googleMapsBrowserKey(): string {
  const fromVite = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? '';
  return runtimeBrowserKey || fromVite;
}

export function googleMapsMapId(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() ?? '';
}

export function isGoogleMapsConfigured(): boolean {
  return googleMapsBrowserKey().length >= 10;
}

const SCRIPT_ID = 'heytaksi-google-maps';
let loading: Promise<typeof google | null> | null = null;

/** Maps JavaScript API'yi bir kez yükler. Anahtar yoksa veya script başarısızsa null döner. */
export function loadGoogleMaps(apiKey = googleMapsBrowserKey()): Promise<typeof google | null> {
  if (typeof window === 'undefined' || apiKey.length < 10) return Promise.resolve(null);
  if (window.google?.maps) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const finish = () => resolve(window.google?.maps ? window.google : null);
    if (existing) {
      if (window.google?.maps) {
        finish();
        return;
      }
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener(
        'error',
        () => {
          loading = null;
          resolve(null);
        },
        { once: true },
      );
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&language=tr`;
    script.onload = finish;
    script.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return loading;
}
