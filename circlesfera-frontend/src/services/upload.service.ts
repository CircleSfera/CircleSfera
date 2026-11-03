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

/** What a request can be given: a signal that cancels it. */
export interface RequestOptions {
  signal?: AbortSignal;
}

export const uploadApi = {
  upload: (formData: FormData, options: RequestOptions = {}) =>
    apiClient.post<{ url: string; type: string }>('/uploads', formData, {
      ...multipart,
      ...options,
    }),
  /** Keeps a recorded clip of a Frame, only to be put together. */
  uploadFrameClip: (formData: FormData, options: RequestOptions = {}) =>
    apiClient.post<{ url: string; type: string }>(
      '/uploads/frames/clips',
      formData,
      { ...multipart, ...options },
    ),
  /** Asks for a Frame to be put together; answers the id to ask after. */
  assembleFrame: (
    body: { clips: FrameAssemblyClip[]; layerUrl?: string; muted?: boolean },
    options: RequestOptions = {},
  ) => apiClient.post<{ id: string }>('/uploads/frames', body, options),
  frameAssemblyStatus: (id: string, options: RequestOptions = {}) =>
    apiClient.get<FrameAssemblyStatus>(`/uploads/frames/${id}`, options),
};
