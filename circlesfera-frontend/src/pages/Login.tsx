import { startAuthentication } from '@simplewebauthn/browser';
import { useMutation } from '@tanstack/react-query';
import { Fingerprint, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import LayoutWrapper from '../layouts/LayoutWrapper';
import { authApi, passkeyApi, profileApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { LoginDto } from '../types';
import { logger } from '../utils/logger';

export default function Login() {
  const navigate = useNavigate();
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const setProfile = useAuthStore((state) => state.setProfile);
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: (data: LoginDto) => authApi.login(data),
    onSuccess: async () => {
      handleLoginSuccess();
    },
  });

  const handleLoginSuccess = () => {
    setAuthenticated();
    profileApi
      .getMyProfile()
      .then((profileResponse) => {
        setProfile(profileResponse.data);
        navigate('/');
      })
      .catch((err: unknown) => {
        logger.error('Failed to fetch profile:', err);
        navigate('/'); // Go anyway
      });
  };

  const handlePasskeyLogin = async () => {
    if (!identifier) {
      setError(t('auth.login.no_identifier'));
      return;
    }

    setPasskeyLoading(true);
    setError(null);

    try {
      // 1. Get options from server
      const optionsResponse = await passkeyApi.getLoginOptions(identifier);
      const options = optionsResponse.data;

      // 2. Start authentication in browser
      const authenticationResponse = await startAuthentication({
        optionsJSON: options,
      });

      // 3. Verify on server — returns JWT tokens on success
      await passkeyApi.verifyLogin(
        identifier,
        authenticationResponse as unknown as Record<string, unknown>,
      );

      // If we reach here without an error, authentication was successful
      handleLoginSuccess();
    } catch (err: unknown) {
      logger.error('Passkey authentication error:', err);
      const errorMessage =
        err instanceof Error ? err.message : t('auth.login.passkey_error');
      setError(errorMessage);
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate({ identifier, password });
  };

  return (
    <LayoutWrapper showNavigation={false}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="modal-glass p-10 rounded-[32px] w-full max-w-md relative overflow-hidden group">
          {/* Brand Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-brand-primary via-brand-secondary to-brand-accent opacity-90" />

          {/* Decorative glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-primary/20 rounded-full blur-3xl group-hover:bg-brand-primary/30 transition-colors duration-700"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-secondary/20 rounded-full blur-3xl group-hover:bg-brand-secondary/30 transition-colors duration-700"></div>

          <h1 className="text-5xl font-black text-center mb-2 tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
            {t('auth.login.title')}
          </h1>
          <p className="text-gray-500 text-center font-medium mb-10 tracking-wide uppercase text-[11px]">
            {t('auth.login.welcome')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div>
              <label
                htmlFor="identifier"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1"
              >
                {t('auth.login.identifier_label')}
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="w-full px-5 py-4 bg-white/3 border border-white/10 rounded-2xl focus:bg-white/[0.07] focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none text-lg"
                placeholder={t('auth.login.identifier_placeholder')}
                autoComplete="username"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1"
              >
                {t('auth.login.password_label')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-5 py-4 bg-white/3 border border-white/10 rounded-2xl focus:bg-white/[0.07] focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none text-lg"
                placeholder={t('auth.login.password_placeholder')}
                autoComplete="current-password"
              />
            </div>

            <div className="flex justify-end pr-1">
              <Link
                to="/forgot-password"
                title="Forgot password"
                className="text-xs font-bold text-gray-500 hover:text-white transition-colors"
              >
                {t('auth.login.forgot_password')}
              </Link>
            </div>

            {loginMutation.isError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                {(
                  loginMutation.error as {
                    response?: { data?: { message?: string } };
                  }
                )?.response?.data?.message || t('auth.login.default_error')}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <div className="space-y-4 pt-4">
              <button
                type="submit"
                data-testid="login-submit-button"
                disabled={loginMutation.isPending || passkeyLoading}
                className="w-full bg-white text-black py-4 rounded-2xl font-black text-[15px] tracking-wide uppercase hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_30px_rgb(255,255,255,0.1)]"
              >
                {loginMutation.isPending
                  ? t('auth.login.sign_in_loading')
                  : t('auth.login.sign_in')}
              </button>

              <div className="relative flex items-center gap-4 py-4">
                <div className="flex-1 h-px bg-white/5"></div>
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">
                  {t('auth.login.or')}
                </span>
                <div className="flex-1 h-px bg-white/5"></div>
              </div>

              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={loginMutation.isPending || passkeyLoading}
                className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white py-4 rounded-2xl font-bold hover:bg-white/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {passkeyLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t('auth.login.passkey_loading')}</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-5 h-5 text-brand-primary group-hover:scale-110 transition-transform" />
                    <span>{t('auth.login.passkey_btn')}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="mt-10 text-center text-gray-600 text-sm font-medium">
            {t('auth.login.no_account')}{' '}
            <Link
              to="/accounts/emailsignup"
              className="text-white hover:text-brand-primary font-bold transition-colors ml-1"
            >
              {t('auth.login.sign_up_link')}
            </Link>
          </p>
        </div>
      </div>
    </LayoutWrapper>
  );
}
