import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { foundingCreatorsStaffApi } from '../../services/foundingCreators.service';
import { renderWithProviders } from '../../test/test-utils';
import { adminToast } from './adminToast';
import FoundingCreatorsTab from './FoundingCreatorsTab';

vi.mock('../../services/foundingCreators.service', () => ({
  foundingCreatorsStaffApi: { queue: vi.fn(), decide: vi.fn() },
}));
vi.mock('./adminToast', () => ({ adminToast: vi.fn() }));

const api = vi.mocked(foundingCreatorsStaffApi);

const application = (over = {}) => ({
  id: 'app-1',
  status: 'PENDING' as const,
  links: ['https://vimeo.com/ana', 'https://www.tiktok.com/@ana'],
  city: 'Valencia',
  note: 'Editor of reels',
  createdAt: '2026-11-25T10:00:00Z',
  platformSubscriptionId: null,
  profile: {
    id: 'p1',
    username: 'ana',
    accountType: 'CREATOR',
    verificationLevel: 'BASIC',
    user: { identityVerifiedAt: null },
  },
  ...over,
});

describe('FoundingCreatorsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.queue.mockResolvedValue({ items: [application()], total: 1 });
    api.decide.mockResolvedValue({
      ...application(),
      freeYearNotStarted: null,
    });
  });

  it('shows what staff decide on: the work, the city, the note and whether the identity is verified', async () => {
    const { i18n } = renderWithProviders(<FoundingCreatorsTab />);
    const card = await screen.findByTestId('founding-application-app-1');
    expect(card).toHaveTextContent('@ana');
    expect(card).toHaveTextContent('Valencia');
    expect(card).toHaveTextContent('Editor of reels');
    expect(card).toHaveTextContent(
      i18n!.t('admin.founding_creators.identity_missing'),
    );
    const link = screen.getByText('https://vimeo.com/ana');
    expect(link).toHaveAttribute('href', 'https://vimeo.com/ana');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  it('approves, and says when the free year waits for the identity', async () => {
    api.decide.mockResolvedValue({
      ...application(),
      status: 'APPROVED',
      freeYearNotStarted: 'IDENTITY_VERIFICATION_REQUIRED',
    });
    const { i18n } = renderWithProviders(<FoundingCreatorsTab />);
    fireEvent.click(
      await screen.findByText(i18n!.t('admin.founding_creators.approve')),
    );
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith('app-1', { approve: true }),
    );
    await waitFor(() =>
      expect(adminToast).toHaveBeenCalledWith(
        i18n!.t('admin.founding_creators.waits_identity'),
        'success',
      ),
    );
  });

  it('declines with a reason the person reads and a note', async () => {
    const { i18n } = renderWithProviders(<FoundingCreatorsTab />);
    const t = i18n!.t.bind(i18n);
    fireEvent.click(
      await screen.findByText(t('admin.founding_creators.decline')),
    );
    fireEvent.change(
      screen.getByLabelText(t('admin.founding_creators.reason')),
      {
        target: { value: 'PROGRAM_FULL' },
      },
    );
    fireEvent.change(
      screen.getByLabelText(t('admin.founding_creators.decline_note')),
      { target: { value: ' Try again in spring ' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: t('admin.founding_creators.confirm_decline'),
      }),
    );
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith('app-1', {
        approve: false,
        reason: 'PROGRAM_FULL',
        note: 'Try again in spring',
      }),
    );
  });

  it('says when nothing waits', async () => {
    api.queue.mockResolvedValue({ items: [], total: 0 });
    const { i18n } = renderWithProviders(<FoundingCreatorsTab />);
    expect(
      await screen.findByText(i18n!.t('admin.founding_creators.empty_title')),
    ).toBeInTheDocument();
  });
});
