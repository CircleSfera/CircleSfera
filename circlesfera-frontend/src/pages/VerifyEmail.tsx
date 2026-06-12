import { motion } from 'framer-motion';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services';
import type { ApiError } from '../types';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error',
  );
  const [message, setMessage] = useState(
    token ? '' : 'Token de verificación no encontrado.',
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        await authApi.verifyEmail(token);
        setStatus('success');
        setMessage('Tu email ha sido verificado correctamente.');
        setTimeout(() => navigate('/accounts/login'), 3000);
      } catch (err: unknown) {
        setStatus('error');
        const errorMessage =
          (err as ApiError).response?.data?.message ||
          'Error al verificar el email.';
        setMessage(errorMessage);
      }
    };

    verify();
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel p-8 rounded-2xl max-w-md w-full text-center"
      >
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
            <h1 className="text-2xl font-bold">Verificando tu email...</h1>
            <p className="text-gray-400">
              Espera un momento mientras validamos tu cuenta.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="w-16 h-16 text-green-500" />
            <h1 className="text-2xl font-bold">¡Email Verificado!</h1>
            <p className="text-gray-400">{message}</p>
            <p className="text-xs text-gray-500 mt-4">
              Serás redirigido al login en unos segundos...
            </p>
            <Link
              to="/accounts/login"
              className="mt-4 text-brand-primary hover:underline font-medium"
            >
              Ir al Login ahora
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="w-16 h-16 text-red-500" />
            <h1 className="text-2xl font-bold">Error de Verificación</h1>
            <p className="text-red-400/80">{message}</p>
            <Link
              to="/accounts/emailsignup"
              className="mt-6 bg-brand-primary px-6 py-2 rounded-lg font-bold hover:opacity-90 transition-opacity"
            >
              Reintentar Registro
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
