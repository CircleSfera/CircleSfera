import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  type Appeal,
  type AppealTargetType,
  createAppeal,
  getMyAppeals,
} from '../../services/appeals.service';
import { Button, Input, Textarea } from '../ui';

export default function AppealsSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [targetType, setTargetType] =
    useState<AppealTargetType>('POST_REMOVAL');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');

  const { data: appeals, isLoading } = useQuery({
    queryKey: ['myAppeals'],
    queryFn: getMyAppeals,
  });

  const createMutation = useMutation({
    mutationFn: createAppeal,
    onSuccess: () => {
      toast.success(
        t('settings.appeals.created', 'Appeal submitted successfully'),
      );
      setTargetId('');
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['myAppeals'] });
    },
    onError: () => {
      toast.error(t('settings.appeals.error', 'Failed to submit appeal'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error(
        t('settings.appeals.reason_required', 'Please provide a reason'),
      );
      return;
    }
    createMutation.mutate({
      targetType,
      targetId: targetId.trim() || undefined,
      reason: reason.trim(),
    });
  };

  const getStatusColor = (status: Appeal['status']) => {
    switch (status) {
      case 'PENDING':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'APPROVED':
        return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'REJECTED':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getStatusIcon = (status: Appeal['status']) => {
    switch (status) {
      case 'PENDING':
        return <Clock size={14} />;
      case 'APPROVED':
        return <CheckCircle size={14} />;
      case 'REJECTED':
        return <XCircle size={14} />;
      default:
        return <AlertTriangle size={14} />;
    }
  };

  return (
    <div className="max-w-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-black text-white tracking-tighter">
          {t('settings.appeals.title', 'Appeals')}
        </h2>
        <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
          {t('settings.appeals.subtitle', 'Submit and manage content appeals')}
        </p>
      </div>

      {/* Create Appeal Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white/2 p-4 rounded-xl border border-white/5 space-y-4"
      >
        <h3 className="text-xs font-black uppercase tracking-wider text-blue-400/80">
          {t('settings.appeals.create_new', 'Submit New Appeal')}
        </h3>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="appeal-target-type"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              {t('settings.appeals.type', 'Appeal Type')}
            </label>
            <select
              id="appeal-target-type"
              value={targetType}
              onChange={(e) =>
                setTargetType(e.target.value as AppealTargetType)
              }
              className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="POST_REMOVAL">Post Removal</option>
              <option value="ACCOUNT_BAN">Account Ban</option>
            </select>
          </div>

          <Input
            id="targetId"
            label={t(
              'settings.appeals.target_id',
              'Post/Content ID (optional)',
            )}
            type="text"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder={t(
              'settings.appeals.target_id_placeholder',
              'Enter ID if applicable',
            )}
          />

          <div className="space-y-1.5">
            <div className="flex justify-between items-end">
              <label
                htmlFor="reason"
                className="block text-sm font-medium text-gray-300"
              >
                {t('settings.appeals.reason', 'Reason')}
              </label>
              <span
                className={`text-xs font-bold ${reason.length >= 450 ? 'text-red-400' : 'text-gray-600'}`}
              >
                {reason.length}/500
              </span>
            </div>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder={t(
                'settings.appeals.reason_placeholder',
                'Explain why you believe this decision should be reviewed...',
              )}
              className="resize-none"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={!reason.trim()}
            isLoading={createMutation.isPending}
            className="w-full py-3 font-black text-sm uppercase tracking-wide"
          >
            {t('settings.appeals.submit', 'Submit Appeal')}
          </Button>
        </div>
      </form>

      {/* Appeals List */}
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 ml-1">
          {t('settings.appeals.your_appeals', 'Your Appeals')}
        </h3>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={32} className="text-blue-400 animate-spin" />
          </div>
        ) : appeals && appeals.length > 0 ? (
          <div className="space-y-3">
            {appeals.map((appeal) => (
              <div
                key={appeal.id}
                className="bg-white/2 p-4 rounded-xl border border-white/5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-gray-400 uppercase">
                        {appeal.targetType.replace('_', ' ')}
                      </span>
                      {appeal.targetId && (
                        <span className="text-xs font-mono text-gray-600">
                          #{appeal.targetId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">
                      {appeal.reason}
                    </p>
                    {appeal.adminNotes && (
                      <div className="mt-2 p-2 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                        <span className="text-xs font-bold text-blue-400 uppercase block mb-1">
                          {t('settings.appeals.admin_notes', 'Admin Response')}:
                        </span>
                        <p className="text-xs text-gray-400">
                          {appeal.adminNotes}
                        </p>
                      </div>
                    )}
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold uppercase tracking-wide ${getStatusColor(appeal.status)}`}
                  >
                    {getStatusIcon(appeal.status)}
                    {appeal.status}
                  </div>
                </div>
                <div className="text-xs text-gray-600 font-medium">
                  {new Date(appeal.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white/1 rounded-xl border border-white/5 border-dashed">
            <AlertTriangle size={48} className="mx-auto mb-4 text-gray-700" />
            <p className="text-gray-500 font-bold tracking-tight uppercase text-xs">
              {t('settings.appeals.no_appeals', 'No appeals submitted yet')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
