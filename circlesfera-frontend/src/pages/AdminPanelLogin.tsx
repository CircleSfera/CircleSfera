import { useMutation } from '@tanstack/react-query';
import { Copy, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import logoSrc from '../assets/logo.png';
import { adminTabPath, getAdminHomeTab } from '../components/admin/adminNav';
import { Button } from '../components/ui';
import { adminAuthApi } from '../services/admin-auth.service';
import { useAdminAuthStore } from '../stores/adminAuthStore';
import { isBackofficeHost } from '../utils/adminPanel';
import { apiErrorMessage, apiErrorStatus } from '../utils/apiErrorMessage';

type Step = 'credentials' | 'enrol' | 'mfa' | 'mfa-setup';

// Admin Panel login — same visual language as platform Login (modal-glass),
// Distinct copy/flow for staff auth.
export default function AdminPanelLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAdmin = useAdminAuthStore((s) => s.setAdmin);
  // The token of the set-up link sent to the staff email. It comes after a
  // #, so it never reaches a server; it is kept in memory and taken off the
  // address so it stays out of the history.
  const [linkProof] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('enrol') ?? '',
  );
  useEffect(() => {
    if (window.location.hash.includes('enrol=')) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
  }, []);
  const [proof, setProof] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('credentials');
  const [mfaToken, setMfaToken] = useState('');
  const [secret, setSecret] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mfaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'mfa' || step === 'mfa-setup') {
      // Focus the input when entering the MFA step
      setTimeout(() => {
        mfaInputRef.current?.focus();
      }, 100);
    }
  }, [step]);

  // The session counts as signed in once the staff profile has loaded;
  // setAdmin records both.
  const finishLogin = async () => {
    const { data } = await adminAuthApi.me();
    setAdmin(data);
    const homeTab = getAdminHomeTab((key) => {
      if (data.roles.includes('SUPER_ADMIN')) return true;
      if (data.permissions.includes('admins.manage')) return true;
      return data.permissions.includes(key);
    });
    // The Backoffice has its own home; the Admin Panel opens on a section.
    navigate(isBackofficeHost() ? '/' : adminTabPath(homeTab), {
      replace: true,
    });
  };

  // Only reachable from the copy button, which is shown with a secret.
  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success(t('adminPanel.login.secret_copied'));
    } catch {
      toast.error(t('adminPanel.login.secret_copy_failed'));
    }
  };

  const loginMutation = useMutation({
    mutationFn: () => adminAuthApi.login(email.trim(), password),
    onSuccess: ({ data }) => {
      setError(null);
      if (data.status === 'MFA_REQUIRED') {
        setMfaToken(data.mfaToken);
        setStep('mfa');
        return;
      }
      // No authenticator yet: the link's proof goes at once; without one,
      // the set-up code is asked for.
      setMfaToken(data.mfaToken);
      setStep('enrol');
      if (linkProof) enrolMutation.mutate({ token: data.mfaToken, linkProof });
    },
    onError: (err: unknown) => {
      // A refused sign-in is wrong credentials, except 403: the account is
      // locked after too many failed attempts, whatever is typed now.
      const refusedKey =
        apiErrorStatus(err) === 403
          ? 'adminPanel.login.locked'
          : 'adminPanel.login.invalid';
      setError(apiErrorMessage(err, t, refusedKey, { signIn: true }));
    },
  });

  const enrolMutation = useMutation({
    mutationFn: (args: { token: string; linkProof?: string }) =>
      adminAuthApi.enrol(args.token, (args.linkProof ?? proof).trim()),
    onSuccess: ({ data }) => {
      setError(null);
      setMfaToken(data.mfaToken);
      setSecret(data.secret);
      setQrCodeDataUrl(data.qrCodeDataUrl || '');
      setStep('mfa-setup');
    },
    onError: (err: unknown) => {
      setError(
        apiErrorStatus(err) === 403
          ? t('adminPanel.login.locked')
          : t('adminPanel.login.enrol_invalid'),
      );
    },
  });

  const mfaMutation = useMutation({
    mutationFn: () => adminAuthApi.verifyMfa(mfaToken, code.trim()),
    onSuccess: async () => {
      setError(null);
      await finishLogin();
    },
    onError: (err: unknown) => {
      setError(
        apiErrorMessage(err, t, 'adminPanel.login.invalid_mfa', {
          signIn: true,
        }),
      );
    },
  });

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate();
  };

  const handleEnrolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    enrolMutation.mutate({ token: mfaToken });
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
            <ShieldCheck size={12} className="text-brand-primary-text" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary-text">
              {t(isBackofficeHost() ? 'backoffice.title' : 'adminPanel.title')}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-black text-center tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
            {t('adminPanel.login.heading')}
          </h1>
          <p className="text-gray-500 text-center font-bold mt-2 tracking-wide uppercase text-xs">
            {t('adminPanel.login.subtitle')}
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
                {t('adminPanel.login.email')}
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
                placeholder={t('adminPanel.login.email_placeholder')}
              />
            </div>
            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 px-1"
              >
                {t('adminPanel.login.password')}
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
                className="button-alone font-black text-sm tracking-wide"
              >
                {t('adminPanel.login.continue')}
              </Button>
            </div>
          </form>
        )}

        {step === 'enrol' && (
          <form
            onSubmit={handleEnrolSubmit}
            className="space-y-3 sm:space-y-4 relative z-10"
          >
            <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-1.5">
              <h2 className="text-sm font-bold text-white">
                {t('adminPanel.login.enrol_title')}
              </h2>
              <p className="text-xs text-white/70 leading-relaxed">
                {t('adminPanel.login.enrol_hint')}
              </p>
            </div>
            {enrolMutation.isPending && linkProof ? (
              <p className="text-sm text-gray-400 text-center" role="status">
                {t('adminPanel.login.enrol_from_link')}
              </p>
            ) : (
              <div>
                <label
                  htmlFor="admin-enrol-code"
                  className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 px-1"
                >
                  {t('adminPanel.login.enrol_code')}
                </label>
                <input
                  id="admin-enrol-code"
                  type="text"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={proof}
                  onChange={(e) => setProof(e.target.value.slice(0, 20))}
                  className="w-full min-h-12 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg focus:bg-white/10 focus:border-brand-primary/50 transition-all text-white placeholder-gray-500 outline-none text-base tracking-widest font-mono text-center uppercase"
                  placeholder={t('adminPanel.login.enrol_code_placeholder')}
                />
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="white"
              size="lg"
              isLoading={enrolMutation.isPending}
              disabled={enrolMutation.isPending || proof.trim().length < 8}
              className="button-alone font-black text-sm tracking-wide"
            >
              {t('adminPanel.login.enrol_continue')}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setProof('');
                setError(null);
              }}
              className="w-full min-h-11 text-xs text-gray-400 hover:text-white transition-colors uppercase tracking-wide font-bold"
            >
              {t('adminPanel.login.back')}
            </button>
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
                  {t('adminPanel.login.mfa_setup')}
                </p>
                {qrCodeDataUrl && (
                  <div className="flex justify-center">
                    <div className="bg-white p-2.5 rounded-xl">
                      <img
                        src={qrCodeDataUrl}
                        alt={t('adminPanel.login.mfa_qr_alt')}
                        className="w-44 h-44"
                      />
                    </div>
                  </div>
                )}
                {secret && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 text-center">
                      {t('adminPanel.login.manual_secret')}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-xs font-mono text-brand-primary-text text-center tracking-wider break-all">
                        {secret}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copySecret()}
                        className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white shrink-0"
                        aria-label={t('adminPanel.login.copy_secret')}
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
                {t('adminPanel.login.mfa_code')}
              </label>
              <input
                id="admin-mfa"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                ref={mfaInputRef}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="w-full min-h-12 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg focus:bg-white/10 focus:border-brand-primary/50 transition-all text-white placeholder-gray-600 outline-none text-base tracking-[0.5em] font-mono text-center shadow-[0_0_15px_rgba(255,255,255,0.02)]"
                placeholder="000000"
              />
              <p className="text-xs text-gray-500 mt-2 text-center">
                {t('adminPanel.login.mfa_hint')}
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
              className="button-alone font-black text-sm tracking-wide"
            >
              {t('adminPanel.login.verify')}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setCode('');
                setError(null);
              }}
              className="w-full min-h-11 text-xs text-gray-400 hover:text-white transition-colors uppercase tracking-wide font-bold"
            >
              {t('adminPanel.login.back')}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-gray-600 text-xs font-medium relative z-10">
          {t('adminPanel.login.footer')}
        </p>
      </div>
    </div>
  );
}
