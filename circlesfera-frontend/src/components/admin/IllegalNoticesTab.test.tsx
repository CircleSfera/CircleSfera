import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { illegalNoticesApi } from '../../services/illegalNotices.service';
import { renderWithProviders } from '../../test/test-utils';
import IllegalNoticesTab from './IllegalNoticesTab';

vi.mock('../../services/illegalNotices.service', () => ({
  illegalNoticesApi: { page: vi.fn(), decide: vi.fn() },
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
    vi.mocked(illegalNoticesApi.page).mockResolvedValue({
      data: {
        items: [
          notice(),
          notice({
            id: 'n2',
            childAbuse: true,
            notifierEmail: null,
            notifierName: null,
          }),
        ],
        nextCursor: null,
      },
    } as never);
    vi.mocked(illegalNoticesApi.decide).mockResolvedValue({} as never);
  });
  afterEach(() => vi.unstubAllGlobals());

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
    expect(illegalNoticesApi.page).toHaveBeenCalledWith('RECEIVED', undefined);
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
    vi.mocked(illegalNoticesApi.page).mockResolvedValue({
      data: {
        items: [
          notice({ status: 'NO_ACTION', decision: 'Satire, not illegal.' }),
        ],
        nextCursor: null,
      },
    } as never);
    renderWithProviders(<IllegalNoticesTab />);

    fireEvent.click(screen.getByRole('button', { name: 'No action' }));

    expect(
      (await screen.findAllByText('Satire, not illegal.'))[0],
    ).toBeInTheDocument();
    expect(illegalNoticesApi.page).toHaveBeenLastCalledWith(
      'NO_ACTION',
      undefined,
    );
  });

  it('reads the next page when the end of the tab scrolls into view', async () => {
    type Seen = (entries: { isIntersecting: boolean }[]) => void;
    const observers: Seen[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: Seen) {
          observers.push(callback);
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.mocked(illegalNoticesApi.page).mockImplementation((async (
      _status: string,
      cursor?: string,
    ) => ({
      data: cursor
        ? {
            items: [notice({ id: 'n9', explanation: 'An older notice.' })],
            nextCursor: null,
          }
        : { items: [notice()], nextCursor: 'after-n1' },
    })) as never);
    renderWithProviders(<IllegalNoticesTab />);

    await screen.findAllByText('It sells counterfeit medicines.');
    expect(screen.queryByText('An older notice.')).not.toBeInTheDocument();

    act(() => {
      for (const seen of observers) seen([{ isIntersecting: true }]);
    });

    expect(
      (await screen.findAllByText('An older notice.'))[0],
    ).toBeInTheDocument();
    expect(illegalNoticesApi.page).toHaveBeenCalledWith('RECEIVED', 'after-n1');
  });
});
