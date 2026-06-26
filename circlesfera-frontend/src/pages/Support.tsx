import axios from 'axios';
import React, { useState } from 'react';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export const Support: React.FC = () => {
  const { profile } = useAuthStore();
  const userEmail = profile?.user?.email || '';
  const userId = profile?.userId || profile?.user?.id;
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      await apiClient.post('/support/tickets', {
        email: userEmail,
        subject,
        message,
        userId: userId,
      });
      setStatus('success');
      setSubject('');
      setMessage('');
    } catch (error: unknown) {
      setStatus('error');
      if (axios.isAxiosError(error)) {
        setErrorMessage(
          error.response?.data?.message ||
            'Error al enviar el ticket. Inténtalo de nuevo.',
        );
      } else {
        setErrorMessage('Error al enviar el ticket. Inténtalo de nuevo.');
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 mt-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Centro de Soporte
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          ¿Tienes algún problema con tu cuenta o necesitas ayuda con un pago?
          Escríbenos y te responderemos por correo electrónico.
        </p>
      </div>

      {status === 'success' ? (
        <div
          className="p-4 mb-6 text-sm text-green-800 rounded-lg bg-green-50 dark:bg-gray-800 dark:text-green-400"
          role="alert"
        >
          <span className="font-medium">¡Ticket enviado!</span> Nuestro equipo
          lo revisará y te contactará pronto al correo: {userEmail}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {!userEmail && (
            <div className="p-4 mb-4 text-sm text-yellow-800 rounded-lg bg-yellow-50 dark:bg-gray-800 dark:text-yellow-300">
              Debes iniciar sesión para que podamos contactarte.
            </div>
          )}

          <div>
            <label
              htmlFor="subject"
              className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
            >
              Asunto
            </label>
            <input
              type="text"
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              placeholder="Ej: Problema con una suscripción"
              required
              disabled={!userEmail || status === 'loading'}
            />
          </div>

          <div>
            <label
              htmlFor="message"
              className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
            >
              Mensaje
            </label>
            <textarea
              id="message"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              placeholder="Describe tu problema con el mayor detalle posible..."
              required
              disabled={!userEmail || status === 'loading'}
            />
          </div>

          {status === 'error' && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={!userEmail || status === 'loading'}
            className="w-full text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 disabled:opacity-50"
          >
            {status === 'loading' ? 'Enviando...' : 'Enviar Ticket'}
          </button>
        </form>
      )}
    </div>
  );
};
