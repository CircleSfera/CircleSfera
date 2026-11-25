import {
  AD_INTEREST_TOPICS,
  AD_INTERESTS_FLAG,
  type AdInterestsStatus,
} from '@circlesfera/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adInterestsApi } from '../../services/adInterests.service';
import { useExperimentStore } from '../../stores/useExperimentStore';
import { renderWithProviders } from '../../test/test-utils';
import AdInterests from './AdInterests';

vi.mock('../../services/adInterests.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../services/adInterests.service')
  >()),
  adInterestsApi: { status: vi.fn(), choose: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const status = (over: Partial<AdInterestsStatus> = {}): AdInterestsStatus => ({
  interests: [],
  maxInterests: 3,
  allowed: true,
  dateOfBirthMissing: false,
  updatedAt: null,
  ...over,
});

const chip = (topic: string) => screen.getByTestId(`ad-interest-${topic}`);

describe('AdInterests (Settings → Ads → Your interests, PD-084)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() =>
      useExperimentStore.getState().setFlags({ [AD_INTERESTS_FLAG]: true }),
    );
  });
  afterEach(() => {
    act(() => useExperimentStore.getState().setFlags({}));
  });

  it('is not there while the ads flag is off, and asks the server nothing', () => {
    act(() =>
      useExperimentStore.getState().setFlags({ [AD_INTERESTS_FLAG]: false }),
    );
    renderWithProviders(<AdInterests />);

    expect(screen.queryByTestId('ad-interests')).not.toBeInTheDocument();
    expect(adInterestsApi.status).not.toHaveBeenCalled();
  });

  it('lists every topic but `other` by its name, with the ones chosen pressed', async () => {
    vi.mocked(adInterestsApi.status).mockResolvedValue(
      status({ interests: ['travel'] }),
    );
    const { i18n } = renderWithProviders(<AdInterests />, { lng: 'es' });

    expect(await screen.findByText('Tus intereses')).toBeInTheDocument();
    for (const topic of AD_INTEREST_TOPICS) {
      expect(chip(topic)).toHaveTextContent(
        i18n!.t(`adInterests.topics.${topic}`),
      );
    }
    expect(screen.queryByTestId('ad-interest-other')).not.toBeInTheDocument();
    expect(chip('travel')).toHaveTextContent('Viajes');
    expect(chip('travel')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('music')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('ad-interests-count')).toHaveTextContent(
      '1 de 3 elegidos',
    );
  });

  it('turns topics on and off and saves the set chosen, in the order of the list', async () => {
    const user = userEvent.setup();
    vi.mocked(adInterestsApi.status).mockResolvedValue(
      status({ interests: ['travel'] }),
    );
    vi.mocked(adInterestsApi.choose).mockResolvedValue(
      status({ interests: ['music', 'sports'] }),
    );
    renderWithProviders(<AdInterests />);

    await screen.findByTestId('ad-interests');
    // Nothing changed yet: nothing to save.
    expect(screen.getByTestId('ad-interests-save')).toBeDisabled();

    await user.click(chip('sports'));
    await user.click(chip('travel'));
    await user.click(chip('music'));
    expect(chip('travel')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('sports')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('ad-interests-save'));

    expect(adInterestsApi.choose).toHaveBeenCalledWith(['music', 'sports']);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Your interests were saved'),
    );
    expect(chip('music')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ad-interests-save')).toBeDisabled();
  });

  it('takes no more than the most: the other topics wait until one is removed', async () => {
    const user = userEvent.setup();
    vi.mocked(adInterestsApi.status).mockResolvedValue(
      status({ interests: ['music', 'travel'] }),
    );
    renderWithProviders(<AdInterests />);

    await screen.findByTestId('ad-interests');
    expect(screen.queryByTestId('ad-interests-full')).not.toBeInTheDocument();

    await user.click(chip('sports'));

    expect(screen.getByTestId('ad-interests-full')).toHaveTextContent(
      "You've chosen 3, the most you can.",
    );
    expect(chip('books')).toBeDisabled();
    // A chosen one can still be turned off.
    expect(chip('music')).toBeEnabled();

    await user.click(chip('music'));

    expect(chip('books')).toBeEnabled();
    expect(screen.queryByTestId('ad-interests-full')).not.toBeInTheDocument();
  });

  it('clears every interest at once', async () => {
    const user = userEvent.setup();
    vi.mocked(adInterestsApi.status).mockResolvedValue(
      status({ interests: ['music', 'travel'] }),
    );
    vi.mocked(adInterestsApi.choose).mockResolvedValue(status());
    renderWithProviders(<AdInterests />);

    await user.click(await screen.findByTestId('ad-interests-clear'));

    expect(adInterestsApi.choose).toHaveBeenCalledWith([]);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Your interests were cleared'),
    );
    expect(chip('music')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('ad-interests-clear')).toBeDisabled();
  });

  it('says what went wrong when the server refuses', async () => {
    const user = userEvent.setup();
    vi.mocked(adInterestsApi.status).mockResolvedValue(status());
    vi.mocked(adInterestsApi.choose).mockRejectedValue({
      status: 403,
      data: {
        errorCode: 'AD_INTERESTS_UNDER_AGE',
        details: { minAge: 18, dateOfBirthMissing: false },
      },
    });
    renderWithProviders(<AdInterests />);

    await user.click(await screen.findByTestId('ad-interest-music'));
    await user.click(screen.getByTestId('ad-interests-save'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Interests are never used for the ads of anyone under 18.',
      ),
    );
  });

  it('offers no topic to someone under 18, and lets them clear what was stored', async () => {
    vi.mocked(adInterestsApi.status).mockResolvedValue(
      status({ allowed: false, interests: ['music'] }),
    );
    renderWithProviders(<AdInterests />);

    expect(
      await screen.findByTestId('ad-interests-not-allowed'),
    ).toHaveTextContent(
      'Interests are never used for the ads of anyone under 18',
    );
    expect(screen.queryByTestId('ad-interest-music')).not.toBeInTheDocument();
    expect(screen.getByTestId('ad-interests-clear')).toBeEnabled();
  });

  it('tells an account without a date of birth why, and where to add one', async () => {
    vi.mocked(adInterestsApi.status).mockResolvedValue(
      status({ allowed: false, dateOfBirthMissing: true }),
    );
    renderWithProviders(<AdInterests />);

    expect(
      await screen.findByTestId('ad-interests-not-allowed'),
    ).toHaveTextContent('Your account has no date of birth');
    expect(
      screen.getByRole('link', {
        name: 'Verify your identity in Settings → Account',
      }),
    ).toHaveAttribute('href', '/accounts/account');
    // Nothing stored: nothing to clear.
    expect(screen.queryByTestId('ad-interests-clear')).not.toBeInTheDocument();
  });
});
