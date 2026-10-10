import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import ModerationTab from './ModerationTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getModerationQueue: vi.fn(),
    updateModerationStatus: vi.fn(),
  },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
vi.mock('./AppealsList', () => ({
  default: (props: {
    statusFilter: string;
    limit: number;
    showPagination: boolean;
  }) => (
    <div data-testid="appeals">
      {props.statusFilter}/{props.limit}/{String(props.showPagination)}
    </div>
  ),
}));

const api = vi.mocked(adminApi);
const onToast = vi.fn();

const item = (id: string, over: object = {}) => ({
  id,
  entityType: 'POST',
  caption: `Caption ${id}`,
  createdAt: '2026-03-02T10:00:00Z',
  media: null,
  moderationStatus: 'FLAGGED',
  moderationNote: `[AI Automated Flag]: Reason ${id}`,
  user: { profile: { username: `person_${id}`, avatar: null } },
  ...over,
});
const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit: 20,
      totalPages,
    },
  },
});
const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });
const dialog = () => screen.getByRole('dialog');
const show = () => renderWithProviders(<ModerationTab onToast={onToast} />);
const press = (key: string) => fireEvent.keyDown(window, { key });
const openedHandle = () =>
  within(detail()).queryByRole('heading', { level: 3 })?.textContent;

