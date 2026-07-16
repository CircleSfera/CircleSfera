import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { followsApi } from '../services';
import { Button } from './ui';

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
    mutationFn: (user: string) => followsApi.toggle(user),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['follow', username] });
      const previousFollow = queryClient.getQueryData(['follow', username]);

      // Optimistically assume accepted if currently NONE, otherwise NONE.
      // The server response will correct this to PENDING if the account is private.
      const newStatus = status === 'NONE' ? 'ACCEPTED' : 'NONE';
      queryClient.setQueryData(['follow', username], {
        data: { status: newStatus, following: newStatus === 'ACCEPTED' },
      });

      return { previousFollow };
    },
    onError: (err, variables, context) => {
      console.error('Failed to toggle follow:', err, 'for user:', variables);
      if (context?.previousFollow) {
        queryClient.setQueryData(['follow', username], context.previousFollow);
      }
    },
    onSettled: (response) => {
      queryClient.invalidateQueries({ queryKey: ['follow', username] });
      if (response?.data?.following || status !== 'NONE') {
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

  const getButtonVariant = () => {
    if (status === 'ACCEPTED' || status === 'PENDING') {
      return 'secondary';
    }
    return 'primary';
  };

  return (
    <Button
      onClick={() => followMutation.mutate(username)}
      isLoading={followMutation.isPending}
      variant={getButtonVariant()}
      className="px-6 py-2 font-semibold"
    >
      {getButtonText()}
    </Button>
  );
}
