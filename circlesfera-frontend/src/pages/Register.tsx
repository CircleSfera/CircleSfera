import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import LayoutWrapper from '../layouts/LayoutWrapper';
import { authApi, profileApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import { logger } from '../utils/logger';

export default function Register() {
  const navigate = useNavigate();
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const setProfile = useAuthStore((state) => state.setProfile);
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [searchParams] = useSearchParams();
  const [inviteCode, setInviteCode] = useState(
    searchParams.get('inviteCode') || '',
  );

  const registerMutation = useMutation({
    mutationFn: () =>
      authApi.register({
        email,
        password,
        username,
        fullName,
        inviteCode: inviteCode || undefined,
      }),
    onSuccess: async () => {
      setAuthenticated();
      // Fetch and store user profile after registration
      try {
        const profileResponse = await profileApi.getMyProfile();
        setProfile(profileResponse.data);
      } catch (error) {
        logger.error('Failed to fetch profile:', error);
      }
      toast.success(t('auth.register.success'), { duration: 5000 });
      navigate('/');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate();
  };

  return (
    <LayoutWrapper showNavigation={false}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="modal-glass p-8 rounded-[32px] w-full max-w-sm relative overflow-hidden group">
          {/* Brand Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-brand-primary via-brand-secondary to-brand-accent opacity-90" />

          {/* Decorative glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-primary/20 rounded-full blur-3xl group-hover:bg-brand-primary/30 transition-colors duration-700"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-secondary/20 rounded-full blur-3xl group-hover:bg-brand-secondary/30 transition-colors duration-700"></div>

          <h1 className="text-4xl font-black text-center mb-2 tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
            {t('auth.register.title')}
          </h1>
          <p className="text-gray-500 text-center font-medium mb-6 tracking-wide uppercase text-[10px]">
            {t('auth.register.subtitle')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
            <div>
              <label
                htmlFor="email"
                className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 px-1"
              >
                {t('auth.register.email_label')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:bg-white/10 focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none text-sm"
                placeholder={t('auth.register.email_placeholder')}
                autoComplete="email"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="username"
                  className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 px-1"
                >
                  {t('auth.register.username_label')}
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:bg-white/10 focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none text-sm"
                  placeholder={t('auth.register.username_placeholder')}
                  autoComplete="username"
                />
              </div>

              <div>
                <label
                  htmlFor="fullName"
                  className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 px-1"
                >
                  {t('auth.register.fullname_label')}
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:bg-white/10 focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none text-sm"
                  placeholder={t('auth.register.fullname_placeholder')}
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 px-1"
              >
                {t('auth.register.password_label')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:bg-white/10 focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none text-sm"
                placeholder={t('auth.register.password_placeholder')}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label
                htmlFor="inviteCode"
                className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 px-1"
              >
                {t('auth.register.invite_label')}{' '}
                <span className="text-gray-600 font-normal lowercase tracking-normal">
                  {t('auth.register.optional')}
                </span>
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:bg-white/10 focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none text-sm"
                placeholder={t('auth.register.invite_placeholder')}
              />
            </div>

            {registerMutation.isError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                {(
                  registerMutation.error as {
                    response?: { data?: { message?: string } };
                  }
                )?.response?.data?.message || t('auth.register.default_error')}
              </div>
            )}

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full bg-white text-black py-3 rounded-2xl font-black text-[15px] tracking-wide uppercase hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_30px_rgb(255,255,255,0.1)] mt-2"
            >
              {registerMutation.isPending
                ? t('auth.register.sign_up_loading')
                : t('auth.register.sign_up')}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-600 text-sm font-medium">
            {t('auth.register.has_account')}{' '}
            <Link
              to="/accounts/login"
              className="text-white hover:text-brand-primary font-bold transition-colors ml-1"
            >
              {t('auth.register.sign_in_link')}
            </Link>
          </p>
        </div>
      </div>
    </LayoutWrapper>
  );
}
