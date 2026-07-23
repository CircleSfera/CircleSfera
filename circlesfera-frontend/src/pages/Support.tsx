import axios from 'axios';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export const Support: React.FC = () => {
  const { t } = useTranslation();
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
          error.response?.data?.message || t('supportPage.error_generic'),
        );
      } else {
        setErrorMessage(t('supportPage.error_generic'));
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 mt-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {t('supportPage.title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          {t('supportPage.description')}
        </p>
      </div>

      {status === 'success' ? (
        <div
          className="p-4 mb-6 text-sm text-green-800 rounded-lg bg-green-50 dark:bg-gray-800 dark:text-green-400"
          role="alert"
        >
          <span className="font-medium">{t('supportPage.success_title')}</span>{' '}
          {t('supportPage.success_body', { email: userEmail })}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {!userEmail && (
            <div className="p-4 mb-4 text-sm text-yellow-800 rounded-lg bg-yellow-50 dark:bg-gray-800 dark:text-yellow-300">
              {t('supportPage.login_required')}
            </div>
          )}

          <div>
            <label
              htmlFor="subject"
              className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
            >
              {t('supportPage.subject_label')}
            </label>
            <input
              type="text"
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              placeholder={t('supportPage.subject_placeholder')}
              required
              disabled={!userEmail || status === 'loading'}
            />
          </div>

          <div>
            <label
              htmlFor="message"
              className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
            >
              {t('supportPage.message_label')}
            </label>
            <textarea
              id="message"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              placeholder={t('supportPage.message_placeholder')}
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
            {status === 'loading'
              ? t('supportPage.submitting')
              : t('supportPage.submit')}
          </button>
        </form>
      )}
    </div>
  );
};
