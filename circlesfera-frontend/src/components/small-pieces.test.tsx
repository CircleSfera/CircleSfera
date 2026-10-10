import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, profileApi, usersApi } from '../services';
import { followsApi } from '../services/follows.service';
import { useAuthStore } from '../stores/authStore';
import { renderWithProviders } from '../test/test-utils';
import EmailVerificationBanner from './auth/EmailVerificationBanner';
import ProgressiveImage from './common/ProgressiveImage';
import PendingFollowRequests from './notifications/PendingFollowRequests';
import { SuggestionsList } from './suggestions/SuggestionsList';
import { Tooltip } from './ui/Tooltip';

vi.mock('framer-motion', async () =>
  (await import('../test/still-motion')).stillMotion(),
);
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../services/follows.service', () => ({
  followsApi: {
    getPending: vi.fn(),
    acceptRequest: vi.fn(),
    rejectRequest: vi.fn(),
  },
}));
vi.mock('../services', () => ({
  authApi: { resendVerification: vi.fn() },
  profileApi: { getMyProfile: vi.fn() },
  usersApi: { getSuggestions: vi.fn() },
}));
vi.mock('./suggestions/SuggestedUserCard', () => ({
  SuggestedUserCard: ({
    user,
    layout,
  }: {
    user: { username: string };
    layout?: string;
  }) => (
    <p>
      suggested {user.username} {layout ?? 'card'}
    </p>
  ),
}));
vi.mock('./UserAvatar', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: true });
});

