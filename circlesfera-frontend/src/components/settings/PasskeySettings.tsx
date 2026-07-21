import { startRegistration } from '@simplewebauthn/browser';
import {
  AlertCircle,
  CheckCircle,
  Fingerprint,
  Key,
  Loader2,
  Plus,
  Shield,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { passkeyApi } from '../../services';
import type { PasskeyInfo } from '../../services/passkey.service';
import { logger } from '../../utils/logger';

export const PasskeySettings: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isBiometricSupported, setIsBiometricSupported] = useState<
    boolean | null
  >(null);

  const fetchPasskeys = useCallback(async () => {
    try {
      setLoadingPasskeys(true);
      const response = await passkeyApi.listPasskeys();
      setPasskeys(response.data);
    } catch (err) {
      logger.error('Failed to fetch passkeys:', err);
    } finally {
      setLoadingPasskeys(false);
    }
  }, []);

  useEffect(() => {
    fetchPasskeys();

    // Check platform biometric capabilities
    if (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
    ) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((available) => setIsBiometricSupported(available))
        .catch(() => setIsBiometricSupported(false));
    } else {
      setIsBiometricSupported(false);
    }
  }, [fetchPasskeys]);

  const handleRegister = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // 1. Get options from server
      const optionsResponse = await passkeyApi.getRegistrationOptions();
      const options = optionsResponse.data;

      // 2. Start registration in browser
      const attestationResponse = await startRegistration({
        optionsJSON: options,
      });

      // 3. Verify on server
      await passkeyApi.verifyRegistration(
        attestationResponse as unknown as Record<string, unknown>,
      );

      setSuccess(true);
      fetchPasskeys();
    } catch (err: unknown) {
      logger.error('Passkey registration error:', err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : t(
              'settings.passkey.register_error',
              'Error al registrar la clave Passkey.',
            );
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await passkeyApi.deletePasskey(id);
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      logger.error('Failed to delete passkey:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-primary/10 rounded-2xl text-brand-primary border border-brand-primary/20">
            <Fingerprint size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-tight">
                {t('settings.passkey.title', 'Biometría y Passkeys')}
              </h3>
              {isBiometricSupported === true && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20 rounded-full">
                  Biometría Disponible
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {t(
                'settings.passkey.subtitle',
                'Inicia sesión de forma segura sin contraseña usando FaceID, TouchID o tu dispositivo.',
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRegister}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          {t('settings.passkey.add_button', 'Añadir Passkey')}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm">
          <CheckCircle size={18} className="shrink-0" />
          <span>
            {t(
              'settings.passkey.success_message',
              'Clave Passkey registrada correctamente.',
            )}
          </span>
        </div>
      )}

      {/* Registered Passkeys List */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            {t('settings.passkey.registered_keys', 'Llaves Registradas')}
          </span>
          <span className="text-xs font-bold text-gray-500">
            {passkeys.length} / 10
          </span>
        </div>

        {loadingPasskeys ? (
          <div className="p-8 flex justify-center">
            <Loader2 size={24} className="animate-spin text-gray-500" />
          </div>
        ) : passkeys.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm font-medium">
            <Key size={32} className="mx-auto mb-2 opacity-30" />
            {t(
              'settings.passkey.empty_list',
              'No tienes ninguna clave Passkey registrada todavía.',
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {passkeys.map((key) => (
              <div
                key={key.id}
                className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                    <Shield size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white font-mono">
                      Passkey ({key.credentialID ? `${key.credentialID.slice(0, 16)}...` : key.id})
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      Creado el {new Date(key.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(key.id)}
                  disabled={deletingId === key.id}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  title="Eliminar Passkey"
                >
                  {deletingId === key.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PasskeySettings;
