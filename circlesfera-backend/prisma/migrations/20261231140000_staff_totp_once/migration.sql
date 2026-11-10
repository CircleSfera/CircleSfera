-- The time step of the last authenticator code a staff identity used: each
-- code is accepted once.
ALTER TABLE "admin_identities" ADD COLUMN "totpLastTimeStep" INTEGER;
