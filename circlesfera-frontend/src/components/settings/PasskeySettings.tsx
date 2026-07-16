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
      const verificationResponse = await passkeyApi.verifyRegistration(
        attestationResponse as unknown as Record<string, unknown>,
      );

      if (verificationResponse.data.verified) {
        setSuccess(true);
        fetchPasskeys(); // Refresh list
      } else {
        setError('Verification failed');
      }
    } catch (err: unknown) {
      logger.error('Passkey registration error:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Registration failed';
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
      setError('Failed to delete passkey');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden transition-all hover:shadow-2xl hover:border-blue-500/30 group">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl group-hover:scale-110 transition-transform duration-300">
            <Key className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 italic">
              {t('settings.passkey_settings.title')}
            </h3>
            <p className="text-sm text-zinc-400 dark:text-zinc-400 font-medium">
              {t('settings.passkey_settings.subtitle')}
            </p>
          </div>
        </div>
        <Shield className="w-6 h-6 text-zinc-400 dark:text-zinc-600 opacity-50 group-hover:rotate-12 transition-transform" />
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed italic">
            {t('settings.passkey_settings.desc')}
          </p>
        </div>

        {/* Registered Passkeys List */}
        {loadingPasskeys ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
          </div>
        ) : passkeys.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-zinc-400 dark:text-zinc-400 uppercase tracking-wider">
              {t('settings.passkey_settings.registered')} ({passkeys.length})
            </h4>
            {passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 transition-all hover:border-blue-500/30"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <Fingerprint className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {t('settings.passkey_settings.passkey')}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-400">
                      {t('settings.passkey_settings.added')}{' '}
                      {formatDate(passkey.createdAt)}
                    </p>
                    {passkey.transports.length > 0 && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-400 mt-0.5">
                        {passkey.transports.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(passkey.id)}
                  disabled={deletingId === passkey.id}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                  title={t('settings.passkey_settings.remove')}
                >
                  {deletingId === passkey.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl border border-red-100 dark:border-red-900/30 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/30 animate-in fade-in slide-in-from-top-2">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-semibold">
              {t('settings.passkey_settings.success')}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleRegister}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transform hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('settings.passkey_settings.initializing')}</span>
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              <span>{t('settings.passkey_settings.add_new')}</span>
            </>
          )}
        </button>
      </div>

      <div className="mt-8 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-400 font-medium border-t border-zinc-100 dark:border-zinc-800 pt-6">
        <Shield className="w-4 h-4" />
        <span>{t('settings.passkey_settings.fido')}</span>
      </div>
    </div>
  );
};

export default PasskeySettings;
