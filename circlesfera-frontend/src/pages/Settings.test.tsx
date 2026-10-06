import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SETTINGS_SECTION_IDS } from '../components/settings/settingsNav';
import Settings from './Settings';

vi.mock('../components/settings/AccountSettings', () => ({
  default: () => <div>panel:account</div>,
}));
vi.mock('../components/settings/AppealsSettings', () => ({
  default: () => <div>panel:appeals</div>,
}));
vi.mock('../components/settings/BillingSettings', () => ({
  default: () => <div>panel:billing</div>,
}));
vi.mock('../components/settings/CloseFriendsSettings', () => ({
  default: () => <div>panel:close_friends</div>,
}));
vi.mock('../components/settings/FeedPreferencesSettings', () => ({
  default: () => <div>panel:feed_prefs</div>,
}));
vi.mock('../components/settings/MutesSettings', () => ({
  default: () => <div>panel:mutes</div>,
}));
vi.mock('../components/settings/MyReportsSettings', () => ({
  default: () => <div>panel:reports</div>,
}));
vi.mock('../components/settings/NotificationsSettings', () => ({
  default: () => <div>panel:notifications</div>,
}));
vi.mock('../components/settings/PrivacySettings', () => ({
  default: () => <div>panel:privacy</div>,
}));
vi.mock('../components/settings/ProfileSettings', () => ({
  default: () => <div>panel:profile</div>,
}));
vi.mock('../components/settings/ProfilesSettings', () => ({
  default: () => <div>panel:profiles</div>,
}));
vi.mock('../components/settings/ReferralsSettings', () => ({
  default: () => <div>panel:referrals</div>,
}));
vi.mock('../components/settings/RequestsSettings', () => ({
  default: () => <div>panel:requests</div>,
}));
vi.mock('../components/settings/SecuritySettings', () => ({
  default: () => <div>panel:security</div>,
}));
vi.mock('../components/settings/SettingsHubIndex', () => ({
  default: () => <div>panel:hub</div>,
}));
vi.mock('../components/settings/MonetizationSettings', () => ({
  MonetizationSettings: () => <div>panel:monetization</div>,
}));
vi.mock('../components/settings/SettingsShell', () => ({
  default: ({
    section,
    children,
  }: {
    section: string | null;
    children: React.ReactNode;
  }) => (
    <div>
      <span>shell:{section ?? 'hub'}</span>
      {children}
    </div>
  ),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/accounts" element={<Settings />} />
        <Route path="/accounts/:section" element={<Settings />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Settings', () => {
  it('opens the hub at /accounts', () => {
    renderAt('/accounts');
    expect(screen.getByText('shell:hub')).toBeInTheDocument();
    expect(screen.getByText('panel:hub')).toBeInTheDocument();
  });

  it.each(SETTINGS_SECTION_IDS)(
    'opens the %s section in its own panel',
    (id) => {
      renderAt(`/accounts/${id}`);
      expect(screen.getByText(`shell:${id}`)).toBeInTheDocument();
      expect(screen.getByText(`panel:${id}`)).toBeInTheDocument();
    },
  );

  it('sends an unknown section back to the hub', () => {
    renderAt('/accounts/not-a-section');
    expect(screen.getByText('shell:hub')).toBeInTheDocument();
    expect(screen.getByText('panel:hub')).toBeInTheDocument();
  });
});
