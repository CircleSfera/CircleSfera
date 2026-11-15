import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { companyVerificationStaffApi } from '../../services/companyVerification.service';
import { renderWithProviders } from '../../test/test-utils';
import { adminToast } from './adminToast';
import CompanyVerificationsTab from './CompanyVerificationsTab';

vi.mock('../../services/companyVerification.service', () => ({
  companyVerificationStaffApi: {
    queue: vi.fn(),
    document: vi.fn(),
    decide: vi.fn(),
    identityName: vi.fn(),
  },
}));
vi.mock('./adminToast', () => ({ adminToast: vi.fn() }));

const api = vi.mocked(companyVerificationStaffApi);

const application = (over = {}) => ({
  id: 'app-1',
  status: 'PENDING' as const,
  kind: 'COMPANY' as const,
  legalName: 'Acme SL',
  taxId: 'B12345674',
  domain: 'acme.es',
  viesValid: true,
  viesName: 'ACME SL',
  domainProvedAt: '2026-11-14',
  domainProof: 'DNS' as const,
  emailAddress: 'info@acme.es',
  emailCodeExpiresAt: null,
  emailVerifiedAt: '2026-11-14',
  submittedAt: '2026-11-14T10:00:00Z',
  decidedAt: null,
  documents: [
    {
      id: 'd1',
      fileName: 'cif.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
      createdAt: '2026-11-14',
    },
  ],
  profile: {
    id: 'p1',
    username: 'acme',
    accountType: 'BUSINESS',
    verificationLevel: 'BUSINESS',
    user: { identityVerifiedAt: '2026-10-01' },
  },
  ...over,
});

