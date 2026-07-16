import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, QrCode, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi } from '../services/auth.service';
import { useAuthStore } from '../stores/authStore';

export function TwoFactorSettings() {
  const { t } = useTranslation();
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const queryClient = useQueryClient();

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const is2FAEnabled = profile?.user?.isTwoFactorEnabled || false;

  const generateMutation = useMutation({
    mutationFn: () => authApi.generate2fa(),
    onSuccess: (res) => {
      setQrCodeDataUrl(res.data.qrCodeDataUrl);
    },
    onError: () => {
      toast.error(
        t(
          'settings.security.2fa.generate_error',
          'Failed to generate 2FA secret',
        ),
      );
    },
  });

  const enableMutation = useMutation({
    mutationFn: (code: string) => authApi.enable2fa({ code }),
    onSuccess: () => {
      toast.success(
        t(
          'settings.security.2fa.enable_success',
          'Two-Factor Authentication enabled!',
        ),
      );
      setQrCodeDataUrl(null);
      setVerificationCode('');
      if (profile?.user) {
        setProfile({
          ...profile,
          user: { ...profile.user, isTwoFactorEnabled: true },
        });
      }
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
    },
    onError: () => {
      toast.error(
        t('settings.security.2fa.invalid_code', 'Invalid verification code'),
      );
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => authApi.disable2fa(),
    onSuccess: () => {
      toast.success(
        t(
          'settings.security.2fa.disable_success',
          'Two-Factor Authentication disabled',
        ),
      );
      if (profile?.user) {
        setProfile({
          ...profile,
          user: { ...profile.user, isTwoFactorEnabled: false },
        });
      }
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
    },
    onError: () => {
      toast.error(
        t('settings.security.2fa.disable_error', 'Failed to disable 2FA'),
      );
    },
  });

  const handleEnableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.length === 6) {
      enableMutation.mutate(verificationCode);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          {is2FAEnabled ? (
            <ShieldCheck size={20} className="text-green-400" />
          ) : (
            <ShieldAlert size={20} className="text-gray-300" />
          )}
        </div>
        <div>
          <h3 className="font-bold text-white text-lg tracking-tight">
            {t(
              'settings.security.2fa.title',
              'Two-Factor Authentication (TOTP)',
            )}
          </h3>
          <p className="text-xs text-gray-300">
            {is2FAEnabled
              ? t(
                  'settings.security.2fa.status_enabled',
                  'Your account is secured with 2FA.',
                )
              : t(
                  'settings.security.2fa.status_disabled',
                  'Protect your account by enabling 2FA.',
                )}
          </p>
        </div>
      </div>

      {!is2FAEnabled && !qrCodeDataUrl && (
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="px-5 py-2.5 bg-blue-500/10 text-blue-400 rounded-xl font-bold text-xs uppercase tracking-wide hover:bg-blue-500/20 transition-colors flex items-center gap-2"
        >
          {generateMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <QrCode size={16} />
          )}
          {t('settings.security.2fa.setup_btn', 'Set Up Authenticator App')}
        </button>
      )}

      {qrCodeDataUrl && !is2FAEnabled && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-6 space-y-4">
          <p className="text-sm text-gray-300 font-medium">
            {t(
              'settings.security.2fa.instructions',
              'Scan this QR code with an authenticator app (like Google Authenticator or Authy), then enter the 6-digit code below.',
            )}
          </p>
          <div className="bg-white inline-block p-4 rounded-xl">
            <img src={qrCodeDataUrl} alt="2FA QR Code" className="w-48 h-48" />
          </div>

          <form onSubmit={handleEnableSubmit} className="flex gap-3 max-w-sm">
            <input
              type="text"
              maxLength={6}
              value={verificationCode}
              onChange={(e) =>
                setVerificationCode(e.target.value.replace(/\D/g, ''))
              }
              placeholder="000000"
              className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-2 py-1 text-white text-center tracking-[0.5em] font-mono focus:border-blue-500/50 outline-none"
            />
            <button
              type="submit"
              disabled={
                verificationCode.length !== 6 || enableMutation.isPending
              }
              className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 transition-colors"
            >
              {enableMutation.isPending ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                t('settings.security.2fa.verify_btn', 'Verify')
              )}
            </button>
          </form>
        </div>
      )}

      {is2FAEnabled && (
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                t(
                  'settings.security.2fa.confirm_disable',
                  'Are you sure you want to disable 2FA? This will make your account less secure.',
                ),
              )
            ) {
              disableMutation.mutate();
            }
          }}
          disabled={disableMutation.isPending}
          className="px-5 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-xs uppercase tracking-wide hover:bg-red-500 hover:text-white transition-colors"
        >
          {disableMutation.isPending
            ? t('settings.security.2fa.disabling', 'Disabling...')
            : t('settings.security.2fa.disable_btn', 'Disable 2FA')}
        </button>
      )}
    </div>
  );
}
