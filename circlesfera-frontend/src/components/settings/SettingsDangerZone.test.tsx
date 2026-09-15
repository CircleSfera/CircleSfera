import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n, renderWithProviders } from '../../test/test-utils';
import SettingsDangerZone from './SettingsDangerZone';

function deleteZoneLabels(i18n: ReturnType<typeof createTestI18n>) {
  return {
    title: i18n.t('settings.account.delete.title'),
    description: i18n.t('settings.account.delete.desc'),
    actionLabel: i18n.t('settings.account.delete.btn'),
    confirmTitle: i18n.t('settings.account.delete.title'),
    confirmBody: i18n.t('settings.account.delete.confirm'),
    confirmLabel: i18n.t('settings.account.delete.btn'),
  };
}

describe('SettingsDangerZone', () => {
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the zone copy without opening a dialog', () => {
    const i18n = createTestI18n();
    const labels = deleteZoneLabels(i18n);
    renderWithProviders(
      <SettingsDangerZone {...labels} onConfirm={onConfirm} />,
      { i18n },
    );

    expect(
      screen.getByRole('heading', { name: labels.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(labels.description)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('opens the confirm dialog from the action and renders a secondary action', () => {
    const i18n = createTestI18n();
    const labels = deleteZoneLabels(i18n);
    renderWithProviders(
      <SettingsDangerZone
        {...labels}
        onConfirm={onConfirm}
        secondaryAction={<button type="button">Export data</button>}
      />,
      { i18n },
    );

    expect(
      screen.getByRole('button', { name: 'Export data' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.actionLabel }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: labels.confirmTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(labels.confirmBody)).toBeInTheDocument();
  });

  it('closes from cancel and the dialog X without confirming', () => {
    const i18n = createTestI18n();
    const labels = deleteZoneLabels(i18n);
    renderWithProviders(
      <SettingsDangerZone {...labels} onConfirm={onConfirm} />,
      { i18n },
    );

    fireEvent.click(screen.getByRole('button', { name: labels.actionLabel }));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('common.cancel'),
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.actionLabel }));
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms and closes the dialog', () => {
    const i18n = createTestI18n();
    const labels = deleteZoneLabels(i18n);
    renderWithProviders(
      <SettingsDangerZone {...labels} onConfirm={onConfirm} />,
      { i18n },
    );

    fireEvent.click(screen.getByRole('button', { name: labels.actionLabel }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: labels.confirmLabel,
      }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables the action while loading', () => {
    const i18n = createTestI18n();
    const labels = deleteZoneLabels(i18n);
    renderWithProviders(
      <SettingsDangerZone {...labels} onConfirm={onConfirm} isLoading />,
      { i18n },
    );

    expect(
      screen.getByRole('button', { name: labels.actionLabel }),
    ).toBeDisabled();
  });
});