describe('CompanyVerificationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.queue.mockResolvedValue({ items: [application()], total: 1 });
    api.decide.mockResolvedValue(application() as never);
  });

  it('shows what staff need to decide: the company, VIES, the domain proof, the address and the identity', async () => {
    const { i18n } = renderWithProviders(<CompanyVerificationsTab />);
    const card = await screen.findByTestId('company-application-app-1');
    expect(card).toHaveTextContent('Acme SL');
    expect(card).toHaveTextContent('@acme');
    expect(card).toHaveTextContent('B12345674');
    expect(card).toHaveTextContent('ACME SL');
    expect(card).toHaveTextContent(
      i18n!.t('admin.company_verifications.proof_DNS'),
    );
    expect(card).toHaveTextContent('info@acme.es');
    // A company is not matched against a person.
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('admin.company_verifications.show_identity_name'),
      }),
    ).not.toBeInTheDocument();
  });

  it('reads the verified name of a sole trader only when asked, and says when there is none or it fails', async () => {
    api.queue.mockResolvedValue({
      items: [application({ kind: 'SOLE_TRADER', domain: null })],
      total: 1,
    });
    api.identityName
      .mockResolvedValueOnce({ name: { firstName: 'Ana', lastName: 'Ruiz' } })
      .mockResolvedValueOnce({ name: null })
      .mockRejectedValueOnce(new Error('x'));
    const ask = (label: string) =>
      fireEvent.click(screen.getByRole('button', { name: label }));
    const first = renderWithProviders(<CompanyVerificationsTab />);
    const label = first.i18n!.t(
      'admin.company_verifications.show_identity_name',
    );
    await screen.findByTestId('company-application-app-1');
    expect(api.identityName).not.toHaveBeenCalled();
    ask(label);
    expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument();
    first.unmount();

    const second = renderWithProviders(<CompanyVerificationsTab />);
    await screen.findByTestId('company-application-app-1');
    ask(label);
    expect(
      await screen.findByText(
        first.i18n!.t('admin.company_verifications.identity_name_none'),
      ),
    ).toBeInTheDocument();
    second.unmount();

    renderWithProviders(<CompanyVerificationsTab />);
    await screen.findByTestId('company-application-app-1');
    ask(label);
    await waitFor(() =>
      expect(adminToast).toHaveBeenCalledWith(
        first.i18n!.t('admin.company_verifications.identity_name_failed'),
        'error',
      ),
    );
  });

  it('approves, and says the documents were deleted', async () => {
    const { i18n } = renderWithProviders(<CompanyVerificationsTab />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('admin.company_verifications.approve'),
      }),
    );
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith('app-1', { approve: true }),
    );
    expect(adminToast).toHaveBeenCalledWith(
      i18n!.t('admin.company_verifications.approved'),
      'success',
    );
  });

  it('rejects with a reason and a note, or goes back', async () => {
    const { i18n } = renderWithProviders(<CompanyVerificationsTab />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('admin.company_verifications.reject'),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('admin.company_verifications.cancel'),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('admin.company_verifications.reject'),
      }),
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('admin.company_verifications.reason')),
      { target: { value: 'NAME_NOT_IDENTITY' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('admin.company_verifications.note')),
      { target: { value: ' Use the 036. ' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('admin.company_verifications.confirm_reject'),
      }),
    );
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith('app-1', {
        approve: false,
        reason: 'NAME_NOT_IDENTITY',
        note: 'Use the 036.',
      }),
    );
  });

  it('opens the tab during the click, fills it once the document arrives, and says when it cannot', async () => {
    api.document.mockResolvedValueOnce(new Blob(['%PDF']));
    URL.createObjectURL = vi.fn(() => 'blob:doc');
    URL.revokeObjectURL = vi.fn();
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(tab as never);
    renderWithProviders(<CompanyVerificationsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'cif.pdf' }));
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(tab.location.href).toBe('blob:doc'));
    expect(tab.opener).toBeNull();
    expect(api.document).toHaveBeenCalledWith('app-1', 'd1');

    // A download that fails closes the tab it took.
    api.document.mockRejectedValueOnce(new Error('x'));
    fireEvent.click(screen.getByRole('button', { name: 'cif.pdf' }));
    await waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(adminToast).toHaveBeenCalledWith(expect.any(String), 'error');

    // A blocked tab is said, without downloading.
    openSpy.mockReturnValueOnce(null);
    api.document.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'cif.pdf' }));
    expect(api.document).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('a failed decision says so, and a sole trader without a domain or VIES answer reads plainly', async () => {
    api.queue.mockResolvedValue({
      items: [
        application({
          kind: 'SOLE_TRADER',
          domain: null,
          viesValid: null,
          profile: {
            id: 'p1',
            username: 'ana',
            accountType: 'BUSINESS',
            verificationLevel: 'BUSINESS',
            user: null,
          },
        }),
      ],
      total: 1,
    });
    api.decide.mockRejectedValueOnce(new Error('x'));
    const { i18n } = renderWithProviders(<CompanyVerificationsTab />);
    const card = await screen.findByTestId('company-application-app-1');
    expect(card).toHaveTextContent(
      i18n!.t('admin.company_verifications.no_domain'),
    );
    expect(card).toHaveTextContent(
      i18n!.t('admin.company_verifications.vies_unknown'),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('admin.company_verifications.approve'),
      }),
    );
    await waitFor(() =>
      expect(adminToast).toHaveBeenCalledWith(
        i18n!.t('admin.company_verifications.decide_failed'),
        'error',
      ),
    );
  });

  it('says when nothing waits, and when the queue cannot be read', async () => {
    api.queue.mockResolvedValueOnce({ items: [], total: 0 });
    const { i18n, unmount } = renderWithProviders(<CompanyVerificationsTab />);
    expect(
      await screen.findAllByText(
        i18n!.t('admin.company_verifications.empty_title'),
      ),
    ).not.toHaveLength(0);
    unmount();
    api.queue.mockRejectedValueOnce(new Error('x'));
    renderWithProviders(<CompanyVerificationsTab />);
    expect(
      await screen.findByText(
        i18n!.t('admin.company_verifications.load_failed'),
      ),
    ).toBeInTheDocument();
  });
});
