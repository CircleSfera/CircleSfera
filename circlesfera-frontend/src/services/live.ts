import type {
  LiveGuestStatus,
  LiveScheduleAudience,
  ScheduledLiveStatus,
} from '@circlesfera/shared';
import { asList } from '../utils/asList';
import { apiClient as api } from './api';

/** A guest of a live, invited or on air. */
export interface LiveGuest {
  profileId: string;
  username: string;
  avatar?: string | null;
  status: LiveGuestStatus;
}

/** A live its host means to start later, as the server answers it. */
export interface ScheduledLive {
  id: string;
  hostId: string;
  title: string;
  audience: LiveScheduleAudience;
  /** When it starts, as an ISO 8601 date and time. */
  startsAt: string;
  status: ScheduledLiveStatus;
  /** Whether the viewer asked to be reminded of it. */
  reminded: boolean;
  /** How many asked to be reminded of it: answered to its host only. */
  reminderCount?: number;
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

  // The upcoming lives of a Profile that the viewer may see, soonest first.
  listScheduled: async (profileId: string): Promise<ScheduledLive[]> => {
    const response = await api.get('/live/scheduled', {
      params: { profileId },
    });
    return asList<ScheduledLive>(response.data);
  },

  // The host schedules a live; the server checks the time and the audience.
  schedule: async (body: {
    title: string;
    audience: LiveScheduleAudience;
    startsAt: string;
  }): Promise<ScheduledLive> => {
    const response = await api.post('/live/scheduled', body);
    return response.data;
  },

  // The host cancels an upcoming live of theirs; nobody is told.
  cancelScheduled: async (id: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/live/scheduled/${id}`);
    return response.data;
  },

  // A viewer asks to be reminded of an upcoming live, or takes it back.
  remind: async (id: string): Promise<{ reminded: boolean }> => {
    const response = await api.post(`/live/scheduled/${id}/reminder`);
    return response.data;
  },

  unremind: async (id: string): Promise<{ reminded: boolean }> => {
    const response = await api.delete(`/live/scheduled/${id}/reminder`);
    return response.data;
  },
};
