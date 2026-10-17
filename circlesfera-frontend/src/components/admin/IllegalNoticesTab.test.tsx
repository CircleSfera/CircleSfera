import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { illegalNoticesApi } from '../../services/illegalNotices.service';
import { renderWithProviders } from '../../test/test-utils';
import IllegalNoticesTab from './IllegalNoticesTab';

vi.mock('../../services/illegalNotices.service', () => ({
  illegalNoticesApi: { list: vi.fn(), decide: vi.fn() },
}));
vi.mock('./adminToast', () => ({ adminToast: vi.fn() }));

const notice = (over = {}) => ({
  id: 'n1',
  contentUrl: 'https://circlesfera.com/p/1',
  explanation: 'It sells counterfeit medicines.',
  childAbuse: false,
  notifierName: 'Ana',
  notifierEmail: 'ana@example.com',
  status: 'RECEIVED',
  decision: null,
  decidedAt: null,
  createdAt: '2026-10-01T10:00:00Z',
  ...over,
});

describe('IllegalNoticesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(illegalNoticesApi.list).mockResolvedValue({
      data: [
        notice(),
        notice({
          id: 'n2',
          childAbuse: true,
          notifierEmail: null,
          notifierName: null,
        }),
      ],
    } as never);
    vi.mocked(illegalNoticesApi.decide).mockResolvedValue({} as never);
  });

  it('lists the notices to decide, saying which are child sexual abuse material and which are anonymous', async () => {
    renderWithProviders(<IllegalNoticesTab />);

    // The list is drawn for the phone and for the desktop.
    expect(
      (await screen.findAllByText('Child sexual abuse material'))[0],
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/From Ana \(ana@example.com\)/)[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText(/No name or email/)[0]).toBeInTheDocument();
    expect(illegalNoticesApi.list).toHaveBeenCalledWith('RECEIVED');
  });

  it('decides with the reasons, which the buttons wait for', async () => {
    renderWithProviders(<IllegalNoticesTab />);

    const [reasons] = await screen.findAllByLabelText(
      'Reasons for the notifier',
    );
    const [acted] = screen.getAllByRole('button', {
      name: 'Acted on the content',
    });
    expect(acted).toBeDisabled();
    fireEvent.change(reasons, {
      target: { value: 'Removed as an illegal sale.' },
    });
    fireEvent.click(acted);

    await waitFor(() =>
      expect(illegalNoticesApi.decide).toHaveBeenCalledWith(
        'n1',
        'ACTIONED',
        'Removed as an illegal sale.',
      ),
    );
  });

  it('shows the decided ones with their reasons', async () => {
    vi.mocked(illegalNoticesApi.list).mockResolvedValue({
      data: [notice({ status: 'NO_ACTION', decision: 'Satire, not illegal.' })],
    } as never);
    renderWithProviders(<IllegalNoticesTab />);

    fireEvent.click(screen.getByRole('button', { name: 'No action' }));

    expect(
      (await screen.findAllByText('Satire, not illegal.'))[0],
    ).toBeInTheDocument();
    expect(illegalNoticesApi.list).toHaveBeenLastCalledWith('NO_ACTION');
  });
});
