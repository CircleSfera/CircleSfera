import { SUGGESTIONS_MAX } from '@circlesfera/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState } from '../components/ErrorEmptyStates';
import { LoadingSpinner } from '../components/LoadingStates';
import { SuggestedUserCard } from '../components/suggestions/SuggestedUserCard';
import { usersApi } from '../services';
import type { SuggestedUser } from '../types';
import { asList } from '../utils/asList';

// Every person Suggested for you offers, opened from its "See all", under
// the same line that says how they are chosen (PD-079).
export default function SuggestedPeople() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ['suggestions', 'all'];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: async () =>
      asList<SuggestedUser>(
        (await usersApi.getSuggestions(SUGGESTIONS_MAX)).data,
      ),
  });

  return (
    <div className="pt-24 pb-20 px-4 min-h-dvh max-w-xl mx-auto">
      <h1 className="text-2xl font-black text-white">
        {t('suggestions.title')}
      </h1>
      <p className="mt-2 mb-6 text-sm text-white/70">
        {t('suggestions.how_chosen')}
      </p>
      {isLoading ? (
        <div className="flex justify-center p-8">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon="followers" title={t('suggestions.empty')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((user) => (
            <li key={user.id} className="glass-panel rounded-xl px-1">
              <SuggestedUserCard
                user={user}
                layout="row"
                // Someone followed leaves the list, as on the short one.
                onFollow={() =>
                  queryClient.setQueryData<SuggestedUser[]>(queryKey, (list) =>
                    list?.filter((person) => person.id !== user.id),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
