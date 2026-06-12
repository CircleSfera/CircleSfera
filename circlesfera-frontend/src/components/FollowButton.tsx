import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { followsApi } from '../services';

interface FollowButtonProps {
  username: string;
}

export default function FollowButton({ username }: FollowButtonProps) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['follow', username],
    queryFn: () => followsApi.check(username),
  });

  // Derive status from query data using useMemo instead of useEffect + useState
  const status = useMemo(() => {
    if (!data?.data) return 'NONE';
    return data.data.status || (data.data.following ? 'ACCEPTED' : 'NONE');
  }, [data]);

  const followMutation = useMutation({
    mutationFn: () => followsApi.toggle(username),
    onSuccess: (response) => {
      // Invalidate the follow query to trigger a re-fetch, which will update the derived status
      queryClient.invalidateQueries({ queryKey: ['follow', username] });
      if (response.data.following) {
        queryClient.invalidateQueries({ queryKey: ['profile', username] });
        queryClient.invalidateQueries({ queryKey: ['followers', username] });
      }
    },
  });

  const getButtonText = () => {
    if (status === 'ACCEPTED') return 'Following';
    if (status === 'PENDING') return 'Requested';
    if (status === 'BLOCKED') return 'Unblock'; // Or show blocked state differently
    return 'Follow';
  };

  const getButtonClass = () => {
    if (status === 'ACCEPTED' || status === 'PENDING') {
      return 'bg-gray-200 text-gray-800 hover:bg-gray-300';
    }
    return 'bg-linear-to-r from-brand-primary to-brand-secondary text-white hover:from-brand-secondary hover:to-brand-primary active:scale-[0.98]';
  };

  return (
    <button
      type="button"
      onClick={() => followMutation.mutate()}
      disabled={followMutation.isPending}
      className={`px-6 py-2 rounded-lg font-semibold transition disabled:opacity-50 ${getButtonClass()}`}
    >
      {followMutation.isPending ? 'Loading...' : getButtonText()}
    </button>
  );
}
