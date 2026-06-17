import { apiClient } from './api';

export interface EditProjectState {
  filter: string;
  adjustments: Record<string, number>;
  cropData?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
}

export interface EditProject {
  id: string;
  userId: string;
  name?: string;
  mediaUrl: string;
  mediaType: string;
  state: EditProjectState;
  createdAt: string;
  updatedAt: string;
}

export const editsService = {
  async getProjects(): Promise<EditProject[]> {
    const { data } = await apiClient.get('/edits');
    return data;
  },

  async getProject(id: string): Promise<EditProject> {
    const { data } = await apiClient.get(`/edits/${id}`);
    return data;
  },

  async createProject(
    mediaUrl: string,
    mediaType: string,
    state: EditProjectState,
    name?: string
  ): Promise<EditProject> {
    const { data } = await apiClient.post('/edits', {
      mediaUrl,
      mediaType,
      state,
      name,
    });
    return data;
  },

  async updateProjectState(id: string, state: EditProjectState): Promise<EditProject> {
    const { data } = await apiClient.put(`/edits/${id}`, { state });
    return data;
  },

  async deleteProject(id: string): Promise<void> {
    await apiClient.delete(`/edits/${id}`);
  },
};
