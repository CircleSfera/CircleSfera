import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { LockKeyhole } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSecurityStore } from '../../stores/securityStore';

export const AppLockScreen: React.FC = () => {
  const { t } = useTranslation();
  const isLocked = useSecurityStore((state) => state.isLocked);
  const setLocked = useSecurityStore((state) => state.setLocked);
  const isBiometricEnabled = useSecurityStore(
    (state) => state.isBiometricEnabled,
  );
  const [error, setError] = useState<string | null>(null);

  const attemptUnlock = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setLocked(false);
      return;
    }

    try {
      await NativeBiometric.verifyIdentity({
        reason: t(
          'settings.security.biometric_reason',
          'Desbloquear CircleSfera',
        ),
        title: t(
          'settings.security.biometric_title',
          'Autenticación Requerida',
        ),
        subtitle: t(
          'settings.security.biometric_subtitle',
          'Verifica tu identidad',
        ),
        description: t(
          'settings.security.biometric_description',
          'Usa FaceID o TouchID para acceder.',
        ),
      });

      setLocked(false);
      setError(null);
    } catch (err: any) {
      console.error('Biometric auth failed', err);
      // Don't unlock
      setError(
        t(
          'settings.security.biometric_failed',
          'Autenticación fallida. Inténtalo de nuevo.',
        ),
      );
    }
  }, [setLocked, t]);

  useEffect(() => {
    // If the app is locked and biometrics is enabled, attempt to unlock immediately
    if (isLocked && isBiometricEnabled) {
      attemptUnlock();
    }
  }, [isLocked, isBiometricEnabled, attemptUnlock]);

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-9999 bg-brand-dark/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 transition-all duration-300">
      <div className="bg-brand-gray/50 p-8 rounded-full border border-white/10 mb-8 shadow-2xl">
        <LockKeyhole className="w-16 h-16 text-brand-primary" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">
        {t('settings.security.app_locked_title', 'Aplicación Bloqueada')}
      </h1>
      <p className="text-white/60 text-center mb-8 max-w-sm">
        {t(
          'settings.security.app_locked_desc',
          'CircleSfera está protegida. Verifica tu identidad para continuar.',
        )}
      </p>

      {error && (
        <div className="bg-red-500/10 text-red-500 px-4 py-3 rounded-xl mb-6 text-sm border border-red-500/20 text-center max-w-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={attemptUnlock}
        className="w-full max-w-xs bg-brand-primary text-white font-medium py-4 px-6 rounded-2xl shadow-xl shadow-brand-primary/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
      >
        <LockKeyhole className="w-5 h-5" />
        {t('settings.security.unlock_button', 'Desbloquear')}
      </button>
    </div>
  );
};
