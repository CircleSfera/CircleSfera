import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { followsApi } from '../services';

export const restrictionKey = (username: string) =>
  ['restriction', username] as const;

// Whether the active Profile restricts `username`, and the way to change it.
// Restricting is the active Profile's own choice: the other Profile is never
// told. Nothing is asked until `enabled`, so a closed menu costs nothing.
export function useRestriction(username: string | undefined, enabled = true) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: restrictionKey(username ?? ''),
    queryFn: () =>
      followsApi.restriction(username as string).then((r) => r.data),
    enabled: Boolean(username) && enabled,
  });
  const restricted = query.data?.restricted ?? false;

  const mutation = useMutation({
    mutationFn: (restrict: boolean) =>
      restrict
        ? followsApi.restrict(username as string)
        : followsApi.unrestrict(username as string),
    onSuccess: (res, restrict) => {
      queryClient.setQueryData(restrictionKey(username as string), res.data);
      queryClient.invalidateQueries({ queryKey: ['restrictedUsers'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(
        t(
          restrict
            ? 'restrict.restricted_toast'
            : 'restrict.unrestricted_toast',
          {
            username,
          },
        ),
      );
    },
    onError: () => toast.error(t('restrict.error')),
  });

  return {
    restricted,
    isKnown: query.isSuccess,
    isPending: mutation.isPending,
    toggle: () => mutation.mutate(!restricted),
    restrict: () => mutation.mutate(true),
  };
}
