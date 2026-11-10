import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import FirstPaidReview from './FirstPaidReview';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getFirstPaidReview: vi.fn(),
    approveFirstPaid: vi.fn(),
    updateModerationStatus: vi.fn(),
  },
}));

const api = vi.mocked(adminApi);
const onToast = vi.fn();

const item = (over: object = {}) => ({
  type: 'POST',
  id: 'post-1',
  caption: 'Recetas de otoño',
  priceCents: 500,
  createdAt: '2026-11-01T10:00:00Z',
  profile: { id: 'p-1', username: 'ana', avatar: null },
  media: [{ url: 'a.jpg', thumbnailUrl: 'a-t.jpg', type: 'image' }],
  passedByStaff: 1,
  ...over,
});
const waiting = (items: object[]) => ({ data: { items, needed: 3 } }) as never;
const show = () => renderWithProviders(<FirstPaidReview onToast={onToast} />);

describe('FirstPaidReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.approveFirstPaid.mockResolvedValue({} as never);
    api.updateModerationStatus.mockResolvedValue({} as never);
  });

  it('shows nothing while nothing waits', async () => {
    api.getFirstPaidReview.mockResolvedValue(waiting([]));
    const { container } = show();
    await waitFor(() => expect(api.getFirstPaidReview).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each paid item with its creator, price and how many a person checked', async () => {
    api.getFirstPaidReview.mockResolvedValue(
      waiting([
        item(),
        item({
          type: 'STORY',
          id: 'story-1',
          caption: null,
          media: [{ url: 's.mp4', thumbnailUrl: null, type: 'video' }],
        }),
      ]),
    );
    show();

    expect(
      await screen.findByRole('heading', { name: 'First paid content' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('@ana')).toHaveLength(2);
    expect(screen.getByText('Recetas de otoño')).toBeInTheDocument();
    expect(screen.getAllByText(/€5\.00.*1 of 3 checked/)).toHaveLength(2);
  });

  it('approves an item for sale', async () => {
    api.getFirstPaidReview.mockResolvedValue(waiting([item()]));
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Approve for sale' }),
    );

    await waitFor(() =>
      expect(api.approveFirstPaid).toHaveBeenCalledWith('POST', 'post-1'),
    );
    expect(onToast).toHaveBeenCalledWith('On sale now', 'success');
  });

  it('removes an item only with a reason the creator reads', async () => {
    api.getFirstPaidReview.mockResolvedValue(waiting([item()]));
    show();

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Remove' });
    expect(submit).toBeDisabled();

    fireEvent.change(
      within(dialog).getByLabelText('Reason the creator reads'),
      {
        target: { value: '  Not the content described  ' },
      },
    );
    fireEvent.click(submit);

    await waitFor(() =>
      expect(api.updateModerationStatus).toHaveBeenCalledWith(
        'POST',
        'post-1',
        'REMOVED',
        'Not the content described',
      ),
    );
    expect(onToast).toHaveBeenCalledWith('Removed', 'success');
  });

  it('says when a decision could not be made', async () => {
    api.getFirstPaidReview.mockResolvedValue(waiting([item()]));
    api.approveFirstPaid.mockRejectedValue(new Error('down'));
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Approve for sale' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'That could not be done. Try again.',
        'error',
      ),
    );
  });
});
