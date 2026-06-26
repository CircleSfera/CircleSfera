import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { likesApi } from '../services';
import { Button } from './ui';

interface LikeButtonProps {
  postId: string;
  onToggle?: (liked: boolean) => void;
  iconClassName?: string;
}

export default function LikeButton({ postId, onToggle, iconClassName = "w-5 h-5" }: LikeButtonProps) {
  const queryClient = useQueryClient();
  const [isLiked, setIsLiked] = useState<boolean | null>(null);

  const { data } = useQuery({
    queryKey: ['like', postId],
    queryFn: () => likesApi.check(postId),
  });

  const likeMutation = useMutation({
    mutationFn: () => likesApi.toggle(postId),
    onSuccess: (response) => {
      const newLiked = response.data.liked;
      setIsLiked(newLiked);
      onToggle?.(newLiked);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['explore'] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const handleLike = () => {
    likeMutation.mutate();
  };

  const liked = isLiked !== null ? isLiked : data?.data.liked || false;

  return (
    <Button
      onClick={handleLike}
      variant="ghost"
      size="icon"
      className="transition-transform hover:scale-110 active:scale-95 bg-transparent border-none"
      aria-label={liked ? 'Unlike post' : 'Like post'}
    >
      {liked ? (
        <svg
          aria-hidden="true"
          className={`${iconClassName} text-red-500 fill-current`}
          viewBox="0 0 24 24"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          className={`${iconClassName} text-white transition-colors drop-shadow-lg`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
      )}
    </Button>
  );
}
