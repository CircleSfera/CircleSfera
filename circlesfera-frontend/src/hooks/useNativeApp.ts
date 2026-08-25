import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSecurityStore } from '../stores/securityStore';

export function useNativeApp() {
  const navigate = useNavigate();

  useEffect(() => {
    const initNativeFeatures = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        // Set Status Bar to dark mode style (white text, transparent background)
        await StatusBar.setStyle({ style: Style.Dark });
        // The overlay only works reliably on iOS, but we can try it globally
        if (Capacitor.getPlatform() === 'ios') {
          await StatusBar.setOverlaysWebView({ overlay: true });
        }
      } catch (err) {
        console.warn('StatusBar not available', err);
      }

      try {
        // Hide splash screen once React has mounted
        await SplashScreen.hide();
      } catch (err) {
        console.warn('SplashScreen not available', err);
      }

      try {
        if (Capacitor.getPlatform() === 'ios') {
          await Keyboard.setAccessoryBarVisible({ isVisible: false });
        }
      } catch (err) {
        console.warn('Keyboard not available', err);
      }

      // Universal Links / Deep Linking listener
      App.addListener('appUrlOpen', (event) => {
        // Extract the path from the URL
        const domain = 'circlesfera.com';
        const url = new URL(event.url);

        // Ensure it's our domain (or handle all if needed)
        if (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) {
          // Navigate to the internal path
          navigate(url.pathname + url.search + url.hash);
        }
      }).catch((err) => {
        console.warn('App URL Open listener failed to attach', err);
      });

      // Biometric App Lock listener
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          const state = useSecurityStore.getState();
          if (state.isBiometricEnabled) {
            state.setLocked(true);
          }
        }
      }).catch((err) => {
        console.warn('App State listener failed to attach', err);
      });
    };

    initNativeFeatures();
  }, [navigate]);
}
