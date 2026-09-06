import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.heytaksi.driver',
  appName: 'Hey Taksi Sürücü',
  webDir: 'dist',
  backgroundColor: '#111214',
  zoomEnabled: false,
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    hostname: 'localhost',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#111214',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#111214',
    },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
