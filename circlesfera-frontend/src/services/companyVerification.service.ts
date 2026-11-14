import { apiClient } from './api';

export type CompanyKind = 'COMPANY' | 'SOLE_TRADER';
export type CompanyVerificationStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'REPLACED';
export type CompanyRejectionReason =
  | 'DOCUMENTS_UNREADABLE'
  | 'DOCUMENTS_NOT_ACCEPTED'
  | 'DETAILS_DO_NOT_MATCH'
  | 'NAME_NOT_IDENTITY'
  | 'OTHER';

export interface CompanyDocument {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CompanyApplication {
  id: string;
  status: CompanyVerificationStatus;
  kind: CompanyKind;
  legalName: string;
  taxId: string;
  domain: string | null;
  viesValid: boolean | null;
  domainProvedAt: string | null;
  emailAddress: string | null;
  emailCodeExpiresAt: string | null;
  emailVerifiedAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  rejectionReason?: CompanyRejectionReason | null;
  rejectionNote?: string | null;
  documents: CompanyDocument[];
}

// Where the Profile in use stands with company verification.
export interface CompanyVerificationStatusView {
  isOwner: boolean;
  onBusinessPlan: boolean;
  identityVerified: boolean;
  dnsRecord: string | null;
  metaTag: string | null;
  application: CompanyApplication | null;
}

export interface CompanyDetails {
  kind: CompanyKind;
  legalName: string;
  taxId: string;
  domain: string | null;
}

const BASE = '/company-verification';

// The company verification of the Business Profile in use, by its owner.
export const companyVerificationApi = {
  async status(): Promise<CompanyVerificationStatusView> {
    const { data } = await apiClient.get(BASE);
    return data;
  },
  async saveDetails(details: CompanyDetails) {
    const { data } = await apiClient.put(BASE, details);
    return data as CompanyVerificationStatusView;
  },
  async checkDomain() {
    const { data } = await apiClient.post(`${BASE}/domain/check`);
    return data as CompanyVerificationStatusView;
  },
  async sendEmailCode(localPart: string) {
    const { data } = await apiClient.post(`${BASE}/domain/email`, {
      localPart,
    });
    return data as CompanyVerificationStatusView;
  },
  async confirmEmailCode(code: string) {
    const { data } = await apiClient.post(`${BASE}/domain/email/confirm`, {
      code,
    });
    return data as CompanyVerificationStatusView;
  },
  async addDocument(file: File) {
    const form = new FormData();
    form.append('file', file);
    const { data } = await apiClient.post(`${BASE}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data as CompanyVerificationStatusView;
  },
  async removeDocument(id: string) {
    const { data } = await apiClient.delete(`${BASE}/documents/${id}`);
    return data as CompanyVerificationStatusView;
  },
  async submit() {
    const { data } = await apiClient.post(`${BASE}/submit`);
    return data as CompanyVerificationStatusView;
  },
  async withdraw() {
    const { data } = await apiClient.post(`${BASE}/withdraw`);
    return data as CompanyVerificationStatusView;
  },
};
