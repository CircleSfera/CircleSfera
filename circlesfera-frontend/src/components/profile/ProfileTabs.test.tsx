import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';

async function show() {
  const { default: ProfileTabs } = await import('./ProfileTabs');
  renderWithProviders(
    <ProfileTabs activeTab="posts" setActiveTab={vi.fn()} isMe canView />,
  );
}

describe('ProfileTabs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('shows no Lives tab where broadcasts are not recorded', async () => {
    await show();
    expect(screen.queryByLabelText(/lives|directos/i)).toBeNull();
    expect(screen.getAllByRole('button').length).toBe(4);
  });

  it('shows the Lives tab where broadcasts are recorded', async () => {
    vi.stubEnv('VITE_LIVE_RECORDING_ENABLED', 'true');
    vi.resetModules();
    await show();
    expect(screen.getAllByRole('button').length).toBe(5);
  });
});
