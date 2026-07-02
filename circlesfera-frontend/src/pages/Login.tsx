import { startAuthentication } from '@simplewebauthn/browser';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { Fingerprint } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
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

  const err = loginMutation.error as any;
  const errorMessage = err
    ? (err.response?.data?.message || err.message)
    : undefined;
  const is2FARequired = errorMessage === '2FA_REQUIRED';

  return (
    <LayoutWrapper showNavigation={false}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="modal-glass p-4 rounded-xl w-full max-w-sm relative overflow-hidden group border border-white/5 shadow-2xl backdrop-blur-2xl">
          {/* Brand Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue opacity-90" />

          {/* Decorative glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-primary/20 rounded-full blur-3xl group-hover:bg-brand-primary/30 transition-colors duration-700"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-secondary/20 rounded-full blur-3xl group-hover:bg-brand-secondary/30 transition-colors duration-700"></div>

          <h1 className="text-xl md:text-2xl font-black text-center mb-2 tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">
            {t('auth.login.title')}
          </h1>
          <p className="text-gray-500 text-center font-bold mb-6 tracking-wide uppercase text-xs">
            {t('auth.login.welcome')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
            <div>
              <label
                htmlFor="identifier"
                className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 px-1"
              >
                {t('auth.login.identifier_label')}
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg focus:bg-white/10 focus:border-brand-primary/50 transition-all text-white placeholder-gray-600 outline-none text-base shadow-[0_0_15px_rgba(255,255,255,0.02)]"
                placeholder={t('auth.login.identifier_placeholder')}
                autoComplete="username"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 px-1"
              >
                {t('auth.login.password_label')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg focus:bg-white/10 focus:border-brand-primary/50 transition-all text-white placeholder-gray-600 outline-none text-base shadow-[0_0_15px_rgba(255,255,255,0.02)]"
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

            {loginMutation.isError && !is2FARequired && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                {errorMessage || t('auth.login.default_error')}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            {is2FARequired ? (
              <div className="space-y-4 animate-in fade-in">
                <div>
                  <label
                    htmlFor="twoFactorCode"
                    className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 px-1"
                  >
                    {t('auth.login.2fa_code', 'Authentication Code')}
                  </label>
                  <input
                    id="twoFactorCode"
                    type="text"
                    maxLength={6}
                    onChange={(e) => {
                      const code = e.target.value.replace(/\D/g, '');
                      if (code.length === 6) {
                        loginMutation.mutate({
                          identifier,
                          password,
                          twoFactorCode: code,
                        });
                      }
                    }}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg focus:bg-white/10 focus:border-brand-primary/50 transition-all text-white placeholder-gray-600 outline-none text-base tracking-[0.5em] font-mono text-center shadow-[0_0_15px_rgba(255,255,255,0.02)]"
                    placeholder="000000"
                    autoComplete="one-time-code"
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    {t(
                      'auth.login.2fa_hint',
                      'Enter the 6-digit code from your authenticator app.',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loginMutation.reset()}
                  className="w-full text-xs text-gray-500 hover:text-white transition-colors uppercase tracking-wide font-bold pt-2"
                >
                  {t('auth.login.back_to_login', 'Back')}
                </button>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <Button
                  type="submit"
                  data-testid="login-submit-button"
                  variant="white"
                  isLoading={loginMutation.isPending}
                  disabled={loginMutation.isPending || passkeyLoading}
                  className="w-full font-black text-xs md:text-sm tracking-wide uppercase py-1.5"
                >
                  {t('auth.login.sign_in')}
                </Button>

                <div className="relative flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-white/5"></div>
                  <span className="text-xs font-black text-gray-600 uppercase tracking-wide">
                    {t('auth.login.or')}
                  </span>
                  <div className="flex-1 h-px bg-white/5"></div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePasskeyLogin}
                  isLoading={passkeyLoading}
                  disabled={loginMutation.isPending || passkeyLoading}
                  className="w-full flex items-center justify-center gap-3 py-1.5 font-bold text-xs md:text-sm hover:border-brand-primary/30 group"
                >
                  {!passkeyLoading && (
                    <Fingerprint className="w-5 h-5 text-brand-primary group-hover:scale-110 transition-transform" />
                  )}
                  {t('auth.login.passkey_btn')}
                </Button>
              </div>
            )}
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
