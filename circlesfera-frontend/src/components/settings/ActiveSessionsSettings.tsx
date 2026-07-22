import {
  AlertCircle,
  Globe,
  Laptop,
  Loader2,
  LogOut,
  Shield,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../services/auth.service';
import { logger } from '../../utils/logger';

interface ActiveSession {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
}

export const ActiveSessionsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authApi.getSessions();
      setSessions(res.data);
    } catch (err) {
      logger.error('Failed to load active sessions:', err);
      setError(t('settings.security.sessions_subtitle'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSingle = async (id: string) => {
    try {
      setRevokingId(id);
      await authApi.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      logger.error('Failed to revoke session:', err);
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    try {
      setRevokingOthers(true);
      await authApi.revokeOtherSessions();
      await fetchSessions();
    } catch (err) {
      logger.error('Failed to revoke other sessions:', err);
    } finally {
      setRevokingOthers(false);
    }
  };

  const getDeviceIcon = (ua?: string) => {
    if (!ua) return <Globe className="w-5 h-5 text-gray-400" />;
    const lower = ua.toLowerCase();
    if (
      lower.includes('mobile') ||
      lower.includes('android') ||
      lower.includes('iphone')
    ) {
      return <Smartphone className="w-5 h-5 text-accent-teal" />;
    }
    return <Laptop className="w-5 h-5 text-accent-blue" />;
  };

  const getDeviceName = (ua?: string) => {
    if (!ua) return 'Dispositivo';
    if (ua.includes('iPhone')) return 'iPhone (Safari Mobile)';
    if (ua.includes('Android')) return 'Android Device';
    if (ua.includes('Macintosh') || ua.includes('Mac OS')) return 'Mac Desktop';
    if (ua.includes('Windows')) return 'Windows Desktop';
    if (ua.includes('Linux')) return 'Linux Desktop';
    return 'Web Browser';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-accent-blue/10 text-accent-blue rounded-xl">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t('settings.security.sessions_title')}
            </h3>
            <p className="text-xs text-gray-400">
              {t('settings.security.sessions_subtitle')}
            </p>
          </div>
        </div>

        {sessions.length > 1 && (
          <button
            type="button"
            onClick={handleRevokeOthers}
            disabled={revokingOthers}
            className="flex items-center space-x-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {revokingOthers ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            <span>{t('settings.security.revoke_others')}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-6 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-xs font-medium">
            {t('settings.security.loading_sessions')}
          </span>
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-gray-500 italic py-2">
          {t('settings.security.no_other_sessions')}
        </p>
      ) : (
        <div className="space-y-2 pt-1">
          {sessions.map((session, index) => {
            const isCurrent = index === 0;
            return (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 rounded-xl transition-all"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white/5 rounded-lg">
                    {getDeviceIcon(session.userAgent)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">
                        {getDeviceName(session.userAgent)}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold rounded-full">
                          {t('settings.security.current_device')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] text-gray-400 mt-0.5">
                      <span>IP: {session.ipAddress || '127.0.0.1'}</span>
                      <span>•</span>
                      <span>
                        {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRevokeSingle(session.id)}
                    disabled={revokingId === session.id}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    {revokingId === session.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
