import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentsApi } from '../services/payments.service';
import { usersApi } from '../services/users.service';
import { renderWithProviders } from '../test/test-utils';
import { DataExportSettings } from './DataExportSettings';

vi.mock('../services/users.service', () => ({
  usersApi: { getExportHistory: vi.fn(), requestExport: vi.fn() },
}));
vi.mock('../services/payments.service', () => ({
  paymentsApi: { getLedger: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const users = vi.mocked(usersApi);
const payments = vi.mocked(paymentsApi);
const anExport = (id: string, over: object = {}) => ({
  id,
  status: 'COMPLETED',
  url: `https://files.example/${id}.zip`,
  createdAt: '2026-03-01T10:00:00Z',
  ...over,
});
const show = () => renderWithProviders(<DataExportSettings />);

describe('DataExportSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    users.getExportHistory.mockResolvedValue({ data: [] } as never);
    users.requestExport.mockResolvedValue({ data: { message: 'ok' } } as never);
    payments.getLedger.mockResolvedValue(new Blob(['a,b']) as never);
  });

  it('shows no history when nothing was ever exported', async () => {
    show();

    await waitFor(() => expect(users.getExportHistory).toHaveBeenCalled());
    expect(
      screen.getByRole('button', { name: 'Request export' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Export History')).not.toBeInTheDocument(),
    );
  });

  it('lists each export with its state, and offers the download only of a finished one', async () => {
    users.getExportHistory.mockResolvedValue({
      data: [
        anExport('done'),
        anExport('waiting', { status: 'PENDING', url: null }),
        anExport('working', { status: 'PROCESSING', url: null }),
        anExport('failed', { status: 'FAILED', url: null }),
        // Finished, with no file to offer.
        anExport('gone', { url: null }),
      ],
    } as never);
    show();

    expect(await screen.findByText('Export History')).toBeInTheDocument();
    expect(screen.getAllByText('COMPLETED')).toHaveLength(2);
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText('PROCESSING')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    const downloads = screen.getAllByRole('link', { name: 'Download data' });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toHaveAttribute(
      'href',
      'https://files.example/done.zip',
    );
  });

  it('asks for an export, says so and reads the history again', async () => {
    show();
    await waitFor(() =>
      expect(users.getExportHistory).toHaveBeenCalledTimes(1),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Request export' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Data export started. You will receive an email when it is ready.',
      ),
    );
    await waitFor(() =>
      expect(users.getExportHistory).toHaveBeenCalledTimes(2),
    );
  });

  it('cannot be asked twice while the request is on its way', async () => {
    users.requestExport.mockReturnValue(new Promise(() => {}) as never);
    show();

    const ask = screen.getByRole('button', { name: 'Request export' });
    fireEvent.click(ask);

    await waitFor(() => expect(ask).toBeDisabled());
  });

  it('says so when the export could not be asked for', async () => {
    users.requestExport.mockRejectedValue(new Error('no'));
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Request export' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to request data export.',
      ),
    );
    expect(users.getExportHistory).toHaveBeenCalledTimes(1);
  });

  it('downloads the ledger as a file and says so', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:ledger');
    const clicked: Array<{ href: string; download: string | null }> = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({
          href: this.href,
          download: this.getAttribute('download'),
        });
      });
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Download Ledger' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Ledger downloaded.'),
    );
    expect(clicked).toEqual([{ href: 'blob:ledger', download: 'ledger.csv' }]);
    // The link made for the download does not stay on the page.
    expect(document.querySelector('a[download="ledger.csv"]')).toBeNull();
    click.mockRestore();
  });

  it('says so when the ledger could not be downloaded, and cannot be asked twice meanwhile', async () => {
    let fail: (error: Error) => void = () => {};
    payments.getLedger.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }) as never,
    );
    show();

    const ledger = screen.getByRole('button', { name: 'Download Ledger' });
    fireEvent.click(ledger);
    await waitFor(() => expect(ledger).toBeDisabled());
    fail(new Error('no'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to download ledger.'),
    );
  });
});
