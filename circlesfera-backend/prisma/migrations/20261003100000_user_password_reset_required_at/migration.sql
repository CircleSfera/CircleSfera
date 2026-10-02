-- Marks accounts whose password hash must no longer grant access (credential
-- exposure remediation). Login rejects a correct password while it is set; a
-- completed email password reset clears it. Additive and nullable.
ALTER TABLE "users" ADD COLUMN "passwordResetRequiredAt" TIMESTAMP(3);
