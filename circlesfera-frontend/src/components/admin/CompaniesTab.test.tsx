import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import CompaniesTab from './CompaniesTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: { getCompanies: vi.fn() },
}));

const company = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  username: 'acme',
  fullName: 'Acme Ltd',
  avatar: null,
  onBusinessPlan: true,
  payoutConnected: true,
  companyVerified: true,
  labelShown: true,
  ...over,
});

const page = (data: unknown[]) => ({
  data: {
    data,
    meta: { total: data.length, page: 1, limit: 20, totalPages: 1 },
  },
});

describe('CompaniesTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows each Business Profile with its label and the three conditions', async () => {
    vi.mocked(adminApi.getCompanies).mockResolvedValue(
      page([
        company(),
        company({
          id: 'p2',
          username: 'beta',
          companyVerified: false,
          labelShown: false,
        }),
      ]) as never,
    );
    const { i18n } = renderWithProviders(<CompaniesTab />);
    const t = (k: string) => i18n!.t(`admin.companies.${k}`);

    expect(await screen.findByText('@acme')).toBeInTheDocument();
    expect(screen.getByText(t('label_shown'))).toBeInTheDocument();
    expect(screen.getByText(t('label_not_shown'))).toBeInTheDocument();
    // What is missing is said in words, not only by a mark.
    expect(screen.getByText(t('verified_no'))).toBeInTheDocument();
    expect(screen.getAllByText(t('plan_yes'))).toHaveLength(2);
  });

  it('searches by handle or name from the first page', async () => {
    vi.mocked(adminApi.getCompanies).mockResolvedValue(page([]) as never);
    const { i18n } = renderWithProviders(<CompaniesTab />);

    expect(
      await screen.findByText(i18n!.t('admin.companies.empty_title')),
    ).toBeInTheDocument();
    expect(adminApi.getCompanies).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: undefined,
    });
  });

  it('says when the list cannot be loaded', async () => {
    vi.mocked(adminApi.getCompanies).mockRejectedValue(new Error('down'));
    const { i18n } = renderWithProviders(<CompaniesTab />);

    await waitFor(() =>
      expect(
        screen.getByText(i18n!.t('admin.companies.load_failed')),
      ).toBeInTheDocument(),
    );
  });
});
