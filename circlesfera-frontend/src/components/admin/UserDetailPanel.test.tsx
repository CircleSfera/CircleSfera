import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import UserDetailPanel from './UserDetailPanel';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getUserDetail: vi.fn(),
    getTrustScore: vi.fn(),
    getLinkedAccounts: vi.fn(),
    applyBotLabel: vi.fn(),
    clearBotLabel: vi.fn(),
  },
}));
vi.mock('../../utils/adminPanel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/adminPanel')>()),
  platformOrigin: () => 'https://platform.test',
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const api = vi.mocked(adminApi);

const dossier = (over: object = {}) => ({
  id: 'user-1',
  email: 'ana@example.com',
  isActive: true,
  role: 'USER',
  verificationLevel: 'VERIFIED',
  accountType: 'CREATOR',
  createdAt: '2026-01-15T10:00:00Z',
  identityVerifiedAt: null,
  botLabeledAt: null,
  signupIp: '203.0.113.7',
  lastIp: '203.0.113.9',
  stripeIdentitySessionId: null,
  profile: {
    username: 'ana',
    fullName: 'Ana Ruiz',
    avatar: null,
    bio: 'Photographer.\nMadrid.',
  },
  posts: [],
  reports: [],
  strikeCount: 0,
  strikes: [],
  _count: {
    posts: 12,
    comments: 34,
    stories: 5,
    liveStreams: 2,
    followers: 870,
    following: 96,
    reportsAgainst: 3,
  },
  ...over,
});

function Where() {
  const location = useLocation();
  return (
    <output data-testid="where">{location.pathname + location.search}</output>
  );
}
const show = (userId = 'user-1') =>
  renderWithProviders(
    <>
      <UserDetailPanel userId={userId} />
      <Where />
    </>,
  );
const row = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement;
const field = (label: string) =>
  screen.getByText(label, { selector: 'p' }).parentElement as HTMLElement;

