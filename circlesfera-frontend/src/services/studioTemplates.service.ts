import type { StudioTemplate } from '../utils/studioTemplates';
import { apiClient } from './api';

/** One of the person's own templates. */
export interface OwnTemplate {
  id: string;
  name: string;
  structure: StudioTemplate;
  postId: string | null;
  isPublic: boolean;
  uses: number;
  createdAt: string;
  updatedAt: string;
}

/** The template a Frame offers. */
export interface FrameTemplate {
  id: string;
  name: string;
  structure: StudioTemplate;
  uses: number;
  postId: string;
  author: { username: string };
}

export const studioTemplatesApi = {
  /** Saves one of the person's own, offered from their Frame when given. */
  create: (body: {
    name: string;
    structure: StudioTemplate;
    postId?: string;
    isPublic?: boolean;
  }) => apiClient.post<OwnTemplate>('studio-templates', body),

  mine: () => apiClient.get<OwnTemplate[]>('studio-templates/mine'),

  update: (id: string, body: { name?: string; isPublic?: boolean }) =>
    apiClient.patch<OwnTemplate>(`studio-templates/${id}`, body),

  remove: (id: string) => apiClient.delete(`studio-templates/${id}`),

  /** The template a Frame offers, for whoever can see the Frame. */
  ofPost: (postId: string) =>
    apiClient.get<FrameTemplate>(`studio-templates/of-post/${postId}`),

  /** Counts the person's use of a template, once. */
  use: (id: string) =>
    apiClient.post<{ uses: number }>(`studio-templates/${id}/uses`),
};
