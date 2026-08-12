import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui';
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
  const [dateOfBirth, setDateOfBirth] = useState('');
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
        dateOfBirth,
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
      navigate('/onboarding');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateOfBirth) {
      toast.error(t('auth.register.dob_required', 'Date of birth is required'));
      return;
    }
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age -= 1;
    }
    if (age < 16) {
      toast.error(
        t(
          'auth.register.age_error',
          'You must be at least 16 years old to register.',
        ),
      );
      return;
    }
    registerMutation.mutate();
  };

  return (
    <LayoutWrapper showNavigation={false}>
      <div className="min-h-dvh flex items-center justify-center py-3">
        <div className="modal-glass p-4 rounded-xl w-full max-w-sm relative overflow-hidden group">
          {/* Brand Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-brand-primary via-brand-secondary to-brand-accent opacity-90" />

          {/* Decorative glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-primary/20 rounded-full blur-3xl group-hover:bg-brand-primary/30 transition-colors duration-700"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-secondary/20 rounded-full blur-3xl group-hover:bg-brand-secondary/30 transition-colors duration-700"></div>

          <h1 className="text-xl font-black text-center mb-2 tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
            {t('auth.register.title')}
          </h1>
          <p className="text-gray-500 text-center font-medium mb-6 tracking-wide uppercase text-xs">
            {t('auth.register.subtitle')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 px-1"
              >
                {t('auth.register.email_label')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-glass w-full px-4 text-white placeholder-gray-600 text-sm"
                style={{ height: 'var(--input-height-standard, 48px)' }}
                placeholder={t('auth.register.email_placeholder')}
                autoComplete="email"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="username"
                  className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 px-1"
                >
                  {t('auth.register.username_label')}
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="input-glass w-full px-4 text-white placeholder-gray-600 text-sm"
                  style={{ height: 'var(--input-height-standard, 48px)' }}
                  placeholder={t('auth.register.username_placeholder')}
                  autoComplete="username"
                />
              </div>

              <div>
                <label
                  htmlFor="fullName"
                  className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 px-1"
                >
                  {t('auth.register.fullname_label')}
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-glass w-full px-4 text-white placeholder-gray-600 text-sm"
                  style={{ height: 'var(--input-height-standard, 48px)' }}
                  placeholder={t('auth.register.fullname_placeholder')}
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 px-1"
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
                className="input-glass w-full px-4 text-white placeholder-gray-600 text-sm"
                style={{ height: 'var(--input-height-standard, 48px)' }}
                placeholder={t('auth.register.password_placeholder')}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label
                htmlFor="dateOfBirth"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 px-1"
              >
                {t('auth.register.dob_label')}
              </label>
              <input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
                className="input-glass w-full px-4 text-white placeholder-gray-600 text-sm"
                style={{ height: 'var(--input-height-standard, 48px)' }}
                autoComplete="bday"
              />
              <p className="mt-1 px-1 text-[10px] text-gray-500 font-medium">
                {t('auth.register.dob_hint')}
              </p>
            </div>

            <div>
              <label
                htmlFor="inviteCode"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 px-1"
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
                className="input-glass w-full px-4 text-white placeholder-gray-600 text-sm"
                style={{ height: 'var(--input-height-standard, 48px)' }}
                placeholder={t('auth.register.invite_placeholder')}
              />
            </div>

            {registerMutation.isError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center font-medium">
                {(() => {
                  const code = (
                    registerMutation.error as {
                      response?: { data?: { message?: string } };
                    }
                  )?.response?.data?.message;
                  if (
                    code === 'REGISTRATION_CLOSED' ||
                    code === 'INVITE_CODE_REQUIRED' ||
                    code === 'MAINTENANCE_MODE'
                  ) {
                    return t(`auth.register.errors.${code}`, code);
                  }
                  return code || t('auth.register.default_error');
                })()}
              </div>
            )}

            <Button
              type="submit"
              variant="white"
              size="lg"
              isLoading={registerMutation.isPending}
              className="w-full font-black text-sm tracking-wide mt-2"
            >
              {t('auth.register.sign_up')}
            </Button>
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
