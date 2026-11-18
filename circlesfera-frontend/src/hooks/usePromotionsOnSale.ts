import { useQuery } from '@tanstack/react-query';
import { creatorApi } from '../services/creator.service';
import { useAuthStore } from '../stores/authStore';
import { hasCreatorTools } from '../utils/creatorTools';
import { sellsInApp } from '../utils/sellsInApp';

/**
 * Whether this Profile may be offered to buy a promotion: a Creator or
 * Business Profile, on the web (the apps sell nothing), while promotions are
 * on sale. Until the server answers, nothing is offered.
 */
export function usePromotionsOnSale(): boolean {
  const accountType = useAuthStore((state) => state.profile?.accountType);
  const could = hasCreatorTools(accountType) && sellsInApp();
  const query = useQuery({
    queryKey: ['promotions-on-sale'],
    queryFn: () => creatorApi.getPromotionsOnSale().then((r) => r.data),
    enabled: could,
    staleTime: 60_000,
    retry: 1,
  });
  return could && query.data?.onSale === true;
}
