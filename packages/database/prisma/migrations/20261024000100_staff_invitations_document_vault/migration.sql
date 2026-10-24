-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Activation of onboarded staff accounts and the DocumentVault.
--
--   user_invitations  single-use activation link (SHA-256 of its token) of a staff account created by the
--                     B2B onboarding without a password; password + TOTP enrolment complete it.
--   vault_objects     files of the DocumentVault: content-addressed by SHA-256 and isolated per tenant
--                     (storage key tenants/{organization}/sha256/{hex}); append-only for the app roles.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'STAFF_INVITED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_INVITATION_RESENT';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_ACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'DATA_ROOM_DOCUMENT_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'DATA_ROOM_DOCUMENT_DOWNLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'KYC_DOCUMENT_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'VAULT_INTEGRITY_FAILED';

-- CreateTable
CREATE TABLE "user_invitations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "pending_password_hash" TEXT,
    "pending_totp_secret_enc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_objects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_hash_key" ON "user_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "user_invitations_user_id_created_at_idx" ON "user_invitations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "user_invitations_organization_id_idx" ON "user_invitations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "vault_objects_organization_id_sha256_key" ON "vault_objects"("organization_id", "sha256");

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_objects" ADD CONSTRAINT "vault_objects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Integrity
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_expiry" CHECK ("expires_at" > "created_at");
-- The first activation step parks both results (password hash and TOTP secret) or none.
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_pending_pair" CHECK (
  ("pending_password_hash" IS NULL) = ("pending_totp_secret_enc" IS NULL)
);
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_token_hash_format" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "vault_objects" ADD CONSTRAINT "vault_objects_sha256_format" CHECK ("sha256" ~ '^0x[0-9a-f]{64}$');
ALTER TABLE "vault_objects" ADD CONSTRAINT "vault_objects_size_positive" CHECK ("size_bytes" > 0);
-- The storage key is the content address of its tenant: a row can never point at another tenant's file.
ALTER TABLE "vault_objects" ADD CONSTRAINT "vault_objects_storage_key" CHECK (
  "storage_key" = 'tenants/' || "organization_id" || '/sha256/' || substr("sha256", 3)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenant isolation (fail-closed, as every tenant table)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_invitations', 'vault_objects'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organization_id" = rwaxi_current_org()) '
      'WITH CHECK ("organization_id" = rwaxi_current_org())', t);
  END LOOP;
END $$;

-- An invitation belongs to a user of its own organization.
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "user_invitations"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('users', 'user_id');

-- Vault objects are evidence: the app roles may add them, never change or remove them.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON "vault_objects" FROM %I', r);
    END IF;
  END LOOP;
END $$;
