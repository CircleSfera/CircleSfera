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
  // Turning it off takes a current code as well: the form that asks for it
  // opens from the button.
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const is2FAEnabled = profile?.user?.isTwoFactorEnabled || false;

  const generateMutation = useMutation({
    mutationFn: () => authApi.generate2fa(),
    onSuccess: (res) => {
      setQrCodeDataUrl(res.data.qrCodeDataUrl);
    },
    onError: () => {
      toast.error(t('settings.security.2fa.generate_error'));
    },
  });

  const enableMutation = useMutation({
    mutationFn: (code: string) => authApi.enable2fa({ code }),
    onSuccess: () => {
      toast.success(t('settings.security.2fa.enable_success'));
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
      toast.error(t('settings.security.2fa.invalid_code'));
    },
  });

  const disableMutation = useMutation({
    mutationFn: (code: string) => authApi.disable2fa({ code }),
    onSuccess: () => {
      toast.success(t('settings.security.2fa.disable_success'));
      setIsDisabling(false);
      setDisableCode('');
      if (profile?.user) {
        setProfile({
          ...profile,
          user: { ...profile.user, isTwoFactorEnabled: false },
        });
      }
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
    },
    onError: (error: { response?: { status?: number } }) => {
      // The server answers 400 to a code that is not the current one.
      toast.error(
        error?.response?.status === 400
          ? t('settings.security.2fa.invalid_code')
          : t('settings.security.2fa.disable_error'),
      );
    },
  });

  const handleDisableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disableCode.length === 6) {
      disableMutation.mutate(disableCode);
    }
  };

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
            {t('settings.security.2fa.title')}
          </h3>
          <p className="text-xs text-gray-300">
            {is2FAEnabled
              ? t('settings.security.2fa.status_enabled')
              : t('settings.security.2fa.status_disabled')}
          </p>
        </div>
      </div>

      {!is2FAEnabled && !qrCodeDataUrl && (
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="min-h-11 px-5 bg-brand-blue/10 text-brand-blue rounded-full font-semibold text-sm hover:bg-brand-blue/20 transition-colors flex items-center gap-2"
        >
          {generateMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <QrCode size={16} />
          )}
          {t('settings.security.2fa.setup_btn')}
        </button>
      )}

      {qrCodeDataUrl && !is2FAEnabled && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-6 space-y-4">
          <p className="text-sm text-gray-300 font-medium">
            {t('settings.security.2fa.instructions')}
          </p>
          <div className="bg-white inline-block p-4 rounded-xl">
            <img
              src={qrCodeDataUrl}
              alt={t('settings.security.2fa.qr_alt')}
              className="w-48 h-48"
            />
          </div>

          <form onSubmit={handleEnableSubmit} className="flex gap-3 max-w-sm">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={verificationCode}
              onChange={(e) =>
                setVerificationCode(e.target.value.replace(/\D/g, ''))
              }
              placeholder="000000"
              aria-label={t('settings.security.2fa.code_label')}
              className="flex-1 min-w-0 min-h-12 bg-zinc-900/50 border border-white/10 rounded-xl px-2 text-base text-white text-center tracking-[0.5em] font-mono focus:border-blue-500/50 outline-none"
            />
            <button
              type="submit"
              disabled={
                verificationCode.length !== 6 || enableMutation.isPending
              }
              className="min-h-12 px-5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 transition-colors"
            >
              {enableMutation.isPending ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                t('settings.security.2fa.verify_btn')
              )}
            </button>
          </form>
        </div>
      )}

      {is2FAEnabled && !isDisabling && (
        <button
          type="button"
          onClick={() => setIsDisabling(true)}
          className="min-h-11 px-5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-xs uppercase tracking-wide hover:bg-red-500 hover:text-white transition-colors"
        >
          {t('settings.security.2fa.disable_btn')}
        </button>
      )}

      {is2FAEnabled && isDisabling && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-4">
          <p className="text-sm text-gray-300 font-medium">
            {t('settings.security.2fa.confirm_disable')}{' '}
            {t('settings.security.2fa.disable_instructions')}
          </p>
          <form onSubmit={handleDisableSubmit} className="flex gap-3 max-w-sm">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={disableCode}
              onChange={(e) =>
                setDisableCode(e.target.value.replace(/\D/g, ''))
              }
              placeholder="000000"
              aria-label={t('settings.security.2fa.code_label')}
              className="flex-1 min-w-0 min-h-12 bg-zinc-900/50 border border-white/10 rounded-xl px-2 text-base text-white text-center tracking-[0.5em] font-mono focus:border-blue-500/50 outline-none"
            />
            <button
              type="submit"
              disabled={disableCode.length !== 6 || disableMutation.isPending}
              className="min-h-12 px-5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors"
            >
              {disableMutation.isPending
                ? t('settings.security.2fa.disabling')
                : t('settings.security.2fa.disable_btn')}
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              setIsDisabling(false);
              setDisableCode('');
            }}
            className="min-h-11 px-4 text-sm font-semibold text-gray-300 hover:text-white rounded-full"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
