import { motion } from 'framer-motion';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import LayoutWrapper from '../layouts/LayoutWrapper';
import { authApi } from '../services';
import type { ApiError } from '../types';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error',
  );
  const { t } = useTranslation();
  const [message, setMessage] = useState(
    token ? '' : t('auth.verify.no_token'),
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        await authApi.verifyEmail(token);
        setStatus('success');
        setMessage(t('auth.verify.success'));
        setTimeout(() => navigate('/accounts/login'), 3000);
      } catch (err: unknown) {
        setStatus('error');
        const errorMessage =
          (err as ApiError).response?.data?.message || t('auth.verify.error');
        setMessage(errorMessage);
      }
    };

    verify();
  }, [token, navigate, t]);

  return (
    <LayoutWrapper showNavigation={false}>
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="modal-glass p-10 rounded-[32px] w-full max-w-md relative overflow-hidden group shadow-2xl"
        >
          {/* Brand Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-brand-primary via-brand-secondary to-brand-accent opacity-90" />

          {/* Decorative glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-primary/20 rounded-full blur-3xl group-hover:bg-brand-primary/30 transition-colors duration-700 pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-secondary/20 rounded-full blur-3xl group-hover:bg-brand-secondary/30 transition-colors duration-700 pointer-events-none"></div>

          <div className="relative z-10 flex flex-col items-center">
            {status === 'loading' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-brand-primary/20 blur-xl rounded-full" />
                  <Loader2
                    className="w-16 h-16 text-brand-primary animate-spin relative z-10"
                    strokeWidth={1.5}
                  />
                </div>
                <div className="text-center">
                  <h1 className="text-2xl font-black mb-2 tracking-tighter text-white">
                    {t('auth.verify.loading_title')}
                  </h1>
                  <p className="text-gray-400 text-sm font-medium">
                    {t('auth.verify.loading_desc')}
                  </p>
                </div>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 w-full"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full" />
                  <CheckCircle
                    className="w-16 h-16 text-green-400 relative z-10"
                    strokeWidth={1.5}
                  />
                </div>
                <div className="text-center w-full">
                  <h1 className="text-2xl font-black mb-2 tracking-tighter text-white">
                    {t('auth.verify.success_title')}
                  </h1>
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg mb-6">
                    <p className="text-green-400 text-sm font-medium">
                      {message}
                    </p>
                  </div>
                  <p className="text-gray-400 text-sm mb-6">
                    {t('auth.verify.success_desc')}
                  </p>
                  <Link
                    to="/accounts/login"
                    className="w-full block bg-white text-black py-4 rounded-lg font-black text-[15px] tracking-wide uppercase hover:bg-zinc-200 active:scale-[0.98] transition-all shadow-[0_8px_30px_rgb(255,255,255,0.1)]"
                  >
                    Enter CircleSfera
                  </Link>
                </div>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 w-full"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full" />
                  <XCircle
                    className="w-16 h-16 text-red-400 relative z-10"
                    strokeWidth={1.5}
                  />
                </div>
                <div className="text-center w-full">
                  <h1 className="text-2xl font-black mb-2 tracking-tighter text-white">
                    {t('auth.verify.error_title')}
                  </h1>
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-8">
                    <p className="text-red-400 text-sm font-medium">
                      {message}
                    </p>
                  </div>

                  <Link
                    to="/accounts/emailsignup"
                    className="w-full block bg-white text-black py-4 rounded-lg font-black text-[15px] tracking-wide uppercase hover:bg-zinc-200 active:scale-[0.98] transition-all shadow-[0_8px_30px_rgb(255,255,255,0.1)]"
                  >
                    Return to Registration
                  </Link>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </LayoutWrapper>
  );
}
