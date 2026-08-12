import { useMutation } from '@tanstack/react-query';
import { Copy, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import logoSrc from '../assets/logo.png';
import { adminTabPath, getAdminHomeTab } from '../components/admin/adminNav';
import { Button } from '../components/ui';
import { adminAuthApi } from '../services/admin-auth.service';
import { useAdminAuthStore } from '../stores/adminAuthStore';

type Step = 'credentials' | 'mfa' | 'mfa-setup';

/**
 * Admin Panel login — same visual language as platform Login (modal-glass),
 * distinct copy/flow for staff auth.
 */
export default function AdminPanelLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAdmin = useAdminAuthStore((s) => s.setAdmin);
  const setAuthenticated = useAdminAuthStore((s) => s.setAuthenticated);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('credentials');
  const [mfaToken, setMfaToken] = useState('');
  const [secret, setSecret] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const finishLogin = async () => {
    setAuthenticated();
    const { data } = await adminAuthApi.me();
    setAdmin(data);
    const homeTab = getAdminHomeTab((key) => {
      if (data.roles.includes('SUPER_ADMIN')) return true;
      if (data.permissions.includes('admins.manage')) return true;
      return data.permissions.includes(key);
    });
    navigate(adminTabPath(homeTab), { replace: true });
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast.success(t('adminPanel.login.secret_copied', 'Secret copied'));
    } catch {
      toast.error(t('adminPanel.login.secret_copy_failed', 'Could not copy'));
    }
  };

  const loginMutation = useMutation({
    mutationFn: () => adminAuthApi.login(email.trim(), password),
    onSuccess: async ({ data }) => {
      setError(null);
      if (data.status === 'OK') {
        await finishLogin();
        return;
      }
      if (data.status === 'MFA_REQUIRED') {
        setMfaToken(data.mfaToken);
        setStep('mfa');
        return;
      }
      if (data.status === 'MFA_SETUP_REQUIRED') {
        setMfaToken(data.mfaToken);
        setSecret(data.secret);
        setQrCodeDataUrl(data.qrCodeDataUrl || '');
        setStep('mfa-setup');
      }
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const apiMessage = err?.response?.data?.message;
      if (status >= 500) {
        setError(
          t(
            'adminPanel.login.server_error',
            'Server error. Try again in a moment.',
          ),
        );
        return;
      }
      setError(
        apiMessage || t('adminPanel.login.invalid', 'Invalid credentials'),
      );
    },
  });

  const mfaMutation = useMutation({
    mutationFn: () => adminAuthApi.verifyMfa(mfaToken, code.trim()),
    onSuccess: async () => {
      setError(null);
      await finishLogin();
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const apiMessage = err?.response?.data?.message;
      if (status >= 500) {
        setError(
          t(
            'adminPanel.login.server_error',
            'Server error. Try again in a moment.',
          ),
        );
        return;
      }
      setError(
        apiMessage || t('adminPanel.login.invalid_mfa', 'Invalid MFA code'),
      );
    },
  });

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate();
  };

  const handleMfaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mfaMutation.mutate();
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="modal-glass p-4 rounded-xl w-full max-w-sm relative overflow-hidden group border border-white/5 shadow-2xl backdrop-blur-2xl">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue opacity-90" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-primary/20 rounded-full blur-3xl group-hover:bg-brand-primary/30 transition-colors duration-700" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-secondary/20 rounded-full blur-3xl group-hover:bg-brand-secondary/30 transition-colors duration-700" />

        <div className="relative z-10 flex flex-col items-center mb-4 pt-2">
          <img src={logoSrc} alt="CircleSfera" className="h-10 w-auto mb-3" />
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-primary/15 border border-brand-primary/25 mb-3">
            <ShieldCheck size={12} className="text-brand-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">
              {t('adminPanel.title', 'Admin Panel')}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-black text-center tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
            {t('adminPanel.login.heading', 'Administrative access')}
          </h1>
          <p className="text-gray-500 text-center font-bold mt-2 tracking-wide uppercase text-xs">
            {t('adminPanel.login.subtitle', 'Authorized staff only')}
          </p>
        </div>

        {step === 'credentials' && (
          <form
            onSubmit={handleCredentialsSubmit}
            className="space-y-3 sm:space-y-4 relative z-10"
          >
            <div>
              <label
                htmlFor="admin-email"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 px-1"
              >
                {t('adminPanel.login.email', 'Email')}
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="input-glass w-full px-4 rounded-xl text-white placeholder-gray-600 text-sm"
                style={{ height: 'var(--input-height-standard, 48px)' }}
                placeholder={t(
                  'adminPanel.login.email_placeholder',
                  'admin@circlesfera.com',
                )}
              />
            </div>
            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 px-1"
              >
                {t('adminPanel.login.password', 'Password')}
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input-glass w-full px-4 rounded-xl text-white placeholder-gray-600 text-sm"
                style={{ height: 'var(--input-height-standard, 48px)' }}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                variant="white"
                size="lg"
                isLoading={loginMutation.isPending}
                disabled={loginMutation.isPending || !email || !password}
                className="w-full font-black text-sm tracking-wide"
              >
                {t('adminPanel.login.continue', 'Continue')}
              </Button>
            </div>
          </form>
        )}

        {(step === 'mfa' || step === 'mfa-setup') && (
          <form
            onSubmit={handleMfaSubmit}
            className="space-y-3 sm:space-y-4 relative z-10"
          >
            {step === 'mfa-setup' && (
              <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-3">
                <p className="text-xs text-white/70 font-medium leading-relaxed">
                  {t(
                    'adminPanel.login.mfa_setup',
                    'Install an authenticator app (Google Authenticator, Authy, 1Password…). Scan the QR or enter the secret, then type the 6-digit code.',
                  )}
                </p>
                {qrCodeDataUrl && (
                  <div className="flex justify-center">
                    <div className="bg-white p-2.5 rounded-xl">
                      <img
                        src={qrCodeDataUrl}
                        alt={t(
                          'adminPanel.login.mfa_qr_alt',
                          'Authenticator QR code',
                        )}
                        className="w-44 h-44"
                      />
                    </div>
                  </div>
                )}
                {secret && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 text-center">
                      {t('adminPanel.login.manual_secret', 'Manual secret')}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-xs font-mono text-brand-primary text-center tracking-wider break-all">
                        {secret}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copySecret()}
                        className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white shrink-0"
                        aria-label={t(
                          'adminPanel.login.copy_secret',
                          'Copy secret',
                        )}
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <label
                htmlFor="admin-mfa"
                className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 px-1"
              >
                {t('adminPanel.login.mfa_code', 'Authenticator code')}
              </label>
              <input
                id="admin-mfa"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg focus:bg-white/10 focus:border-brand-primary/50 transition-all text-white placeholder-gray-600 outline-none text-base tracking-[0.5em] font-mono text-center shadow-[0_0_15px_rgba(255,255,255,0.02)]"
                placeholder="000000"
              />
              <p className="text-xs text-gray-500 mt-2 text-center">
                {t(
                  'adminPanel.login.mfa_hint',
                  'Enter the 6-digit code from your authenticator app.',
                )}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="white"
              size="lg"
              isLoading={mfaMutation.isPending}
              disabled={mfaMutation.isPending || code.trim().length < 6}
              className="w-full font-black text-sm tracking-wide"
            >
              {t('adminPanel.login.verify', 'Verify')}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setCode('');
                setError(null);
              }}
              className="w-full text-xs text-gray-500 hover:text-white transition-colors uppercase tracking-wide font-bold pt-1"
            >
              {t('adminPanel.login.back', 'Back')}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-gray-600 text-xs font-medium relative z-10">
          {t('adminPanel.login.footer', 'Protected administrative system')}
        </p>
      </div>
    </div>
  );
}