describe('UserDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getUserDetail.mockResolvedValue({ data: dossier() } as never);
    api.getTrustScore.mockRejectedValue(new Error('none'));
    api.getLinkedAccounts.mockRejectedValue(new Error('none'));
    api.applyBotLabel.mockResolvedValue({} as never);
    api.clearBotLabel.mockResolvedValue({} as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('says so when the record cannot be found', async () => {
    api.getUserDetail.mockRejectedValue(new Error('no'));
    show();

    expect(
      await screen.findByText('Could not find the user record'),
    ).toBeInTheDocument();
  });

  it('shows who the account is, its state, and the link to its profile on the platform', async () => {
    show();

    expect(
      await screen.findByRole('heading', { name: 'Ana Ruiz' }),
    ).toBeInTheDocument();
    expect(api.getUserDetail).toHaveBeenCalledWith('user-1');
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(screen.getByText('Active Account')).toBeInTheDocument();
    expect(screen.getByText('Role: User')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Open profile' });
    expect(link).toHaveAttribute('href', 'https://platform.test/ana');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    expect(within(row('Email')).getByText('ana@example.com')).toBeTruthy();
    expect(
      within(row('Member since')).getByText('January 15, 2026'),
    ).toBeTruthy();
    expect(within(row('Signup IP')).getByText('203.0.113.7')).toBeTruthy();
    expect(within(row('Last IP')).getByText('203.0.113.9')).toBeTruthy();
    expect(within(row('Internal UUID')).getByText('user-1')).toBeTruthy();
    expect(screen.getByText('870')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.getByText(/Photographer\./)).toBeInTheDocument();
  });

  it('shows a banned operator without profile, with stand-ins for what is missing', async () => {
    api.getUserDetail.mockResolvedValue({
      data: dossier({
        isActive: false,
        role: 'ADMIN',
        profile: null,
        signupIp: null,
        lastIp: null,
        verificationLevel: undefined,
        accountType: undefined,
      }),
    } as never);
    show();

    expect(
      await screen.findByRole('heading', { name: 'User' }),
    ).toBeInTheDocument();
    expect(screen.getByText('@—')).toBeInTheDocument();
    expect(screen.getByText('Banned Account')).toBeInTheDocument();
    expect(screen.getByText('Role: Operator')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open profile' })).toBeNull();
    expect(within(row('Signup IP')).getByText('—')).toBeTruthy();
    expect(within(row('Last IP')).getByText('—')).toBeTruthy();
    expect(screen.queryByText('Bio')).not.toBeInTheDocument();
    expect(within(field('Verification Level')).getByText('None')).toBeTruthy();
    expect(within(field('Account Type')).getByText('Personal')).toBeTruthy();
  });

  it('shows the identity check data only when there is some', async () => {
    const first = show();
    await screen.findByRole('heading', { name: 'Ana Ruiz' });
    expect(
      within(field('Verification Level')).getByText('VERIFIED'),
    ).toBeTruthy();
    expect(within(field('Account Type')).getByText('CREATOR')).toBeTruthy();
    expect(screen.queryByText('KYC Verified On')).not.toBeInTheDocument();
    expect(screen.queryByText('Stripe Session ID')).not.toBeInTheDocument();
    first.unmount();

    api.getUserDetail.mockResolvedValue({
      data: dossier({
        identityVerifiedAt: '2026-02-01T09:30:00Z',
        stripeIdentitySessionId: 'vs_test_123',
      }),
    } as never);
    show();
    await screen.findByRole('heading', { name: 'Ana Ruiz' });
    expect(field('KYC Verified On').textContent).toMatch(/2\/1\/2026/);
    expect(
      within(field('Stripe Session ID')).getByText('vs_test_123'),
    ).toHaveAttribute('title', 'vs_test_123');
  });

  it('copies the identifier, and says so when the browser refuses', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    show();

    const copy = await screen.findByRole('button', { name: 'Copy UUID' });
    fireEvent.click(copy);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('UUID copied'),
    );
    expect(writeText).toHaveBeenCalledWith('user-1');

    writeText.mockRejectedValue(new Error('denied'));
    fireEvent.click(copy);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not copy'),
    );
  });

  it.each([
    ['Posts', 12, '/posts?userId=user-1'],
    ['Comments', 34, '/comments?userId=user-1'],
    ['Stories', 5, '/stories?userId=user-1'],
    ['Live', 2, '/live?userId=user-1'],
    ['Reports', 3, '/reports?userId=user-1'],
  ])('opens the %s queue of this account', async (label, count, path) => {
    show();
    await screen.findByRole('heading', { name: 'Ana Ruiz' });

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^${label}\\s*${count}$`),
      }),
    );
    expect(screen.getByTestId('where')).toHaveTextContent(path);
  });

  it('escapes the identifier it puts in the address', async () => {
    api.getUserDetail.mockResolvedValue({
      data: dossier({ id: 'a b&c' }),
    } as never);
    show('a b&c');
    await screen.findByRole('heading', { name: 'Ana Ruiz' });

    fireEvent.click(screen.getByRole('button', { name: /^Posts\s*12$/ }));
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/posts?userId=a%20b%26c',
    );
  });

  it('lists the reports against the account with their state', async () => {
    api.getUserDetail.mockResolvedValue({
      data: dossier({
        reports: [
          { id: 'r1', reason: 'Spam', status: 'PENDING', createdAt: '' },
          { id: 'r2', reason: 'Abuse', status: 'RESOLVED', createdAt: '' },
          { id: 'r3', reason: 'Other', status: 'REJECTED', createdAt: '' },
          { id: 'r4', reason: 'Odd', status: 'ESCALATED', createdAt: '' },
        ],
      }),
    } as never);
    show();

    expect(await screen.findByText('Pending')).toHaveClass('text-amber-400');
    expect(screen.getByText('Resolved')).toHaveClass('text-green-400');
    expect(screen.getByText('Rejected')).toHaveClass('text-white/70');
    expect(screen.getByText('ESCALATED')).toBeInTheDocument();
    expect(screen.queryByText('No reports')).not.toBeInTheDocument();
  });

  it('says when there are no reports, warnings or strikes', async () => {
    api.getUserDetail.mockResolvedValue({
      data: dossier({ strikes: undefined, strikeCount: undefined }),
    } as never);
    show();

    expect(await screen.findByText('No reports')).toBeInTheDocument();
    const strikes = screen.getByTestId('user-strikes');
    expect(
      within(strikes).getByText('Warnings and strikes (0 active)'),
    ).toBeInTheDocument();
    expect(
      within(strikes).getByText('No warnings or strikes.'),
    ).toBeInTheDocument();
  });

  it('lists warnings and strikes with their profile, state, dates and consequence', async () => {
    const strike = (id: string, over: object = {}) => ({
      id,
      kind: 'STRIKE',
      reason: 'SPAM',
      status: 'ACTIVE',
      consequence: null,
      username: 'ana',
      createdAt: '2026-02-01T10:00:00Z',
      expiresAt: '2026-05-02T10:00:00Z',
      ...over,
    });
    api.getUserDetail.mockResolvedValue({
      data: dossier({
        strikeCount: 2,
        strikes: [
          strike('s1', { kind: 'WARNING', reason: 'HARASSMENT' }),
          strike('s2', { consequence: 'SUSPENDED', username: 'ana_shop' }),
          strike('s3', { consequence: 'BANNED', status: 'EXPIRED' }),
        ],
      }),
    } as never);
    show();

    const strikes = await screen.findByTestId('user-strikes');
    expect(
      within(strikes).getByText('Warnings and strikes (2 active)'),
    ).toBeInTheDocument();
    const items = within(strikes).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Warning · Harassment · @ana');
    expect(within(items[0]).getByText('Active')).toHaveClass('text-amber-300');
    expect(items[0]).not.toHaveTextContent('Suspended');
    expect(items[1]).toHaveTextContent('Strike · Spam · @ana_shop');
    expect(items[1]).toHaveTextContent('Suspended the profile for 7 days');
    expect(items[2]).toHaveTextContent('Banned the profile');
    expect(within(items[2]).getByText('Expired')).toHaveClass('text-white/50');
  });

  it('shows the trust signals only when there are some', async () => {
    const first = show();
    await screen.findByRole('heading', { name: 'Ana Ruiz' });
    expect(screen.queryByText('Trust signals')).not.toBeInTheDocument();
    first.unmount();

    api.getTrustScore.mockResolvedValue({
      data: {
        score: 62,
        factors: [
          { key: 'age', delta: 10, label: 'Account age' },
          { key: 'reports', delta: -8, label: 'Reports upheld' },
          { key: 'email', delta: 0, label: 'Email' },
        ],
      },
    } as never);
    api.getLinkedAccounts.mockResolvedValue({
      data: { clusterSize: 4, accounts: [] },
    } as never);
    show();

    expect(await screen.findByText('62/100')).toBeInTheDocument();
    expect(screen.getByText('+10')).toHaveClass('text-green-400');
    expect(screen.getByText('-8')).toHaveClass('text-red-400');
    expect(screen.getByText('0')).toHaveClass('text-green-400');
    expect(
      screen.getByText('Linked accounts in cluster: 4'),
    ).toBeInTheDocument();
  });

  it('labels an account as a possible bot only with a reason', async () => {
    api.getLinkedAccounts.mockResolvedValue({
      data: { clusterSize: 1, accounts: [] },
    } as never);
    const ask = vi.spyOn(window, 'prompt').mockReturnValue(null);
    show();

    const apply = await screen.findByRole('button', {
      name: 'Label as possible bot',
    });
    expect(
      screen.getByRole('button', { name: 'Clear bot label' }),
    ).toBeDisabled();

    fireEvent.click(apply);
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    ask.mockReturnValue('   ');
    fireEvent.click(apply);
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(apply).toBeEnabled());
    expect(api.applyBotLabel).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    ask.mockReturnValue('  Posts every 3 seconds ');
    fireEvent.click(apply);
    await waitFor(() =>
      expect(api.applyBotLabel).toHaveBeenCalledWith(
        'user-1',
        'Posts every 3 seconds',
      ),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Updated'));
  });

  it('clears the label of a labelled account, and says so when it fails', async () => {
    api.getUserDetail.mockResolvedValue({
      data: dossier({ botLabeledAt: '2026-03-01T10:00:00Z' }),
    } as never);
    api.getTrustScore.mockResolvedValue({
      data: { score: 20, factors: [] },
    } as never);
    show();

    const clear = await screen.findByRole('button', {
      name: 'Clear bot label',
    });
    expect(
      screen.getByRole('button', { name: 'Label as possible bot' }),
    ).toBeDisabled();
    fireEvent.click(clear);
    await waitFor(() =>
      expect(api.clearBotLabel).toHaveBeenCalledWith('user-1'),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Updated'));

    api.clearBotLabel.mockRejectedValue(new Error('no'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear bot label' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed'));
  });
});
