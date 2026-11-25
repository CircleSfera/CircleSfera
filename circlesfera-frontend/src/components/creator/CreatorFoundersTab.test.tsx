import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FoundingCreatorView,
  foundingCreatorsApi,
} from '../../services/foundingCreators.service';
import { usersApi } from '../../services/users.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorFoundersTab, { isWebLink } from './CreatorFoundersTab';

vi.mock('../../services/foundingCreators.service', () => ({
  foundingCreatorsApi: {
    status: vi.fn(),
    apply: vi.fn(),
    startFreeYear: vi.fn(),
  },
}));
vi.mock('../../services/users.service', () => ({
  usersApi: { createIdentitySession: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const api = vi.mocked(foundingCreatorsApi);

const view = (
  over: Partial<FoundingCreatorView> = {},
): FoundingCreatorView => ({
  isOwner: true,
  isCreator: true,
  identityVerified: true,
  application: null,
  freeYear: null,
  ...over,
});
const application = (over = {}) => ({
  id: 'app-1',
  status: 'PENDING' as const,
  links: ['https://vimeo.com/ana'],
  city: 'Valencia',
  note: null,
  createdAt: '2026-11-25T10:00:00Z',
  decidedAt: null,
  declineReason: null,
  declineNote: null,
  platformSubscription: null,
  ...over,
});

describe('the founding creators page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.status.mockResolvedValue(view());
    api.apply.mockResolvedValue(view({ application: application() }));
  });

  it('sends an application of the links, the city and the note, and shows it under review', async () => {
    const { i18n } = renderWithProviders(<CreatorFoundersTab />);
    const t = i18n!.t.bind(i18n);
    const first = await screen.findByLabelText(
      t('creator.founders.link_label', { number: 1 }),
    );
    fireEvent.change(first, { target: { value: ' https://vimeo.com/ana ' } });
    fireEvent.click(screen.getByText(t('creator.founders.add_link')));
    fireEvent.change(
      screen.getByLabelText(t('creator.founders.link_label', { number: 2 })),
      { target: { value: 'https://www.tiktok.com/@ana' } },
    );
    fireEvent.change(screen.getByLabelText(t('creator.founders.city')), {
      target: { value: ' Valencia ' },
    });
    fireEvent.change(screen.getByLabelText(t('creator.founders.note')), {
      target: { value: 'Editor of reels' },
    });
    fireEvent.click(screen.getByText(t('creator.founders.send')));

    await waitFor(() =>
      expect(api.apply).toHaveBeenCalledWith({
        links: ['https://vimeo.com/ana', 'https://www.tiktok.com/@ana'],
        city: 'Valencia',
        note: 'Editor of reels',
      }),
    );
    expect(await screen.findByTestId('founders-pending')).toHaveTextContent(
      t('creator.founders.pending_title'),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it('sends nothing without a link to the work, with a link that is not a web address, or without a city', async () => {
    const { i18n } = renderWithProviders(<CreatorFoundersTab />);
    const t = i18n!.t.bind(i18n);
    fireEvent.click(await screen.findByText(t('creator.founders.send')));
    expect(
      screen.getByText(t('creator.founders.links_required')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('creator.founders.city_invalid')),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText(t('creator.founders.link_label', { number: 1 })),
      { target: { value: 'my reel' } },
    );
    fireEvent.change(screen.getByLabelText(t('creator.founders.city')), {
      target: { value: 'Valencia' },
    });
    fireEvent.click(screen.getByText(t('creator.founders.send')));
    expect(
      screen.getByText(t('creator.founders.link_invalid')),
    ).toBeInTheDocument();
    expect(api.apply).not.toHaveBeenCalled();
  });

  it('takes three links at most, and a row can be removed', async () => {
    const { i18n } = renderWithProviders(<CreatorFoundersTab />);
    const t = i18n!.t.bind(i18n);
    const add = await screen.findByText(t('creator.founders.add_link'));
    fireEvent.click(add);
    fireEvent.click(screen.getByText(t('creator.founders.add_link')));
    expect(screen.queryByText(t('creator.founders.add_link'))).toBeNull();
    fireEvent.click(
      screen.getByLabelText(t('creator.founders.remove_link', { number: 3 })),
    );
    expect(
      screen.queryByLabelText(t('creator.founders.link_label', { number: 3 })),
    ).toBeNull();
  });

  it('shows the server refusal in words', async () => {
    api.apply.mockRejectedValue({
      response: {
        status: 409,
        data: { errorCode: 'FOUNDING_CREATOR_ALREADY_APPLIED' },
      },
    });
    const { i18n } = renderWithProviders(<CreatorFoundersTab />);
    const t = i18n!.t.bind(i18n);
    fireEvent.change(
      await screen.findByLabelText(
        t('creator.founders.link_label', { number: 1 }),
      ),
      { target: { value: 'https://vimeo.com/ana' } },
    );
    fireEvent.change(screen.getByLabelText(t('creator.founders.city')), {
      target: { value: 'Valencia' },
    });
    fireEvent.click(screen.getByText(t('creator.founders.send')));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        t('errors.codes.FOUNDING_CREATOR_ALREADY_APPLIED'),
      ),
    );
  });

  it('shows a decline with its reason and note, and the form to apply again', async () => {
    api.status.mockResolvedValue(
      view({
        application: application({
          status: 'DECLINED',
          declineReason: 'OUTSIDE_LAUNCH_AREA',
          declineNote: 'Write again when we open in Madrid.',
        }),
      }),
    );
    const { i18n } = renderWithProviders(<CreatorFoundersTab />);
    const t = i18n!.t.bind(i18n);
    const card = await screen.findByTestId('founders-declined');
    expect(card).toHaveTextContent(
      t('creator.founders.reasons.OUTSIDE_LAUNCH_AREA'),
    );
    expect(card).toHaveTextContent('Write again when we open in Madrid.');
    expect(screen.getByText(t('creator.founders.send'))).toBeInTheDocument();
  });

  it('shows a free year started, until when, and where its billing is', async () => {
    api.status.mockResolvedValue(
      view({
        freeYear: 'STARTED',
        application: application({
          status: 'APPROVED',
          platformSubscription: {
            status: 'TRIALING',
            currentPeriodEnd: '2027-11-25T10:00:00Z',
            cancelAtPeriodEnd: false,
          },
        }),
      }),
    );
    const { i18n } = renderWithProviders(<CreatorFoundersTab />);
    const t = i18n!.t.bind(i18n);
    const card = await screen.findByTestId('founders-approved');
    expect(card).toHaveTextContent(t('creator.founders.approved_title'));
    expect(card).toHaveTextContent('2027');
    expect(card).toHaveTextContent(t('creator.founders.after_year'));
    expect(
      screen.getByText(t('creator.founders.see_billing')).closest('a'),
    ).toHaveAttribute('href', '/accounts/billing');
    expect(screen.queryByText(t('creator.founders.send'))).toBeNull();
  });

  it('asks to verify the identity before the year starts, and opens the check', async () => {
    vi.mocked(usersApi.createIdentitySession).mockResolvedValue({ url: '' });
    api.status.mockResolvedValue(
      view({
        identityVerified: false,
        freeYear: 'NEEDS_IDENTITY',
        application: application({ status: 'APPROVED' }),
      }),
    );
    const { i18n } = renderWithProviders(<CreatorFoundersTab />);
    const t = i18n!.t.bind(i18n);
    fireEvent.click(await screen.findByText(t('creator.founders.verify')));
    await waitFor(() =>
      expect(usersApi.createIdentitySession).toHaveBeenCalledWith(
        window.location.href,
      ),
    );
    expect(api.startFreeYear).not.toHaveBeenCalled();
  });

  it('starts a year that is ready, and says so for a Profile with a plan', async () => {
    api.status.mockResolvedValue(
      view({
        freeYear: 'READY',
        application: application({ status: 'APPROVED' }),
      }),
    );
    api.startFreeYear.mockResolvedValue(view({ freeYear: 'HAS_PLAN' }));
    const { i18n } = renderWithProviders(<CreatorFoundersTab />);
    const t = i18n!.t.bind(i18n);
    fireEvent.click(await screen.findByText(t('creator.founders.start')));
    await waitFor(() => expect(api.startFreeYear).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(t('creator.founders.started'));
  });

  it('is for Creator Profiles only', async () => {
    api.status.mockResolvedValue(view({ isCreator: false }));
    const { i18n } = renderWithProviders(<CreatorFoundersTab />);
    expect(
      await screen.findByText(i18n!.t('creator.founders.creators_only_title')),
    ).toBeInTheDocument();
    expect(screen.queryByText(i18n!.t('creator.founders.send'))).toBeNull();
  });

  it('tells a web address from anything else', () => {
    expect(isWebLink('https://vimeo.com/ana')).toBe(true);
    expect(isWebLink(' http://a.es/x ')).toBe(true);
    expect(isWebLink('vimeo.com/ana')).toBe(false);
    expect(isWebLink('javascript:alert(1)')).toBe(false);
    expect(isWebLink('ftp://a.es/x')).toBe(false);
    expect(isWebLink('https://localhost/x')).toBe(false);
    expect(isWebLink(`https://a.es/${'x'.repeat(300)}`)).toBe(false);
  });
});
