import type { CapacitorConfig } from '@capacitor/cli';

import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

// The plugins built into the Android app: every plugin but push, which would
// bring Firebase in. The Android app has no push; on Android the web app in
// the browser receives it. A test checks this list against the plugins
// installed.
export const ANDROID_PLUGINS = [
  '@capacitor/app',
  '@capacitor/camera',
  '@capacitor/filesystem',
  '@capacitor/haptics',
  '@capacitor/keyboard',
  '@capacitor/share',
  '@capacitor/splash-screen',
  '@capacitor/status-bar',
  '@capgo/capacitor-native-biometric',
];

const config: CapacitorConfig = {
  appId: 'com.circlesfera.app',
  appName: 'CircleSfera',
  webDir: 'dist',
  android: {
    includePlugins: ANDROID_PLUGINS,
  },
  server: {
    allowNavigation: ['circlesfera.com', '*.circlesfera.com'],
  },
  plugins: {
    CapacitorCookies: {
      enabled: true,
    },
    CapacitorHttp: {
      enabled: true,
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: '#030303',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
