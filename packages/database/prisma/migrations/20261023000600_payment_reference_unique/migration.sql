-- One fiduciary receipt reference reconciles at most one subscription per developer.
-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_payment_reference_key" ON "subscriptions"("organization_id", "payment_reference");

