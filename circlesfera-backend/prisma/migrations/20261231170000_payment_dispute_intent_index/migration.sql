-- A payment just recorded finds the disputes reported before it.
CREATE INDEX "payment_disputes_stripePaymentIntentId_idx" ON "payment_disputes"("stripePaymentIntentId");
