import { fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/test-utils';
import ExportModal from './ExportModal';

const exportedBlob = new Blob(['video'], { type: 'video/mp4' });

describe('ExportModal', () => {
  const onClose = vi.fn();
  const onStartExport = vi.fn();
  const onCancelExport = vi.fn();
  const onPublish = vi.fn();
  const onDownload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:export-preview');
    URL.revokeObjectURL = vi.fn();
  });

  function renderModal(
    overrides: Partial<ComponentProps<typeof ExportModal>> = {},
  ) {
    return renderWithProviders(
      <ExportModal
        isOpen
        isExporting={false}
        exportProgress={0}
        exportedBlob={null}
        onClose={onClose}
        onStartExport={onStartExport}
        onCancelExport={onCancelExport}
        onPublish={onPublish}
        onDownload={onDownload}
        {...overrides}
      />,
    );
  }

  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onStartExport).not.toHaveBeenCalled();
  });

  it('starts export with the default ultrafast preset', () => {
    const { i18n } = renderModal();

    expect(
      screen.getByText(i18n!.t('studio.export_options_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(i18n!.t('studio.export_presets.ultrafast')),
    ).toBeChecked();
    fireEvent.click(screen.getByTestId('studio-export-start'));

    expect(onStartExport).toHaveBeenCalledWith('ultrafast');
  });

  it('starts export with the chosen preset', () => {
    const { i18n } = renderModal();

    fireEvent.click(
      screen.getByLabelText(i18n!.t('studio.export_presets.fast')),
    );
    fireEvent.click(screen.getByTestId('studio-export-start'));

    expect(onStartExport).toHaveBeenCalledWith('fast');
  });

  it('shows a long-duration hint and closes without starting', () => {
    const { i18n } = renderModal({ projectDuration: 91 });

    expect(
      screen.getByText(i18n!.t('studio.export_long_duration_hint')),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('common.cancel') }),
    );
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onStartExport).not.toHaveBeenCalled();
  });

  it('shows progress and cancels an in-flight export without closing', () => {
    const { i18n } = renderModal({ isExporting: true, exportProgress: 42 });

    expect(
      screen.getByText(i18n!.t('studio.export_rendering')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('studio.export_progress', { percent: 42 })),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('studio-export-cancel'));
    expect(onCancelExport).toHaveBeenCalledTimes(1);
  });

  it('publishes the scheduled time and can download the ready video', () => {
    const { i18n } = renderModal({ exportedBlob });

    expect(
      screen.getByText(i18n!.t('studio.export_ready')),
    ).toBeInTheDocument();
    expect(screen.getByTestId('studio-export-preview')).toHaveAttribute(
      'src',
      'blob:export-preview',
    );

    fireEvent.change(screen.getByTestId('studio-export-schedule'), {
      target: { value: '2026-09-05T18:00' },
    });
    fireEvent.click(screen.getByTestId('studio-export-publish'));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('studio.export_download'),
      }),
    );

    expect(onPublish).toHaveBeenCalledWith('2026-09-05T18:00');
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('resets the preset when the dialog reopens', () => {
    const view = renderModal();

    fireEvent.click(
      screen.getByLabelText(view.i18n!.t('studio.export_presets.fast')),
    );
    view.rerender(
      <ExportModal
        isOpen={false}
        isExporting={false}
        exportProgress={0}
        exportedBlob={null}
        onClose={onClose}
        onStartExport={onStartExport}
        onCancelExport={onCancelExport}
        onPublish={onPublish}
        onDownload={onDownload}
      />,
    );
    view.rerender(
      <ExportModal
        isOpen
        isExporting={false}
        exportProgress={0}
        exportedBlob={null}
        onClose={onClose}
        onStartExport={onStartExport}
        onCancelExport={onCancelExport}
        onPublish={onPublish}
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByTestId('studio-export-start'));
    expect(onStartExport).toHaveBeenCalledWith('ultrafast');
  });
});
