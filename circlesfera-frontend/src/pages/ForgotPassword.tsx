import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Mail } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';
import { authApi } from '../services';
import type { ApiError } from '../types';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await authApi.requestReset(email);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(
        (err as ApiError).response?.data?.message ||
          t('auth.forgot_password.default_error'),
      );
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-4 rounded-lg max-w-md w-full text-center"
        >
          <div className="bg-green-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold mb-4">
            {t('auth.forgot_password.success_title')}
          </h1>
          <p className="text-gray-300 mb-5">
            {t('auth.forgot_password.success_desc1')} <strong>{email}</strong>
            {t('auth.forgot_password.success_desc2')}
          </p>
          <Link
            to="/accounts/login"
            className="text-brand-primary hover:underline font-medium inline-flex items-center min-h-11 justify-center gap-2"
          >
            <ArrowLeft size={18} /> {t('auth.forgot_password.back_to_login')}
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="modal-glass p-6 rounded-2xl max-w-sm w-full border border-white/8 shadow-2xl backdrop-blur-2xl"
      >
        <Link
          to="/accounts/login"
          className="text-gray-400 hover:text-white mb-6 inline-flex items-center min-h-11 justify-center gap-2 text-xs font-semibold tracking-wide transition-colors"
        >
          <ArrowLeft size={16} /> {t('auth.forgot_password.back')}
        </Link>

        <h1 className="text-xl font-black mb-2 tracking-tight text-white">
          {t('auth.forgot_password.title')}
        </h1>
        <p className="text-gray-400 mb-5 text-xs leading-relaxed">
          {t('auth.forgot_password.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-xs font-bold text-gray-500 uppercase tracking-widest px-1"
            >
              {t('auth.forgot_password.email_label')}
            </label>
            <div className="relative flex items-center">
              <Mail
                className="absolute left-3.5 text-gray-500 pointer-events-none z-10"
                size={18}
              />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.forgot_password.email_placeholder')}
                className="input-glass w-full pl-10 pr-4 text-white placeholder-gray-600 text-sm"
                style={{ height: 'var(--input-height-standard, 48px)' }}
                autoComplete="email"
              />
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs font-semibold text-center bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            className="w-full font-bold text-sm tracking-wide"
          >
            {t('auth.forgot_password.submit')}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
