import { useExperimentStore } from '../stores/useExperimentStore';

/**
 * Hook to check if a feature flag is enabled.
 * Returns false if flags are not loaded yet or if the flag is off.
 */
export const useFeatureFlag = (flagKey: string): boolean => {
  const flags = useExperimentStore((state) => state.flags);

  // Return the flag status, defaulting to false if undefined
  return flags[flagKey] ?? false;
};

/**
 * Hook to get the loading status of experiments.
 */
export const useExperimentsLoaded = (): boolean => {
  return useExperimentStore((state) => state.isLoaded);
};
