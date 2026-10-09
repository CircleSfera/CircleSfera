import { apiClient } from './api';

export type HelpTopic = 'ACCOUNT' | 'PAYMENTS' | 'CONTENT' | 'OTHER';

/** An article of the help centre, as a list shows it. */
export interface HelpArticleLine {
  slug: string;
  topic: HelpTopic;
  title: string;
}

export interface HelpArticle extends HelpArticleLine {
  locale: string;
  body: string;
  updatedAt: string;
}

export interface HelpArticleList {
  locale: string | null;
  articles: HelpArticleLine[];
}

// The help centre is public: these work with and without a session.
export const helpCentreApi = {
  list: (locale: string, search?: string) =>
    apiClient.get<HelpArticleList>('/help/articles', {
      params: { locale, ...(search !== undefined && { q: search }) },
    }),

  article: (slug: string, locale: string) =>
    apiClient.get<HelpArticle>(`/help/articles/${encodeURIComponent(slug)}`, {
      params: { locale },
    }),
};
