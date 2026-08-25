import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileApi } from '../../services';
import { paymentsApi } from '../../services/payments.service';
import SettingsHubIndex from './SettingsHubIndex';
import SettingsShell from './SettingsShell';

vi.mock('../../services', () => ({
  profileApi: {
    getMyProfile: vi.fn(),
  },
}));

vi.mock('../../services/payments.service', () => ({
  paymentsApi: {
    getBillingStatus: vi.fn(),
  },
}));

function renderHub() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsHubIndex />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SettingsHubIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: {
        username: 'EasyFeliu',
        fullName: 'Luis Feliu',
        avatar: null,
        isPrivate: false,
      },
    } as Awaited<ReturnType<typeof profileApi.getMyProfile>>);
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      subscription: { planName: 'Free' },
    });
  });

  it('sends Edit, plan, and visibility to the matching sections', async () => {
    renderHub();

    expect(
      await screen.findByRole('link', { name: /^edit$/i }),
    ).toHaveAttribute('href', '/accounts/profile');
    expect(
      screen.getByRole('link', { name: /subscription: free/i }),
    ).toHaveAttribute('href', '/accounts/billing');
    expect(
      screen.getByRole('link', { name: /privacy: public/i }),
    ).toHaveAttribute('href', '/accounts/privacy');
  });

  it('opens About this account from the hub', async () => {
    const user = userEvent.setup();
    renderHub();

    const aboutBtn = await screen.findByRole('button', {
      name: /about this account/i,
    });
    await user.click(aboutBtn);

    expect(
      await screen.findByRole('dialog', { name: /about this account/i }),
    ).toBeInTheDocument();
  });
});

describe('SettingsShell', () => {
  it('hides the section rail on the hub index', () => {
    render(
      <MemoryRouter>
        <SettingsShell section={null}>
          <div>hub</div>
        </SettingsShell>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('navigation', { name: /account settings/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-column')).toHaveClass(
      'max-w-xl',
      'mx-auto',
    );
  });

  it('shows the section rail inside a section', () => {
    render(
      <MemoryRouter>
        <SettingsShell section="profile">
          <div>profile</div>
        </SettingsShell>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('navigation', {
        name: /account settings/i,
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to account/i }),
    ).toHaveAttribute('href', '/accounts');
    expect(screen.getByTestId('settings-column')).toHaveClass('max-w-5xl');
  });
});
