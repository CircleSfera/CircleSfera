import { Check, Loader2, Vote } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/api';
import { logger } from '../../utils/logger';
import {
  STICKER_BADGE,
  STICKER_CARD,
  STICKER_HEADER,
  STICKER_LABEL,
  STICKER_ROW,
  STICKER_TITLE,
} from './stickerStyles';

interface PollOption {
  index: number;
  text: string;
  votes: number;
  percentage: number;
}

interface PollData {
  id: string;
  question: string;
  totalVotes: number;
  userVoteIndex: number | null;
  options: PollOption[];
}

export const PollWidget: React.FC<{ pollId: string }> = ({ pollId }) => {
  const { t } = useTranslation();
  const [poll, setPoll] = useState<PollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [votingIndex, setVotingIndex] = useState<number | null>(null);
  const [voteFailed, setVoteFailed] = useState(false);

  const fetchPoll = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<PollData>(`interactive/poll/${pollId}`);
      setPoll(res.data);
    } catch (err) {
      logger.error('Failed to load poll:', err);
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  useEffect(() => {
    fetchPoll();
  }, [fetchPoll]);

  const handleVote = async (optionIndex: number) => {
    try {
      setVotingIndex(optionIndex);
      setVoteFailed(false);
      const res = await apiClient.post<PollData>('interactive/poll/vote', {
        pollId,
        optionIndex,
      });
      setPoll(res.data);
    } catch (err) {
      logger.error('Failed to vote on poll:', err);
      // The option stays as it was: the person must know the vote did not count.
      setVoteFailed(true);
    } finally {
      setVotingIndex(null);
    }
  };

  if (loading) {
    return (
      <div
        className={`${STICKER_CARD} flex items-center justify-center py-6 text-white/60`}
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-brand-primary-text" />
        <span className="text-xs font-medium">
          {t('interactive.poll.loading')}
        </span>
      </div>
    );
  }

  if (!poll) return null;

  const hasVoted = poll.userVoteIndex !== null;

  return (
    <div className={STICKER_CARD}>
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <Vote size={13} strokeWidth={2.5} aria-hidden />
        </span>
        <h4 className={STICKER_LABEL}>{t('interactive.poll.title')}</h4>
      </div>

      <p className={STICKER_TITLE}>{poll.question}</p>

      <div className="space-y-1.5">
        {poll.options.map((option) => {
          const isSelected = poll.userVoteIndex === option.index;
          return (
            <button
              key={option.index}
              type="button"
              onClick={() => handleVote(option.index)}
              disabled={votingIndex !== null}
              aria-pressed={isSelected}
              className={`${STICKER_ROW} relative py-2 text-left overflow-hidden transition-colors ${
                isSelected ? 'border-brand-primary' : 'hover:bg-white/10'
              }`}
            >
              {hasVoted && (
                <div
                  className="absolute inset-y-0 left-0 bg-brand-primary/25 transition-all duration-500"
                  style={{ width: `${option.percentage}%` }}
                />
              )}

              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {isSelected && (
                    <Check className="w-4 h-4 text-brand-primary-text shrink-0" />
                  )}
                  <span className="text-xs font-semibold">{option.text}</span>
                </div>

                {hasVoted && (
                  <span className="text-xs font-bold text-white/80">
                    {option.percentage}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {voteFailed && (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-400">
          {t('interactive.poll.vote_error')}
        </p>
      )}

      <div className="flex justify-between items-center text-xs text-white/60 pt-2">
        <span>{t('interactive.poll.votes', { count: poll.totalVotes })}</span>
        {hasVoted && (
          <span className="text-emerald-400 font-medium">
            {t('interactive.poll.voted')}
          </span>
        )}
      </div>
    </div>
  );
};
