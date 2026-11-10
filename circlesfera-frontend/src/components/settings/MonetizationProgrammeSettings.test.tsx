import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monetizationApi } from '../../services/monetization.service';
import { renderWithProviders } from '../../test/test-utils';
import MonetizationProgrammeSettings from './MonetizationProgrammeSettings';

vi.mock('../../services/monetization.service', () => ({
  MONETIZATION_PITCH_MIN: 20,
  MONETIZATION_PITCH_MAX: 500,
  monetizationApi: { applyToProgramme: vi.fn() },
}));
const reportPaymentError = vi.hoisted(() => vi.fn());
vi.mock('../../utils/identityVerification', () => ({ reportPaymentError }));

const programme = (over: object = {}) => ({
  status: 'NONE' as const,
  appliedAt: null,
  reviewedAt: null,
  note: null,
  ...over,
});

// The monetization programme as a creator meets it.
describe('MonetizationProgrammeSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies once what will be offered is long enough', async () => {
    vi.mocked(monetizationApi.applyToProgramme).mockResolvedValue(
      programme({ status: 'PENDING' }) as never,
    );
    renderWithProviders(
      <MonetizationProgrammeSettings programme={programme()} />,
    );

    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByLabelText('What will you offer?'), {
      target: { value: 'too short' },
    });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByLabelText('What will you offer?'), {
      target: { value: '  Weekly cooking classes and recipes  ' },
    });
    expect(screen.getByText(/so far/)).toHaveTextContent('(34 so far)');
    fireEvent.click(apply);

    await waitFor(() =>
      expect(monetizationApi.applyToProgramme).toHaveBeenCalledWith(
        'Weekly cooking classes and recipes',
      ),
    );
  });

  it('says why an application could not be sent', async () => {
    vi.mocked(monetizationApi.applyToProgramme).mockRejectedValue(
      new Error('under age'),
    );
    renderWithProviders(
      <MonetizationProgrammeSettings programme={programme()} />,
    );
    fireEvent.change(screen.getByLabelText('What will you offer?'), {
      target: { value: 'Weekly cooking classes and recipes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(reportPaymentError).toHaveBeenCalled());
  });

  it('says an application is being reviewed, since when, with nothing to send', () => {
    renderWithProviders(
      <MonetizationProgrammeSettings
        programme={programme({
          status: 'PENDING',
          appliedAt: '2026-11-09T10:00:00.000Z',
        })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /Your application is under review since/,
    );
    expect(
      screen.queryByRole('button', { name: 'Apply' }),
    ).not.toBeInTheDocument();
  });

  it('gives the reason of a refusal or a revocation, and lets the Profile apply again', () => {
    const { unmount } = renderWithProviders(
      <MonetizationProgrammeSettings
        programme={programme({ status: 'REJECTED', note: 'Too new yet' })}
      />,
    );
    expect(screen.getByText('Reason: Too new yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <MonetizationProgrammeSettings
        programme={programme({ status: 'REVOKED', note: 'Adult content' })}
      />,
    );
    expect(screen.getByText('Reason: Adult content')).toBeInTheDocument();
  });

  it('says an approved Profile can charge, in Spanish too', () => {
    renderWithProviders(
      <MonetizationProgrammeSettings
        programme={programme({ status: 'APPROVED' })}
      />,
      { lng: 'es' },
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Aprobado: puedes cobrar.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