describe('PendingFollowRequests', () => {
  const people = [
    { id: 'p1', username: 'ana', fullName: 'Ana Ruiz', avatar: null },
    { id: 'p2', username: 'ben', fullName: null, avatar: null },
  ];
  const openList = async (lng: 'en' | 'es' = 'en') => {
    const view = renderWithProviders(<PendingFollowRequests />, { lng });
    fireEvent.click(await screen.findByRole('button', { expanded: false }));
    return view;
  };

  beforeEach(() => {
    vi.mocked(followsApi.getPending).mockResolvedValue({
      data: people,
    } as never);
    vi.mocked(followsApi.acceptRequest).mockResolvedValue({} as never);
    vi.mocked(followsApi.rejectRequest).mockResolvedValue({} as never);
  });

  it('is not there when nobody has asked to follow', async () => {
    vi.mocked(followsApi.getPending).mockResolvedValue({ data: [] } as never);
    const { container } = renderWithProviders(<PendingFollowRequests />);

    await waitFor(() => expect(followsApi.getPending).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('says how many requests are waiting and keeps them folded', async () => {
    renderWithProviders(<PendingFollowRequests />);

    expect(await screen.findByText('Follow Requests')).toBeInTheDocument();
    expect(screen.getByText('2 pending requests')).toBeInTheDocument();
    expect(screen.queryByText('@ana')).not.toBeInTheDocument();
  });

  it('counts one request in the singular, and speaks Spanish in Spanish', async () => {
    vi.mocked(followsApi.getPending).mockResolvedValue({
      data: [people[0]],
    } as never);
    const english = renderWithProviders(<PendingFollowRequests />);
    expect(await screen.findByText('1 pending request')).toBeInTheDocument();
    english.unmount();

    await openList('es');
    expect(screen.getByText('1 solicitud pendiente')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aceptar la solicitud de @ana' }),
    ).toBeInTheDocument();
  });

  it('unfolds to show each person, by name when they have one', async () => {
    await openList();

    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(screen.getByText('ben')).toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('@ana')).not.toBeInTheDocument();
  });

  it('accepts a request and reads the list again', async () => {
    await openList();

    fireEvent.click(
      screen.getByRole('button', { name: 'Accept the request of @ana' }),
    );

    await waitFor(() => expect(followsApi.getPending).toHaveBeenCalledTimes(2));
    expect(followsApi.acceptRequest).toHaveBeenCalledWith('ana');
    expect(followsApi.rejectRequest).not.toHaveBeenCalled();
  });

  it('declines a request and reads the list again', async () => {
    await openList();

    fireEvent.click(
      screen.getByRole('button', { name: 'Decline the request of @ben' }),
    );

    await waitFor(() => expect(followsApi.getPending).toHaveBeenCalledTimes(2));
    expect(followsApi.rejectRequest).toHaveBeenCalledWith('ben');
  });
});

describe('EmailVerificationBanner', () => {
  const profile = (data: object) =>
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({ data } as never);

  it('asks to confirm the email and sends the message again on request', async () => {
    profile({ emailConfirmed: false });
    vi.mocked(authApi.resendVerification).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(<EmailVerificationBanner />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      i18n!.t('auth.verify.banner'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('auth.verify.resend') }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        i18n!.t('auth.verify.resend_success'),
      ),
    );
    expect(profileApi.getMyProfile).toHaveBeenCalledTimes(2);
  });

  it('says so when the message could not be sent', async () => {
    profile({});
    vi.mocked(authApi.resendVerification).mockRejectedValue(new Error('down'));
    const { i18n } = renderWithProviders(<EmailVerificationBanner />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('auth.verify.resend'),
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('auth.verify.resend_error'),
      ),
    );
  });

  it.each([
    ['it is marked as confirmed', { emailConfirmed: true }],
    [
      'the profile carries the date of confirmation',
      { emailVerified: '2026-01-01' },
    ],
    [
      'the account carries the date of confirmation',
      { user: { emailVerified: '2026-01-01' } },
    ],
  ])('is not there when %s', async (_why, data) => {
    profile(data);
    renderWithProviders(<EmailVerificationBanner />);

    await waitFor(() => expect(profileApi.getMyProfile).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('asks nothing and shows nothing to someone not signed in', () => {
    useAuthStore.setState({ isAuthenticated: false });
    renderWithProviders(<EmailVerificationBanner />);

    expect(profileApi.getMyProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sits in the flow of the page on the immersive screens, with no spacer', async () => {
    profile({});
    const { container } = renderWithProviders(
      <EmailVerificationBanner immersive />,
    );

    expect((await screen.findByRole('status')).className).toContain('relative');
    expect(container.querySelector('[aria-hidden].h-10')).toBeNull();
  });
});

describe('SuggestionsList', () => {
  const users = Array.from({ length: 7 }, (_, i) => ({
    id: `u${i}`,
    username: `user${i}`,
  }));

  it('shows every suggestion in the row of cards', async () => {
    vi.mocked(usersApi.getSuggestions).mockResolvedValue({
      data: users,
    } as never);
    const { container } = renderWithProviders(<SuggestionsList />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);

    expect(await screen.findByText('suggested user0 card')).toBeInTheDocument();
    expect(screen.getAllByText(/^suggested/)).toHaveLength(7);
  });

  it('shows the first five as rows in the side column', async () => {
    vi.mocked(usersApi.getSuggestions).mockResolvedValue({
      data: users,
    } as never);
    const { container } = renderWithProviders(
      <SuggestionsList layout="vertical" />,
    );
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);

    expect(await screen.findByText('suggested user0 row')).toBeInTheDocument();
    expect(screen.getAllByText(/^suggested/)).toHaveLength(5);
  });

  it.each([
    [
      'there is nobody to suggest',
      () =>
        vi
          .mocked(usersApi.getSuggestions)
          .mockResolvedValue({ data: [] } as never),
    ],
    [
      'the answer is not a list',
      () =>
        vi
          .mocked(usersApi.getSuggestions)
          .mockResolvedValue({ data: null } as never),
    ],
    [
      'the request fails',
      () =>
        vi.mocked(usersApi.getSuggestions).mockRejectedValue(new Error('down')),
    ],
  ])('is not there when %s', async (_why, arrange) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    arrange();
    const { container } = renderWithProviders(<SuggestionsList />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('asks nothing and shows nothing to someone not signed in', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    const { container } = renderWithProviders(<SuggestionsList />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(usersApi.getSuggestions).not.toHaveBeenCalled();
  });
});

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const show = (props: Partial<Parameters<typeof Tooltip>[0]> = {}) =>
    renderWithProviders(
      <Tooltip content="Save for later" {...props}>
        <button type="button">Save</button>
      </Tooltip>,
    );
  const wrapper = () =>
    screen.getByRole('button', { name: 'Save' }).parentElement as HTMLElement;

  it('appears after a moment of hovering and goes when the pointer leaves', () => {
    show();
    fireEvent.mouseEnter(wrapper());
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Save for later');

    fireEvent.mouseLeave(wrapper());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not appear when the pointer only passes over', () => {
    show();
    fireEvent.mouseEnter(wrapper());
    act(() => vi.advanceTimersByTime(100));
    fireEvent.mouseLeave(wrapper());
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('appears for the keyboard too, after the wait it is given', () => {
    show({ delay: 50, position: 'bottom', className: 'extra' });
    fireEvent.focus(screen.getByRole('button', { name: 'Save' }));
    act(() => vi.advanceTimersByTime(50));

    const tip = screen.getByRole('tooltip');
    expect(tip.className).toContain('top-full');
    expect(tip.className).toContain('extra');

    fireEvent.blur(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it.each([
    ['top', 'bottom-full'],
    ['left', 'right-full'],
    ['right', 'left-full'],
  ] as const)('sits on the %s side', (position, cls) => {
    show({ position, delay: 0 });
    fireEvent.mouseEnter(wrapper());
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole('tooltip').className).toContain(cls);
  });

  it('never appears when it is switched off, and waits for nothing after it goes away', () => {
    const off = show({ disabled: true });
    fireEvent.mouseEnter(wrapper());
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    off.unmount();

    const on = show();
    fireEvent.mouseEnter(wrapper());
    on.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ProgressiveImage', () => {
  class FakeImage {
    static made: FakeImage[] = [];
    src = '';
    srcset = '';
    sizes = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      FakeImage.made.push(this);
    }
  }
  const last = () => FakeImage.made[FakeImage.made.length - 1];
  const picture = () => screen.getByRole('img', { name: 'Sunset' });

  beforeEach(() => {
    FakeImage.made = [];
    vi.stubGlobal('Image', FakeImage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the picture sharp at once when there is no small version of it', () => {
    renderWithProviders(
      <ProgressiveImage src="big.jpg" alt="Sunset" className="rounded" />,
    );

    expect(picture()).toHaveAttribute('src', 'big.jpg');
    expect(picture().className).toContain('blur-0');
    expect(picture().parentElement?.className).toContain('rounded');
    expect(FakeImage.made).toHaveLength(0);
  });

  it('shows the small version blurred, then the full one sharp once it has arrived', () => {
    renderWithProviders(
      <ProgressiveImage
        src="big.jpg"
        placeholderSrc="small.jpg"
        alt="Sunset"
        srcSet="big.jpg 2x"
        sizes="100vw"
      />,
    );

    expect(picture()).toHaveAttribute('src', 'small.jpg');
    expect(picture().className).toContain('blur-xl');
    expect(last()).toMatchObject({
      src: 'big.jpg',
      srcset: 'big.jpg 2x',
      sizes: '100vw',
    });

    act(() => last().onload?.());
    expect(picture()).toHaveAttribute('src', 'big.jpg');
    expect(picture().className).toContain('blur-0');
  });

  it('leaves the small version, sharp, when the full one cannot be loaded', () => {
    renderWithProviders(
      <ProgressiveImage
        src="big.jpg"
        placeholderSrc="small.jpg"
        alt="Sunset"
      />,
    );

    act(() => last().onerror?.());

    expect(picture()).toHaveAttribute('src', 'small.jpg');
    expect(picture().className).toContain('blur-0');
  });

  it('does not let a picture that arrives late replace the one asked for after it', () => {
    const { rerender } = renderWithProviders(
      <ProgressiveImage
        src="first.jpg"
        placeholderSrc="first-small.jpg"
        alt="Sunset"
      />,
    );
    const first = last();

    rerender(
      <ProgressiveImage
        src="second.jpg"
        placeholderSrc="second-small.jpg"
        alt="Sunset"
      />,
    );
    expect(picture()).toHaveAttribute('src', 'second-small.jpg');
    expect(first.onload).toBeNull();

    act(() => last().onload?.());
    expect(picture()).toHaveAttribute('src', 'second.jpg');
  });

  it('waits for nothing once it has gone away', () => {
    const { unmount } = renderWithProviders(
      <ProgressiveImage
        src="big.jpg"
        placeholderSrc="small.jpg"
        alt="Sunset"
      />,
    );
    unmount();
    expect(last().onload).toBeNull();
    expect(last().onerror).toBeNull();
  });

  it('treats a small version equal to the picture as none', () => {
    renderWithProviders(
      <ProgressiveImage
        src="same.jpg"
        placeholderSrc="same.jpg"
        alt="Sunset"
      />,
    );
    expect(picture().className).toContain('blur-0');
    expect(FakeImage.made).toHaveLength(0);
  });
});
