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
      <div className="min-h-screen flex items-center justify-center p-4">
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
          <p className="text-gray-400 mb-5">
            {t('auth.forgot_password.success_desc1')} <strong>{email}</strong>
            {t('auth.forgot_password.success_desc2')}
          </p>
          <Link
            to="/accounts/login"
            className="text-brand-primary hover:underline font-medium inline-flex items-center gap-2"
          >
            <ArrowLeft size={18} /> {t('auth.forgot_password.back_to_login')}
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-4 rounded-lg max-w-md w-full"
      >
        <Link
          to="/accounts/login"
          className="text-gray-400 hover:text-white mb-6 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft size={16} /> {t('auth.forgot_password.back')}
        </Link>

        <h1 className="text-2xl font-bold mb-2">
          {t('auth.forgot_password.title')}
        </h1>
        <p className="text-gray-400 mb-5 text-sm">
          {t('auth.forgot_password.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-xs font-bold text-gray-400 uppercase tracking-wider"
            >
              {t('auth.forgot_password.email_label')}
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                size={18}
              />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.forgot_password.email_placeholder')}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-brand-primary transition-colors"
                autoComplete="email"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            className="w-full font-bold py-2.5"
          >
            {t('auth.forgot_password.submit')}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
