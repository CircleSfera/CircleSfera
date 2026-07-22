import { apiClient } from './api';

export const interactiveApi = {
  createPoll: (data: {
    question: string;
    options: string[];
    postId?: string;
    storyId?: string;
  }) => apiClient.post('interactive/poll', data),

  createQna: (data: { prompt: string; postId?: string; storyId?: string }) =>
    apiClient.post('interactive/qna', data),

  getPoll: (id: string) => apiClient.get(`interactive/poll/${id}`),

  votePoll: (pollId: string, optionIndex: number) =>
    apiClient.post('interactive/poll/vote', { pollId, optionIndex }),

  getQna: (id: string) => apiClient.get(`interactive/qna/${id}`),

  answerQna: (qnaBoxId: string, answerText: string) =>
    apiClient.post('interactive/qna/answer', { qnaBoxId, answerText }),
};
