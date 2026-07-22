import { Check, Loader2, Vote } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../services/api';
import { logger } from '../../utils/logger';

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
  const [poll, setPoll] = useState<PollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [votingIndex, setVotingIndex] = useState<number | null>(null);

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
      const res = await apiClient.post<PollData>('interactive/poll/vote', {
        pollId,
        optionIndex,
      });
      setPoll(res.data);
    } catch (err) {
      logger.error('Failed to vote on poll:', err);
    } finally {
      setVotingIndex(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-center py-6 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-accent-blue" />
        <span className="text-xs font-medium">Cargando encuesta...</span>
      </div>
    );
  }

  if (!poll) return null;

  const hasVoted = poll.userVoteIndex !== null;

  return (
    <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-3 shadow-lg">
      <div className="flex items-center space-x-2 text-accent-blue">
        <Vote className="w-4 h-4" />
        <h4 className="text-xs font-bold uppercase tracking-wider">Encuesta</h4>
      </div>

      <p className="text-sm font-bold text-white tracking-tight">
        {poll.question}
      </p>

      <div className="space-y-2 pt-1">
        {poll.options.map((option) => {
          const isSelected = poll.userVoteIndex === option.index;
          return (
            <button
              key={option.index}
              type="button"
              onClick={() => handleVote(option.index)}
              disabled={votingIndex !== null}
              className={`relative w-full p-3 rounded-xl border text-left overflow-hidden transition-all ${
                isSelected
                  ? 'border-accent-blue bg-accent-blue/10 text-white'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 text-gray-200'
              }`}
            >
              {/* Progress bar background */}
              {hasVoted && (
                <div
                  className="absolute inset-y-0 left-0 bg-accent-blue/20 transition-all duration-500"
                  style={{ width: `${option.percentage}%` }}
                />
              )}

              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {isSelected && (
                    <Check className="w-4 h-4 text-accent-blue shrink-0" />
                  )}
                  <span className="text-xs font-semibold">{option.text}</span>
                </div>

                {hasVoted && (
                  <span className="text-xs font-bold text-gray-300">
                    {option.percentage}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1">
        <span>{poll.totalVotes} votos</span>
        {hasVoted && (
          <span className="text-emerald-400 font-medium">
            ✓ Voto registrado
          </span>
        )}
      </div>
    </div>
  );
};
