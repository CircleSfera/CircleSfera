-- A staff identity enrols its authenticator only with a one-time proof
-- beyond the password: a link sent to the staff email or a code from an
-- administrator. Only added; no data changes.
ALTER TYPE "AdminAction" ADD VALUE 'ADMIN_ENROLMENT_ISSUED';

ALTER TABLE "admin_identities" ADD COLUMN "enrolmentProofHash" TEXT,
ADD COLUMN "enrolmentProofExpiresAt" TIMESTAMP(3);
