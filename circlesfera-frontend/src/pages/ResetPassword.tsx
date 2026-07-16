import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, CheckCircle, Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui';
import { authApi } from '../services';
import type { ApiError } from '../types';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('auth.reset_password.error_mismatch'));
      return;
    }
    if (!token) {
      setError(t('auth.reset_password.error_token'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.resetPassword({ token, newPassword });
      setSuccess(true);
      setTimeout(() => navigate('/accounts/login'), 3000);
    } catch (err: unknown) {
      setError(
        (err as ApiError).response?.data?.message ||
          t('auth.reset_password.default_error'),
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 rounded-lg max-w-md w-full text-center"
        >
          <div className="bg-green-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold mb-4">
            {t('auth.reset_password.success_title')}
          </h1>
          <p className="text-gray-300 mb-6">
            {t('auth.reset_password.success_desc')}
          </p>
          <p className="text-xs text-gray-500">
            {t('auth.reset_password.redirecting')}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-8 rounded-lg max-w-md w-full"
      >
        <h1 className="text-2xl font-bold mb-2">
          {t('auth.reset_password.title')}
        </h1>
        <p className="text-gray-300 mb-8 text-sm">
          {t('auth.reset_password.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="newPassword"
              className="text-xs font-bold text-gray-300 uppercase tracking-wider"
            >
              {t('auth.reset_password.new_password')}
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                size={18}
              />
              <input
                id="newPassword"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-brand-primary transition-colors"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="confirmPassword"
              className="text-xs font-bold text-gray-300 uppercase tracking-wider"
            >
              {t('auth.reset_password.confirm_password')}
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                size={18}
              />
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-brand-primary transition-colors"
                autoComplete="new-password"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm bg-red-500/10 p-3 rounded-lg">
              <AlertCircle size={16} />
              <p>{error}</p>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            className="w-full font-bold py-3"
          >
            {t('auth.reset_password.submit')}
          </Button>
        </form>

        <div className="mt-8 text-center">
          <Link
            to="/accounts/login"
            className="text-gray-300 hover:text-white inline-flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft size={16} /> {t('auth.reset_password.cancel')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
