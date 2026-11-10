import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import MonetizationApplications from './MonetizationApplications';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getMonetizationApplications: vi.fn(),
    decideMonetizationApplication: vi.fn(),
  },
}));
const adminToast = vi.hoisted(() => vi.fn());
vi.mock('./adminToast', () => ({ adminToast }));

const application = (over: object = {}) => ({
  id: 'p1',
  username: 'ana_cocina',
  fullName: 'Ana',
  avatar: null,
  accountType: 'CREATOR',
  createdAt: '2026-01-01T00:00:00.000Z',
  isAccountBanned: false,
  suspendedUntil: null,
  monetizationStatus: 'PENDING',
  monetizationAppliedAt: '2026-11-09T10:00:00.000Z',
  monetizationPitch: 'Weekly cooking classes',
  monetizationReviewedAt: null,
  monetizationReviewedBy: null,
  monetizationNote: null,
  _count: { followers: 120, posts: 30 },
  ...over,
});
const page = (items: unknown[], extra: object = {}) => ({
  data: { items, total: items.length, page: 1, totalPages: 1, ...extra },
});

// The monetization programme in the Admin Panel.
describe('MonetizationApplications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.decideMonetizationApplication).mockResolvedValue(
      {} as never,
    );
  });

  it('lists pending applications and approves one', async () => {
    vi.mocked(adminApi.getMonetizationApplications).mockResolvedValue(
      page([application()]) as never,
    );
    renderWithProviders(<MonetizationApplications />);

    expect(await screen.findByText('@ana_cocina')).toBeInTheDocument();
    expect(screen.getByText('Weekly cooking classes')).toBeInTheDocument();
    expect(screen.getByText(/120 followers · 30 posts/)).toBeInTheDocument();
    expect(adminApi.getMonetizationApplications).toHaveBeenCalledWith(
      'PENDING',
      1,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(adminApi.decideMonetizationApplication).toHaveBeenCalledWith(
        'p1',
        'approve',
        undefined,
      ),
    );
    expect(adminToast).toHaveBeenCalledWith(
      'Approved: the Profile can charge.',
    );
  });

  it('refuses with a reason, which it asks for first', async () => {
    vi.mocked(adminApi.getMonetizationApplications).mockResolvedValue(
      page([application()]) as never,
    );
    renderWithProviders(<MonetizationApplications />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refuse' }));

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Refuse' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: ' Too new yet ' },
    });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(adminApi.decideMonetizationApplication).toHaveBeenCalledWith(
        'p1',
        'reject',
        'Too new yet',
      ),
    );
  });

  it('revokes an approved Profile, and says so when saving fails', async () => {
    vi.mocked(adminApi.getMonetizationApplications).mockImplementation(
      async (status) =>
        (status === 'APPROVED'
          ? page([application({ monetizationStatus: 'APPROVED' })])
          : page([])) as never,
    );
    vi.mocked(adminApi.decideMonetizationApplication).mockRejectedValueOnce(
      new Error('down'),
    );
    renderWithProviders(<MonetizationApplications />);

    expect(
      await screen.findByText('No applications here.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approved' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Adult content' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() =>
      expect(adminToast).toHaveBeenCalledWith(
        'The decision could not be saved. Try again.',
        'error',
      ),
    );
    // Closing the question forgets the reason.
    fireEvent.keyDown(document, { key: 'Escape' });
  });

  it('pages through many applications', async () => {
    vi.mocked(adminApi.getMonetizationApplications).mockResolvedValue(
      page([application()], { total: 41, totalPages: 3 }) as never,
    );
    renderWithProviders(<MonetizationApplications />);
    await screen.findByText('@ana_cocina');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(adminApi.getMonetizationApplications).toHaveBeenLastCalledWith(
        'PENDING',
        2,
      ),
    );
  });
});
