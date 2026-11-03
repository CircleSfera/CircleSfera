import type { LiveGuestStatus } from '@circlesfera/shared';
import { apiClient as api } from './api';

/** A guest of a live, invited or on air. */
export interface LiveGuest {
  profileId: string;
  username: string;
  avatar?: string | null;
  status: LiveGuestStatus;
}

export const liveApi = {
  getActiveStreams: async () => {
    const response = await api.get('/live/active');
    return response.data;
  },

  getStream: async (streamId: string) => {
    const response = await api.get(`/live/${streamId}`);
    return response.data;
  },

  // A guest of the live, invited by the host by its Profile id.
  inviteGuest: async (streamId: string, profileId: string) => {
    const response = await api.post(`/live/${streamId}/guests`, {
      profileId,
    });
    return response.data;
  },

  // The Profile invited goes on air: answers the token that may publish.
  acceptGuestInvite: async (
    streamId: string,
  ): Promise<{ token: string; streamId: string }> => {
    const response = await api.post(`/live/${streamId}/guests/accept`);
    return response.data;
  },

  declineGuestInvite: async (streamId: string) => {
    const response = await api.post(`/live/${streamId}/guests/decline`);
    return response.data;
  },

  leaveAsGuest: async (streamId: string) => {
    const response = await api.post(`/live/${streamId}/guests/leave`);
    return response.data;
  },

  // The host takes one guest off, invited or on air.
  removeGuest: async (streamId: string, profileId: string) => {
    const response = await api.delete(`/live/${streamId}/guests/${profileId}`);
    return response.data;
  },

  // Starts Stripe Checkout for a catalog gift; returns { url, liveGiftId, amountCents }.
  sendGift: async (streamId: string, giftId: string, returnUrl?: string) => {
    const response = await api.post(`/live/${streamId}/gift`, {
      giftId,
      returnUrl: returnUrl || window.location.href,
    });
    return response.data as {
      url: string;
      liveGiftId: string;
      giftId: string;
      amountCents: number;
    };
  },
};
