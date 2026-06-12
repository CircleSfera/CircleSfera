import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import LayoutWrapper from '../layouts/LayoutWrapper';
import { authApi, profileApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import { logger } from '../utils/logger';

export default function Register() {
  const navigate = useNavigate();
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const setProfile = useAuthStore((state) => state.setProfile);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');

  const registerMutation = useMutation({
    mutationFn: () => authApi.register({ email, password, username, fullName }),
    onSuccess: async () => {
      setAuthenticated();
      // Fetch and store user profile after registration
      try {
        const profileResponse = await profileApi.getMyProfile();
        setProfile(profileResponse.data);
      } catch (error) {
        logger.error('Failed to fetch profile:', error);
      }
      toast.success(
        'Account created successfully! Please check your email to verify your account.',
        { duration: 5000 },
      );
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
        <div className="modal-glass p-10 rounded-[32px] w-full max-w-md relative overflow-hidden group">
          {/* Brand Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-brand-primary via-brand-secondary to-brand-accent opacity-90" />

          {/* Decorative glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-primary/20 rounded-full blur-3xl group-hover:bg-brand-primary/30 transition-colors duration-700"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-secondary/20 rounded-full blur-3xl group-hover:bg-brand-secondary/30 transition-colors duration-700"></div>

          <h1 className="text-5xl font-black text-center mb-2 tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/40">
            CircleSfera
          </h1>
          <p className="text-gray-500 text-center font-medium mb-10 tracking-wide uppercase text-[11px]">
            Join the inner circle.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-5 py-3.5 bg-white/3 border border-white/10 rounded-2xl focus:bg-white/10 focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="username"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-5 py-3.5 bg-white/3 border border-white/10 rounded-2xl focus:bg-white/10 focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none"
                placeholder="johndoe"
                autoComplete="username"
              />
            </div>

            <div>
              <label
                htmlFor="fullName"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1"
              >
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-5 py-3.5 bg-white/3 border border-white/10 rounded-2xl focus:bg-white/10 focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none"
                placeholder="John Doe"
                autoComplete="name"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-5 py-3.5 bg-white/3 border border-white/10 rounded-2xl focus:bg-white/10 focus:border-white/20 transition-all text-white placeholder-gray-600 outline-none"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            {registerMutation.isError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                {(
                  registerMutation.error as {
                    response?: { data?: { message?: string } };
                  }
                )?.response?.data?.message ||
                  'Registration failed. Please try again.'}
              </div>
            )}

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full bg-white text-black py-4 rounded-2xl font-black text-[15px] tracking-wide uppercase hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_30px_rgb(255,255,255,0.1)] mt-4"
            >
              {registerMutation.isPending ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>

          <p className="mt-10 text-center text-gray-600 text-sm font-medium">
            Already have an account?{' '}
            <Link
              to="/accounts/login"
              className="text-white hover:text-brand-primary font-bold transition-colors ml-1"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </LayoutWrapper>
  );
}
