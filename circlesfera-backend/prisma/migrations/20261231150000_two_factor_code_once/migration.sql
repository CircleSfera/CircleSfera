-- The time step of the last two-step code a sign-in used: each code is
-- accepted once.
ALTER TABLE "sign_ins" ADD COLUMN "twoFactorLastTimeStep" INTEGER;
