import { apiClient } from './api';

/** Where a Frame being put together on the server is. */
export interface FrameAssemblyStatus {
  status: 'PENDING' | 'READY' | 'FAILED';
  url?: string;
}

/** A clip of a Frame as the server puts it together: its file and window. */
export interface FrameAssemblyClip {
  url: string;
  startMs: number;
  endMs: number;
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const uploadApi = {
  upload: (formData: FormData) =>
    apiClient.post<{ url: string; type: string }>(
      '/uploads',
      formData,
      multipart,
    ),
  /** Keeps a recorded clip of a Frame, only to be put together. */
  uploadFrameClip: (formData: FormData) =>
    apiClient.post<{ url: string; type: string }>(
      '/uploads/frames/clips',
      formData,
      multipart,
    ),
  /** Asks for a Frame to be put together; answers the id to ask after. */
  assembleFrame: (body: {
    clips: FrameAssemblyClip[];
    layerUrl?: string;
    muted?: boolean;
  }) => apiClient.post<{ id: string }>('/uploads/frames', body),
  frameAssemblyStatus: (id: string) =>
    apiClient.get<FrameAssemblyStatus>(`/uploads/frames/${id}`),
};
