-- A sale is now charged on the creator's own account, which takes payments
-- only once card payments are active on it. The flag saved before counted
-- charges alone, so it is cleared for every account; it is read again from
-- the provider on the account's next update or status check.
UPDATE "monetization" SET "chargesEnabled" = false;