describe('ModerationTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getModerationQueue.mockResolvedValue(list([]) as never);
    api.updateModerationStatus.mockResolvedValue({} as never);
  });

  it('says when nothing is waiting', async () => {
    show();

    expect(await screen.findByText('No pending content')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('lists each flagged piece with its author, kind and the reason without its prefix', async () => {
    api.getModerationQueue.mockResolvedValue(
      list([
        item('1', {
          media: [{ url: 'https://cdn.test/1.jpg', thumbnailUrl: null }],
        }),
        item('2', {
          entityType: 'COMMENT',
          caption: null,
          moderationNote: null,
          user: null,
        }),
      ]) as never,
    );
    show();

    const first = await waitFor(() => rowOf('Caption 1'));
    expect(within(first).getByText('@person_1')).toBeInTheDocument();
    expect(within(first).getByText('POST')).toBeInTheDocument();
    expect(within(first).getByText('Reason 1')).toBeInTheDocument();
    expect(first.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.test/1.jpg',
    );

    const second = rowOf('No text');
    expect(within(second).getByText('@—')).toBeInTheDocument();
    expect(within(second).getByText('COMMENT')).toBeInTheDocument();
    expect(within(second).getByText('Flagged')).toBeInTheDocument();
    expect(second.querySelector('img')).toBeNull();
  });

  it('asks for the queue by kind, search and page', async () => {
    api.getModerationQueue.mockResolvedValue(list([item('1')], 1, 3) as never);
    show();
    await waitFor(() => rowOf('Caption 1'));
    expect(api.getModerationQueue).toHaveBeenLastCalledWith(
      1,
      20,
      undefined,
      undefined,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(api.getModerationQueue).toHaveBeenLastCalledWith(
        2,
        20,
        undefined,
        undefined,
      ),
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'STORY' },
    });
    await waitFor(() =>
      expect(api.getModerationQueue).toHaveBeenLastCalledWith(
        1,
        20,
        'STORY',
        undefined,
      ),
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search...' }), {
      target: { value: 'spam' },
    });
    await waitFor(() =>
      expect(api.getModerationQueue).toHaveBeenLastCalledWith(
        1,
        20,
        'STORY',
        'spam',
      ),
    );
  });

  it('opens a piece with its reason, text and picture', async () => {
    api.getModerationQueue.mockResolvedValue(
      list([
        item('1', {
          media: [
            { url: 'https://cdn.test/1.jpg' },
            { url: 'https://cdn.test/1b.jpg' },
          ],
        }),
      ]) as never,
    );
    show();
    fireEvent.click(await waitFor(() => rowOf('Caption 1')));

    const pane = detail();
    expect(
      await within(pane).findByRole('heading', { name: '@person_1' }),
    ).toBeInTheDocument();
    expect(
      within(pane).getByText('[AI Automated Flag]: Reason 1'),
    ).toBeInTheDocument();
    expect(within(pane).getByText('Caption 1')).toBeInTheDocument();
    expect(within(pane).getByText('1/2')).toBeInTheDocument();
    expect(
      pane.querySelector('img[src="https://cdn.test/1.jpg"]'),
    ).toBeTruthy();
    expect(pane.querySelector('video')).toBeNull();
  });

  it('opens a video with its player, and a piece with no text or reason with the stand-in words', async () => {
    api.getModerationQueue.mockResolvedValue(
      list([
        item('1', {
          media: [{ url: 'https://cdn.test/1.mp4', type: 'video/mp4' }],
        }),
        item('2', { caption: null, moderationNote: null, user: null }),
      ]) as never,
    );
    show();
    fireEvent.click(await waitFor(() => rowOf('Caption 1')));
    await waitFor(() =>
      expect(detail().querySelector('video')).toHaveAttribute(
        'src',
        'https://cdn.test/1.mp4',
      ),
    );

    fireEvent.click(rowOf('No text'));
    expect(
      await within(detail()).findByRole('heading', { name: '@—' }),
    ).toBeInTheDocument();
    expect(
      within(detail()).getByText('Content flagged for policy violation.'),
    ).toBeInTheDocument();
    expect(within(detail()).getByText('No text')).toBeInTheDocument();
  });

  it('approves the open piece and moves on to the next one', async () => {
    api.getModerationQueue.mockResolvedValue(
      list([item('1'), item('2')]) as never,
    );
    show();
    fireEvent.click(await waitFor(() => rowOf('Caption 1')));
    fireEvent.click(
      await within(detail()).findByRole('button', { name: 'Approve (Safe)' }),
    );

    await waitFor(() =>
      expect(api.updateModerationStatus).toHaveBeenCalledWith(
        'POST',
        '1',
        'VISIBLE',
        'Approved (false positive)',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Content approved successfully',
        'success',
      ),
    );
    await waitFor(() => expect(openedHandle()).toBe('@person_2'));
  });

  it('removes the open piece only after confirming, and closes the pane after the last one', async () => {
    api.getModerationQueue.mockResolvedValue(
      list([item('1', { entityType: 'STORY' })]) as never,
    );
    show();
    fireEvent.click(await waitFor(() => rowOf('Caption 1')));
    fireEvent.click(
      await within(detail()).findByRole('button', { name: 'Delete' }),
    );

    expect(
      within(dialog()).getByText(
        'This action will permanently remove the content from the platform. Are you sure?',
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.updateModerationStatus).not.toHaveBeenCalled();

    fireEvent.click(within(detail()).getByRole('button', { name: 'Delete' }));
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Yes, Delete' }),
    );
    await waitFor(() =>
      expect(api.updateModerationStatus).toHaveBeenCalledWith(
        'STORY',
        '1',
        'REMOVED',
        'Permanently removed by moderation',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Content removed successfully',
        'success',
      ),
    );
    await waitFor(() => expect(openedHandle()).toBeUndefined());
  });

  it('says so when a decision could not be saved, and stays on the piece', async () => {
    api.getModerationQueue.mockResolvedValue(
      list([item('1'), item('2')]) as never,
    );
    api.updateModerationStatus.mockRejectedValue(new Error('no'));
    show();
    fireEvent.click(await waitFor(() => rowOf('Caption 1')));
    fireEvent.click(
      await within(detail()).findByRole('button', { name: 'Approve (Safe)' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Failed to process moderation',
        'error',
      ),
    );
    expect(openedHandle()).toBe('@person_1');
  });

  it('moves through the queue with the keyboard, and not while typing', async () => {
    api.getModerationQueue.mockResolvedValue(
      list([item('1'), item('2')]) as never,
    );
    show();
    await waitFor(() => rowOf('Caption 1'));

    press('ArrowLeft');
    expect(openedHandle()).toBeUndefined();
    press('ArrowRight');
    await waitFor(() => expect(openedHandle()).toBe('@person_1'));
    press('s');
    await waitFor(() => expect(openedHandle()).toBe('@person_2'));
    press('ArrowRight');
    expect(openedHandle()).toBe('@person_2');
    press('ArrowLeft');
    await waitFor(() => expect(openedHandle()).toBe('@person_1'));
    press('ArrowLeft');
    expect(openedHandle()).toBe('@person_1');

    screen.getByRole('textbox', { name: 'Search...' }).focus();
    press('ArrowRight');
    press('r');
    expect(openedHandle()).toBe('@person_1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before removing the open piece from the keyboard', async () => {
    api.getModerationQueue.mockResolvedValue(list([item('1')]) as never);
    show();
    await waitFor(() => rowOf('Caption 1'));

    press('r');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    press('ArrowRight');
    await waitFor(() => expect(openedHandle()).toBe('@person_1'));
    press('R');
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Yes, Delete' }),
    );
    await waitFor(() =>
      expect(api.updateModerationStatus).toHaveBeenCalledWith(
        'POST',
        '1',
        'REMOVED',
        'Permanently removed by moderation',
      ),
    );
  });

  it('asks before approving the open piece from the keyboard', async () => {
    api.getModerationQueue.mockResolvedValue(list([item('1')]) as never);
    show();
    await waitFor(() => rowOf('Caption 1'));

    press('a');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    press('ArrowRight');
    await waitFor(() => expect(openedHandle()).toBe('@person_1'));
    press('a');
    expect(dialog()).toBeInTheDocument();
    expect(api.updateModerationStatus).not.toHaveBeenCalled();
  });

  it('approves or hides several pieces at once', async () => {
    api.getModerationQueue.mockResolvedValue(
      list([
        item('1'),
        item('2', { entityType: 'COMMENT' }),
        item('3'),
      ]) as never,
    );
    show();
    const first = await waitFor(() => rowOf('Caption 1'));

    fireEvent.click(within(first).getByRole('checkbox'));
    fireEvent.click(within(rowOf('Caption 2')).getByRole('checkbox'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    // Ticking a row does not open it.
    expect(openedHandle()).toBeUndefined();

    fireEvent.click(within(first).getByRole('checkbox'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve (False Positive)' }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        '1 items approved successfully',
        'success',
      ),
    );
    expect(api.updateModerationStatus).toHaveBeenCalledTimes(1);
    expect(api.updateModerationStatus).toHaveBeenCalledWith(
      'COMMENT',
      '2',
      'VISIBLE',
      'Batch approved',
    );
    await waitFor(() =>
      expect(screen.queryByText('1 selected')).not.toBeInTheDocument(),
    );

    const all = screen.getAllByRole('checkbox')[0];
    fireEvent.click(all);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(all).toBeChecked();
    fireEvent.click(all);
    await waitFor(() =>
      expect(screen.queryByText('3 selected')).not.toBeInTheDocument(),
    );

    fireEvent.click(all);
    api.updateModerationStatus.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Hide from feeds' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        '3 items hidden successfully',
        'success',
      ),
    );
    expect(api.updateModerationStatus).toHaveBeenCalledTimes(3);
    expect(api.updateModerationStatus).toHaveBeenCalledWith(
      'POST',
      '3',
      'HIDDEN',
      'Batch hidden',
    );
  });

  it('says so when a decision on several pieces fails, and keeps them ticked', async () => {
    api.getModerationQueue.mockResolvedValue(list([item('1')]) as never);
    api.updateModerationStatus.mockRejectedValue(new Error('no'));
    show();
    const row = await waitFor(() => rowOf('Caption 1'));

    fireEvent.click(within(row).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Hide from feeds' }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to process batch', 'error'),
    );
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('shows the pending appeals in its second view, with the way to the full screen', async () => {
    api.getModerationQueue.mockResolvedValue(list([item('1')]) as never);
    show();
    await waitFor(() => rowOf('Caption 1'));

    fireEvent.click(screen.getByRole('button', { name: 'Appeals' }));
    expect(screen.getByTestId('appeals')).toHaveTextContent('PENDING/5/false');
    expect(
      screen.getByRole('link', { name: 'View full panel' }),
    ).toHaveAttribute('href', '/appeals');
    expect(
      screen.queryByRole('textbox', { name: 'Search...' }),
    ).not.toBeInTheDocument();

    // The keyboard of the queue is off here.
    press('ArrowRight');
    fireEvent.click(screen.getByRole('button', { name: 'Moderation Queue' }));
    await waitFor(() => rowOf('Caption 1'));
    expect(openedHandle()).toBeUndefined();
  });
});
