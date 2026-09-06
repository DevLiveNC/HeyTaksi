import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.heytaksi.passenger',
  appName: 'Hey Taksi',
  webDir: 'dist',
  backgroundColor: '#ffcc00',
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
      backgroundColor: '#FFCC00',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#FFCC00',
    },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
