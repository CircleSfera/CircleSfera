import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services';
import type { ApiError } from '../types';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

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
          'Algo salió mal. Inténtalo de nuevo.',
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
          className="glass-panel p-8 rounded-2xl max-w-md w-full text-center"
        >
          <div className="bg-green-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold mb-4">Email Enviado</h1>
          <p className="text-gray-400 mb-8">
            Si existe una cuenta asociada a <strong>{email}</strong>, recibirás
            un enlace para restablecer tu contraseña en unos minutos.
          </p>
          <Link
            to="/accounts/login"
            className="text-brand-primary hover:underline font-medium inline-flex items-center gap-2"
          >
            <ArrowLeft size={18} /> Volver al Login
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
        className="glass-panel p-8 rounded-2xl max-w-md w-full"
      >
        <Link
          to="/accounts/login"
          className="text-gray-400 hover:text-white mb-6 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-2xl font-bold mb-2">¿Olvidaste tu contraseña?</h1>
        <p className="text-gray-400 mb-8 text-sm">
          Introduce tu correo electrónico y te enviaremos un enlace para que
          vuelvas a entrar en tu cuenta.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-xs font-bold text-gray-400 uppercase tracking-wider"
            >
              Email
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
                placeholder="tu@email.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-brand-primary transition-colors"
                autoComplete="email"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-primary py-3 rounded-xl font-bold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Enviando...' : 'Enviar enlace de acceso'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
