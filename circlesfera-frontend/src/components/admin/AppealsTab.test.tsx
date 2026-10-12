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

  /** Opens the case of the appeal sent by this address. */
  const openCase = async (email = 'ana@example.com') => {
    fireEvent.click((await screen.findAllByText(email))[0]);
    return screen.findByRole('region', { name: 'Appeal' });
  };

  it('opens on what waits and says when the queue is empty', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([]) as never);
    const { i18n } = renderWithProviders(<AppealsTab />);

    expect(
      await screen.findByText(i18n!.t('admin.appeals.empty_title')),
    ).toBeInTheDocument();
    expect(getAdminAppeals).toHaveBeenCalledWith(1, 20, 'PENDING');
    expect(screen.getByRole('button', { name: 'Pending' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('changes view and says when nothing matches', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([]) as never);
    const { i18n } = renderWithProviders(<AppealsTab />);

    fireEvent.click(await screen.findByRole('button', { name: 'Rejected' }));

    expect(
      await screen.findByText(i18n!.t('admin.appeals.empty_filtered_title')),
    ).toBeInTheDocument();
    expect(getAdminAppeals).toHaveBeenLastCalledWith(1, 20, 'REJECTED');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() =>
      expect(getAdminAppeals).toHaveBeenLastCalledWith(1, 20, undefined),
    );
  });

  it('lists who appealed and what, in words, with no decision in the row', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(
      page([
        appeal({ targetType: 'POST_REMOVAL' }),
        appeal({
          id: 'a2',
          status: 'APPROVED',
          targetType: 'ACCOUNT_BAN',
          user: { email: 'ben@example.com', profile: { username: 'ben' } },
        }),
      ]) as never,
    );
    renderWithProviders(<AppealsTab />);

    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText('@ana · Post removal')).toBeInTheDocument();
    expect(screen.getByText('@ben · Ban')).toBeInTheDocument();
    expect(
      screen.getByText('Pending', { selector: 'span' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Approved', { selector: 'span' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/POST_REMOVAL|ACCOUNT_BAN/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('shows the whole case, with the state of the sanction in words', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(
      page([
        appeal({ targetType: 'POST_REMOVAL', adminNotes: 'Context ok' }),
      ]) as never,
    );
    renderWithProviders(<AppealsTab />);

    const open = await openCase();
    expect(within(open).getByText('Post removal')).toBeInTheDocument();
    expect(within(open).getByText('Removed')).toBeInTheDocument();
    expect(within(open).getByText('the removed caption')).toBeInTheDocument();
    expect(
      within(open).getByText('It was a joke between friends'),
    ).toBeInTheDocument();
    expect(within(open).getByText('Context ok')).toBeInTheDocument();
    expect(within(open).queryByText('REMOVED')).toBeNull();
  });

  it('quotes nothing more for an account, and offers no decision once decided', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(
      page([
        appeal({
          status: 'REJECTED',
          targetType: 'ACCOUNT_BAN',
          targetPreview: { moderationStatus: 'BANNED', type: 'ACCOUNT' },
        }),
      ]) as never,
    );
    renderWithProviders(<AppealsTab />);

    const open = await openCase();
    expect(within(open).getByText('Banned')).toBeInTheDocument();
    expect(within(open).queryByText('What it is about')).toBeNull();
    expect(within(open).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(open).queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(
      within(open).getByRole('button', { name: 'Open in Users' }),
    ).toBeInTheDocument();
  });

  it('says what a strike was for and what it brought, in words', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(
      page([
        appeal({
          targetType: 'STRIKE',
          targetPreview: {
            strike: {
              kind: 'STRIKE',
              reason: 'HATE_SPEECH',
              consequence: 'SUSPENDED',
            },
            moderationStatus: 'ACTIVE',
            type: 'STRIKE',
          },
        }),
        appeal({
          id: 'a2',
          user: { email: 'leo@example.com', profile: { username: 'leo' } },
          targetType: 'STRIKE',
          targetPreview: {
            strike: { kind: 'WARNING', reason: 'SPAM', consequence: 'NONE' },
            moderationStatus: 'REVOKED',
            type: 'STRIKE',
          },
        }),
      ]) as never,
    );
    renderWithProviders(<AppealsTab />);

    let open = await openCase();
    expect(
      within(open).getByText(
        'Strike · Hate speech · Profile suspended for 7 days',
      ),
    ).toBeInTheDocument();
    expect(open).not.toHaveTextContent(/HATE_SPEECH|SUSPENDED/);

    open = await openCase('leo@example.com');
    expect(within(open).getByText('Warning · Spam')).toBeInTheDocument();
  });

  it('says the score of a spam restriction and until when it holds', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(
      page([
        appeal({
          targetType: 'RESTRICTION',
          targetPreview: {
            restriction: {
              score: 82,
              restrictedUntil: '2026-09-20T10:00:00.000Z',
            },
            moderationStatus: 'RESTRICTED',
            type: 'RESTRICTION',
          },
        }),
        appeal({
          id: 'a2',
          user: { email: 'leo@example.com', profile: { username: 'leo' } },
          targetType: 'RESTRICTION',
          targetPreview: {
            restriction: { score: 75, restrictedUntil: null },
            moderationStatus: 'RESOLVED',
            type: 'RESTRICTION',
          },
        }),
      ]) as never,
    );
    renderWithProviders(<AppealsTab />);

    let open = await openCase();
    expect(
      within(open).getByText(/^Spam review, score 82 · restricted until /),
    ).toBeInTheDocument();

    open = await openCase('leo@example.com');
    expect(within(open).getByText('Spam review, score 75')).toBeInTheDocument();
  });

  it('opens the account of the person who appealed', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([appeal({})]) as never);
    renderWithProviders(<AppealsTab />);

    const open = await openCase();
    fireEvent.click(
      within(open).getByRole('button', { name: 'Open in Users' }),
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

    const open = await openCase();
    fireEvent.click(
      within(open).getByRole('button', { name: t('admin.appeals.approve') }),
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

    const open = await openCase();
    fireEvent.click(
      within(open).getByRole('button', { name: t('admin.appeals.reject') }),
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

  it('closes the case with Back and with Escape, and a dialog with Cancel', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([appeal({})]) as never);
    renderWithProviders(<AppealsTab />);

    const open = await openCase();
    fireEvent.click(within(open).getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(updateAdminAppeal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull(),
    );

    await openCase();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull(),
    );
  });

  it('closes the case once it is decided', async () => {
    vi.mocked(getAdminAppeals).mockResolvedValue(page([appeal({})]) as never);
    vi.mocked(updateAdminAppeal).mockResolvedValue({} as never);
    renderWithProviders(<AppealsTab />);

    const open = await openCase();
    fireEvent.click(within(open).getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    // The list still holds the pending copy until it is read again: the
    // case must not stay open on it.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull(),
    );
    expect(updateAdminAppeal).toHaveBeenCalledTimes(1);
  });
});
