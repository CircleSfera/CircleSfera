import { create } from 'zustand';
import { apiClient } from '../services/api';

interface ExperimentState {
  flags: Record<string, boolean>;
  isLoaded: boolean;
  fetchFlags: () => Promise<void>;
  setFlags: (flags: Record<string, boolean>) => void;
}

export const useExperimentStore = create<ExperimentState>((set) => ({
  flags: {},
  isLoaded: false,
  fetchFlags: async () => {
    try {
      // Use the actual API instance configured with Axios and interceptors
      const response = await apiClient.get('/experiments/my-flags');
      set({ flags: response.data, isLoaded: true });
    } catch (error) {
      console.error('Failed to fetch feature flags:', error);
      // Fallback to loaded with empty flags
      set({ isLoaded: true });
    }
  },
  setFlags: (flags) => set({ flags, isLoaded: true }),
}));
