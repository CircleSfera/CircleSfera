import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAdminAppeals,
  updateAdminAppeal,
} from '../../services/appeals.service';
import { renderWithProviders } from '../../test/test-utils';
import AppealsTab from './AppealsTab';
import { adminToast } from './adminToast';

vi.mock('../../services/appeals.service', () => ({
  getAdminAppeals: vi.fn(),
  updateAdminAppeal: vi.fn(),
}));
vi.mock('./adminToast', () => ({ adminToast: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const appeal = (overrides: Record<string, unknown>) => ({
  id: 'a1',
  userId: 'user-1',
  targetType: 'POST',
  targetId: 'post-1',
  reason: 'It was a joke between friends',
  status: 'PENDING',
  adminNotes: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  user: { email: 'ana@example.com', profile: { username: 'ana' } },
  targetPreview: { text: 'the removed caption', moderationStatus: 'REMOVED' },
  ...overrides,
});
const page = (data: unknown[]) => ({
  data,
  meta: { page: 1, limit: 20, total: data.length, totalPages: 1 },
});

describe('AppealsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty queue', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([]) as never);
    const { i18n } = renderWithProviders(<AppealsTab />);

    expect(
      await screen.findByText(i18n!.t('admin.appeals.empty_title')),
    ).toBeInTheDocument();
    expect(getAdminAppeals).toHaveBeenCalledWith(1, 20, undefined);
  });

  it('filters by status and says when nothing matches', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([]) as never);
    const { i18n } = renderWithProviders(<AppealsTab />);

    fireEvent.change(
      await screen.findByLabelText(i18n!.t('admin.appeals.filter_status')),
      { target: { value: 'REJECTED' } },
    );

    expect(
      await screen.findByText(i18n!.t('admin.appeals.empty_filtered_title')),
    ).toBeInTheDocument();
    expect(getAdminAppeals).toHaveBeenLastCalledWith(1, 20, 'REJECTED');
  });

  it('shows who appealed, what was removed and a translated status', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(
      page([
        appeal({}),
        appeal({ id: 'a2', status: 'APPROVED', adminNotes: 'Context ok' }),
      ]) as never,
    );
    const { i18n } = renderWithProviders(<AppealsTab />);
    const t = i18n!.t.bind(i18n);

    expect(
      await screen.findAllByText(
        t('admin.appeals.user_label', { email: 'ana@example.com' }),
      ),
    ).toHaveLength(2);
    expect(screen.getAllByText(/the removed caption \(REMOVED\)/)).toHaveLength(
      2,
    );
    expect(screen.getByText(/Context ok/)).toBeInTheDocument();
    expect(
      screen.getByText(t('admin.appeals.status_pending'), { selector: 'span' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('admin.appeals.status_approved'), {
        selector: 'span',
      }),
    ).toBeInTheDocument();
    // Only the pending appeal can still be decided.
    expect(
      screen.getAllByRole('button', { name: t('admin.appeals.approve') }),
    ).toHaveLength(1);
  });

  it('opens the account of the person who appealed', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([appeal({})]) as never);
    const { i18n } = renderWithProviders(<AppealsTab />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('admin.appeals.open_user'),
      }),
    );

    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining('userId=user-1'),
    );
  });

  it('approves an appeal with the staff note and refreshes the queues', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([appeal({})]) as never);
    vi.mocked(updateAdminAppeal).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(<AppealsTab />);
    const t = i18n!.t.bind(i18n);

    fireEvent.click(
      await screen.findByRole('button', { name: t('admin.appeals.approve') }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: '  Satire, restore it  ' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: t('admin.appeals.approve') }),
    );

    await waitFor(() =>
      expect(updateAdminAppeal).toHaveBeenCalledWith('a1', {
        status: 'APPROVED',
        adminNotes: 'Satire, restore it',
      }),
    );
    await waitFor(() =>
      expect(adminToast).toHaveBeenCalledWith(
        t('admin.appeals.toast_updated'),
        'success',
      ),
    );
    await waitFor(() => expect(getAdminAppeals).toHaveBeenCalledTimes(2));
  });

  it('rejects without a note and reports a failed update', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([appeal({})]) as never);
    vi.mocked(updateAdminAppeal).mockRejectedValue(new Error('conflict'));
    const { i18n } = renderWithProviders(<AppealsTab />);
    const t = i18n!.t.bind(i18n);

    fireEvent.click(
      await screen.findByRole('button', { name: t('admin.appeals.reject') }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: t('admin.appeals.reject') }),
    );

    await waitFor(() =>
      expect(updateAdminAppeal).toHaveBeenCalledWith('a1', {
        status: 'REJECTED',
        adminNotes: undefined,
      }),
    );
    await waitFor(() =>
      expect(adminToast).toHaveBeenCalledWith(
        t('admin.appeals.toast_error'),
        'error',
      ),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
