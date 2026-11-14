import { useQuery } from '@tanstack/react-query';
import { editsService } from '../services/edits.service';

/**
 * Whether the Profile in use has Edits Studio Pro, as the server says.
 * Asked once a minute at most, and only while something needs it.
 */
export function useStudioPro(enabled = true) {
  const query = useQuery({
    queryKey: ['studio-pro'],
    queryFn: () => editsService.getStudioPro(),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
  return {
    pro: query.data?.pro === true,
    pending: enabled && query.isPending,
    failed: query.isError,
  };
}
