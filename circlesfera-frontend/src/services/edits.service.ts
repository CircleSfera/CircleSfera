import { apiClient } from './api';

export interface OverlayElement {
  id: string;
  type: 'text' | 'image' | 'line';
  x: number;
  y: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
  text?: string;
  fill?: string;
  fontSize?: number;
  fontFamily?: string;
  points?: number[];
  strokeWidth?: number;
  shadowBlur?: number;
  src?: string; // For images
}

export interface VideoData {
  startTime?: number;
  endTime?: number;
  muted?: boolean;
}

export interface SingleEditProjectState {
  filter: string;
  adjustments: Record<string, number>;
  cropData?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  overlays?: OverlayElement[];
  videoData?: VideoData;
}

export interface EditProjectBatchItem {
  mediaUrl: string;
  mediaType: string;
  state: SingleEditProjectState;
}

export type EditProjectState =
  | SingleEditProjectState
  | {
      version: 2;
      items: EditProjectBatchItem[];
    };

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
    name?: string,
  ): Promise<EditProject> {
    const { data } = await apiClient.post('/edits', {
      mediaUrl,
      mediaType,
      state,
      name,
    });
    return data;
  },

  async updateProjectState(
    id: string,
    state: EditProjectState,
  ): Promise<EditProject> {
    const { data } = await apiClient.put(`/edits/${id}`, { state });
    return data;
  },

  async deleteProject(id: string): Promise<void> {
    await apiClient.delete(`/edits/${id}`);
  },
};
