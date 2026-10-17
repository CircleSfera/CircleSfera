import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teamApi } from '../../services/team.service';
import { renderWithProviders } from '../../test/test-utils';
import TeamActivity from './TeamActivity';

vi.mock('../../services/team.service', () => ({
  teamApi: { activity: vi.fn() },
}));

const entry = (over: object) => ({
  id: 'a-1',
  action: 'POST_PUBLISHED',
  targetId: 'post-1',
  createdAt: '2026-10-10T10:00:00.000Z',
  byOwner: false,
  person: { id: 'p-ana', username: 'ana', fullName: null, avatar: null },
  ...over,
});

const page = (data: object[], current: number, totalPages: number) => ({
  data,
  meta: { total: data.length, page: current, limit: 20, totalPages },
});

describe('TeamActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names who did each thing, and loads the next page on request', async () => {
    vi.mocked(teamApi.activity)
      .mockResolvedValueOnce(
        page(
          [
            entry({}),
            entry({ id: 'a-2', action: 'PROFILE_EDITED', byOwner: true }),
          ],
          1,
          2,
        ) as never,
      )
      .mockResolvedValueOnce(
        page(
          [entry({ id: 'a-3', action: 'COMMENT_DELETED', person: null })],
          2,
          2,
        ) as never,
      );
    const { i18n } = renderWithProviders(<TeamActivity />);
    const t = (k: string, o: Record<string, unknown> = {}) =>
      i18n!.t(`settings.team.activity.${k}`, o);

    expect(await screen.findByText('@ana')).toBeInTheDocument();
    expect(screen.getByText(t('action.POST_PUBLISHED'))).toBeInTheDocument();
    expect(screen.getByText(t('you'))).toBeInTheDocument();
    expect(
      screen.getByText(t('action.PROFILE_EDITED', { context: 'you' })),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('more') }));
    // A person whose account is gone stays in the log without a name.
    expect(await screen.findByText(t('former'))).toBeInTheDocument();
    expect(teamApi.activity).toHaveBeenLastCalledWith(2);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: t('more') }),
      ).not.toBeInTheDocument(),
    );
  });

  it('says when nothing has been done yet', async () => {
    vi.mocked(teamApi.activity).mockResolvedValue(page([], 1, 0) as never);
    const { i18n } = renderWithProviders(<TeamActivity />);
    expect(
      await screen.findByText(i18n!.t('settings.team.activity.empty')),
    ).toBeInTheDocument();
  });

  it('says when the activity could not be loaded', async () => {
    vi.mocked(teamApi.activity).mockRejectedValue(new Error('down'));
    const { i18n } = renderWithProviders(<TeamActivity />);
    expect(
      await screen.findByText(i18n!.t('settings.team.activity.error')),
    ).toBeInTheDocument();
  });
});
