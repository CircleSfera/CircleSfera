import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CompanyApplication,
  companyVerificationApi,
} from '../../services/companyVerification.service';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import CompanySettings from './CompanySettings';

vi.mock('../../services/companyVerification.service', () => ({
  companyVerificationApi: {
    status: vi.fn(),
    saveDetails: vi.fn(),
    checkDomain: vi.fn(),
    sendEmailCode: vi.fn(),
    confirmEmailCode: vi.fn(),
    addDocument: vi.fn(),
    removeDocument: vi.fn(),
    submit: vi.fn(),
    withdraw: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
const identity = vi.hoisted(() => ({ prompt: vi.fn() }));
vi.mock('../../utils/identityVerification', () => ({
  promptIdentityVerification: identity.prompt,
}));

const api = vi.mocked(companyVerificationApi);

const application = (
  over: Partial<CompanyApplication> = {},
): CompanyApplication => ({
  id: 'app-1',
  status: 'DRAFT',
  kind: 'COMPANY',
  legalName: 'Acme SL',
  taxId: 'B12345674',
  domain: 'acme.es',
  viesValid: true,
  domainProvedAt: null,
  emailAddress: null,
  emailCodeExpiresAt: null,
  emailVerifiedAt: null,
  submittedAt: null,
  decidedAt: null,
  documents: [],
  ...over,
});

const view = (over: object = {}) => ({
  isOwner: true,
  onBusinessPlan: true,
  identityVerified: true,
  dnsRecord: 'circlesfera-verification=tok',
  metaTag: '<meta name="circlesfera-verification" content="tok">',
  application: null,
  ...over,
});

describe('CompanySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      profile: { id: 'p1', accountType: 'BUSINESS' } as never,
    });
  });

  it('tells a profile that is not a Business one, without asking the server', async () => {
    useAuthStore.setState({
      profile: { id: 'p1', accountType: 'CREATOR' } as never,
    });
    const { i18n } = renderWithProviders(<CompanySettings />);
    expect(
      screen.getByText(i18n!.t('settings.company.business_only')),
    ).toBeInTheDocument();
    expect(api.status).not.toHaveBeenCalled();
  });

  it('sends to the plans without the Business plan, and to the identity check without one', async () => {
    api.status.mockResolvedValueOnce(view({ onBusinessPlan: false }));
    const { i18n, unmount } = renderWithProviders(<CompanySettings />);
    expect(
      await screen.findByRole('link', {
        name: i18n!.t('settings.company.see_plans'),
      }),
    ).toHaveAttribute('href', '/pricing');
    unmount();

    api.status.mockResolvedValueOnce(view({ identityVerified: false }));
    renderWithProviders(<CompanySettings />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.company.verify_identity'),
      }),
    );
    expect(identity.prompt).toHaveBeenCalled();
  });

  it('says when it could not load, with a way to try again', async () => {
    api.status.mockRejectedValueOnce(new Error('down'));
    const { i18n } = renderWithProviders(<CompanySettings />);
    expect(
      await screen.findByText(i18n!.t('settings.company.error_title')),
    ).toBeInTheDocument();
  });

  it('starts an application with the company details, cleaned', async () => {
    api.status.mockResolvedValue(view());
    api.saveDetails.mockResolvedValue(view({ application: application() }));
    const { i18n } = renderWithProviders(<CompanySettings />);

    fireEvent.change(
      await screen.findByLabelText(i18n!.t('settings.company.legal_name')),
      { target: { value: ' Acme SL ' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('settings.company.tax_id_company')),
      { target: { value: 'B12345674' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('settings.company.domain')),
      { target: { value: ' acme.es ' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('settings.company.start') }),
    );
    await waitFor(() =>
      expect(api.saveDetails).toHaveBeenCalledWith({
        kind: 'COMPANY',
        legalName: 'Acme SL',
        taxId: 'B12345674',
        domain: 'acme.es',
      }),
    );
    expect(await screen.findByTestId('company-draft')).toBeInTheDocument();
  });

  it('a sole trader may leave the domain out', async () => {
    api.status.mockResolvedValue(view());
    api.saveDetails.mockResolvedValue(view());
    const { i18n } = renderWithProviders(<CompanySettings />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.company.kinds.SOLE_TRADER'),
      }),
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('settings.company.legal_name')),
      { target: { value: 'Ana Ruiz' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('settings.company.tax_id_person')),
      { target: { value: '12345678Z' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('settings.company.start') }),
    );
    await waitFor(() =>
      expect(api.saveDetails).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'SOLE_TRADER', domain: null }),
      ),
    );
  });

  it('shows the DNS record and the meta tag to copy, and checks the domain', async () => {
    api.status.mockResolvedValue(view({ application: application() }));
    api.checkDomain.mockResolvedValue(
      view({ application: application({ domainProvedAt: '2026-11-14' }) }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { i18n } = renderWithProviders(<CompanySettings />);

    expect(
      await screen.findByText('circlesfera-verification=tok'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', {
        name: i18n!.t('settings.company.copy'),
      })[0],
    );
    expect(writeText).toHaveBeenCalledWith('circlesfera-verification=tok');
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.company.check_domain'),
      }),
    );
    expect(
      await screen.findByText(i18n!.t('settings.company.domain_proved')),
    ).toBeInTheDocument();
    // The address step opens once the domain is checked.
    expect(screen.getByTestId('company-email')).toBeInTheDocument();
  });

  it('sends a code to an address on the domain and confirms it', async () => {
    const proved = application({ domainProvedAt: '2026-11-14' });
    api.status.mockResolvedValue(view({ application: proved }));
    api.sendEmailCode.mockResolvedValue(
      view({ application: { ...proved, emailAddress: 'info@acme.es' } }),
    );
    api.confirmEmailCode.mockResolvedValue(
      view({
        application: {
          ...proved,
          emailAddress: 'info@acme.es',
          emailVerifiedAt: '2026-11-14',
        },
      }),
    );
    const { i18n } = renderWithProviders(<CompanySettings />);

    fireEvent.change(
      await screen.findByLabelText(i18n!.t('settings.company.address')),
      { target: { value: ' info ' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.company.send_code'),
      }),
    );
    await waitFor(() => expect(api.sendEmailCode).toHaveBeenCalledWith('info'));
    fireEvent.change(
      await screen.findByLabelText(
        i18n!.t('settings.company.code', { address: 'info@acme.es' }),
      ),
      { target: { value: '123456' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.company.confirm_code'),
      }),
    );
    await waitFor(() =>
      expect(api.confirmEmailCode).toHaveBeenCalledWith('123456'),
    );
    expect(
      await screen.findByText(
        i18n!.t('settings.company.email_confirmed', {
          address: 'info@acme.es',
        }),
      ),
    ).toBeInTheDocument();
  });

  it('adds and removes documents, and sends only a complete application', async () => {
    const sole = application({ kind: 'SOLE_TRADER', domain: null });
    api.status.mockResolvedValue(view({ application: sole }));
    const withDoc = {
      ...sole,
      documents: [
        {
          id: 'd1',
          fileName: '036.pdf',
          contentType: 'application/pdf',
          sizeBytes: 10,
          createdAt: '2026-11-14',
        },
      ],
    };
    api.addDocument.mockResolvedValue(view({ application: withDoc }));
    api.removeDocument.mockResolvedValue(view({ application: sole }));
    api.submit.mockResolvedValue(
      view({
        application: {
          ...withDoc,
          status: 'PENDING',
          submittedAt: '2026-11-14',
        },
      }),
    );
    const { i18n } = renderWithProviders(<CompanySettings />);

    const send = await screen.findByRole('button', {
      name: i18n!.t('settings.company.submit'),
    });
    expect(send).toBeDisabled();
    const file = new File(['%PDF'], '036.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('company-document-input'), {
      target: { files: [file] },
    });
    await waitFor(() => expect(api.addDocument).toHaveBeenCalledWith(file));
    expect(await screen.findByText('036.pdf')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.company.submit'),
      }),
    );
    expect(await screen.findByTestId('company-pending')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(
      i18n!.t('settings.company.sent'),
    );
  });

  it('removes a document from the draft', async () => {
    api.status.mockResolvedValue(
      view({
        application: application({
          documents: [
            {
              id: 'd1',
              fileName: 'cif.pdf',
              contentType: 'application/pdf',
              sizeBytes: 10,
              createdAt: '2026-11-14',
            },
          ],
        }),
      }),
    );
    api.removeDocument.mockResolvedValue(view({ application: application() }));
    const { i18n } = renderWithProviders(<CompanySettings />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.company.remove_document', { name: 'cif.pdf' }),
      }),
    );
    await waitFor(() => expect(api.removeDocument).toHaveBeenCalledWith('d1'));
  });

  it('withdraws an application under review', async () => {
    api.status.mockResolvedValue(
      view({
        application: application({
          status: 'PENDING',
          submittedAt: '2026-11-14',
        }),
      }),
    );
    api.withdraw.mockResolvedValue(view());
    const { i18n } = renderWithProviders(<CompanySettings />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.company.withdraw'),
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        i18n!.t('settings.company.withdrawn'),
      ),
    );
  });

  it('shows an approval, and a rejection with its reason and note above a new start', async () => {
    api.status.mockResolvedValueOnce(
      view({ application: application({ status: 'APPROVED' }) }),
    );
    const { i18n, unmount } = renderWithProviders(<CompanySettings />);
    expect(await screen.findByTestId('company-approved')).toHaveTextContent(
      'Acme SL',
    );
    unmount();

    api.status.mockResolvedValueOnce(
      view({
        application: application({
          status: 'REJECTED',
          rejectionReason: 'NAME_NOT_IDENTITY',
          rejectionNote: 'Use the 036.',
        }),
      }),
    );
    renderWithProviders(<CompanySettings />);
    const rejected = await screen.findByTestId('company-rejected');
    expect(rejected).toHaveTextContent(
      i18n!.t('settings.company.reasons.NAME_NOT_IDENTITY'),
    );
    expect(rejected).toHaveTextContent('Use the 036.');
    expect(screen.getByTestId('company-details')).toBeInTheDocument();
  });

  it('changes the details of a draft and goes back to its steps, and withdraws it', async () => {
    api.status.mockResolvedValue(view({ application: application() }));
    api.saveDetails.mockResolvedValue(
      view({ application: application({ legalName: 'Acme Spain SL' }) }),
    );
    api.withdraw.mockResolvedValue(view());
    const { i18n } = renderWithProviders(<CompanySettings />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.company.edit'),
      }),
    );
    const name = screen.getByLabelText(i18n!.t('settings.company.legal_name'));
    expect(name).toHaveValue('Acme SL');
    fireEvent.change(name, { target: { value: 'Acme Spain SL' } });
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('settings.company.save') }),
    );
    expect(await screen.findByText('Acme Spain SL')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('settings.company.vies_found')),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.company.withdraw'),
      }),
    );
    await waitFor(() => expect(api.withdraw).toHaveBeenCalled());
  });

  it('says what went wrong when a step is refused', async () => {
    api.status.mockResolvedValue(view({ application: application() }));
    api.checkDomain.mockRejectedValue(new Error('x'));
    const { i18n } = renderWithProviders(<CompanySettings />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.company.check_domain'),
      }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
