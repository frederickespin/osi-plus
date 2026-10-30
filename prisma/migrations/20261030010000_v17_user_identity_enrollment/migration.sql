-- V17 19C: company-scoped identity records and non-administrator enrollment.
-- Global login identities, existing memberships and legacy invitation policies stay intact.
CREATE TABLE "osi"."tenant_user_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "full_name" VARCHAR(160) NOT NULL,
  "contact_phone" VARCHAR(40) NOT NULL DEFAULT '',
  "contact_email" VARCHAR(320),
  "document_type" VARCHAR(16) NOT NULL DEFAULT 'CEDULA',
  "document_number" VARCHAR(40),
  "photo_bytes" BYTEA,
  "photo_sha256" CHAR(64),
  "photo_version" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_user_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_user_identities_membership_key" UNIQUE ("tenant_id", "membership_id"),
  CONSTRAINT "tenant_user_identities_membership_user_key" UNIQUE ("tenant_id", "membership_id", "user_id"),
  CONSTRAINT "tenant_user_identities_document_key" UNIQUE ("tenant_id", "document_type", "document_number"),
  CONSTRAINT "tenant_user_identities_name_check" CHECK ("full_name" = BTRIM("full_name") AND length("full_name") BETWEEN 2 AND 160),
  CONSTRAINT "tenant_user_identities_phone_check" CHECK ("contact_phone" = '' OR "contact_phone" ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT "tenant_user_identities_email_check" CHECK ("contact_email" IS NULL OR ("contact_email" = LOWER(BTRIM("contact_email")) AND "contact_email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  CONSTRAINT "tenant_user_identities_document_check" CHECK (
    "document_type" IN ('CEDULA', 'PASSPORT', 'OTHER') AND
    ("document_number" IS NULL OR ("document_number" = UPPER(BTRIM("document_number")) AND
      (("document_type" = 'CEDULA' AND "document_number" ~ '^[0-9]{11}$') OR
       ("document_type" <> 'CEDULA' AND "document_number" ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'))))
  ),
  CONSTRAINT "tenant_user_identities_photo_check" CHECK (
    ("photo_bytes" IS NULL AND "photo_sha256" IS NULL) OR
    ("photo_bytes" IS NOT NULL AND "photo_sha256" IS NOT NULL AND octet_length("photo_bytes") BETWEEN 45 AND 262144 AND "photo_sha256" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "tenant_user_identities_version_check" CHECK ("version" >= 1 AND "photo_version" >= 0),
  CONSTRAINT "tenant_user_identities_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tenant_user_identities_membership_fkey" FOREIGN KEY ("tenant_id", "membership_id", "user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "osi"."user_enrollments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "enrollment_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "normalized_email" VARCHAR(320) NOT NULL,
  "full_name" VARCHAR(160) NOT NULL,
  "contact_phone" VARCHAR(40) NOT NULL DEFAULT '',
  "contact_email" VARCHAR(320),
  "document_type" VARCHAR(16) NOT NULL DEFAULT 'CEDULA',
  "document_number" VARCHAR(40),
  "intended_role" "osi"."TenantMembershipRole" NOT NULL,
  "photo_bytes" BYTEA,
  "photo_sha256" CHAR(64),
  "token_hash" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "issued_by_membership_id" TEXT NOT NULL,
  "issued_by_user_id" TEXT NOT NULL,
  "activated_membership_id" TEXT,
  "activated_user_id" TEXT,
  "request_id" UUID NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "activated_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_enrollments_ref_key" UNIQUE ("tenant_id", "enrollment_ref"),
  CONSTRAINT "user_enrollments_token_key" UNIQUE ("token_hash"),
  CONSTRAINT "user_enrollments_request_key" UNIQUE ("tenant_id", "request_id"),
  CONSTRAINT "user_enrollments_name_check" CHECK ("full_name" = BTRIM("full_name") AND length("full_name") BETWEEN 2 AND 160),
  CONSTRAINT "user_enrollments_email_check" CHECK ("normalized_email" = LOWER(BTRIM("normalized_email")) AND "normalized_email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT "user_enrollments_phone_check" CHECK ("contact_phone" = '' OR "contact_phone" ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT "user_enrollments_contact_email_check" CHECK ("contact_email" IS NULL OR ("contact_email" = LOWER(BTRIM("contact_email")) AND "contact_email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  CONSTRAINT "user_enrollments_role_check" CHECK ("intended_role" <> 'A'),
  CONSTRAINT "user_enrollments_document_check" CHECK (
    "document_type" IN ('CEDULA', 'PASSPORT', 'OTHER') AND
    ("document_number" IS NULL OR ("document_number" = UPPER(BTRIM("document_number")) AND
      (("document_type" = 'CEDULA' AND "document_number" ~ '^[0-9]{11}$') OR
       ("document_type" <> 'CEDULA' AND "document_number" ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'))))
  ),
  CONSTRAINT "user_enrollments_photo_check" CHECK (
    ("photo_bytes" IS NULL AND "photo_sha256" IS NULL) OR
    ("photo_bytes" IS NOT NULL AND "photo_sha256" IS NOT NULL AND octet_length("photo_bytes") BETWEEN 45 AND 262144 AND "photo_sha256" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "user_enrollments_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$' AND "payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "user_enrollments_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "user_enrollments_state_check" CHECK (
    ("status" = 'PENDING' AND "activated_at" IS NULL AND "revoked_at" IS NULL AND "activated_membership_id" IS NULL AND "activated_user_id" IS NULL) OR
    ("status" = 'ACTIVATED' AND "activated_at" IS NOT NULL AND "revoked_at" IS NULL AND "activated_membership_id" IS NOT NULL AND "activated_user_id" IS NOT NULL) OR
    ("status" = 'REVOKED' AND "activated_at" IS NULL AND "revoked_at" IS NOT NULL AND "activated_membership_id" IS NULL AND "activated_user_id" IS NULL)
  ),
  CONSTRAINT "user_enrollments_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "user_enrollments_issuer_fkey" FOREIGN KEY ("tenant_id", "issued_by_membership_id", "issued_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "user_enrollments_activated_fkey" FOREIGN KEY ("tenant_id", "activated_membership_id", "activated_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "user_enrollments_pending_email_key" ON "osi"."user_enrollments"("tenant_id", "normalized_email") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "user_enrollments_pending_document_key" ON "osi"."user_enrollments"("tenant_id", "document_type", "document_number") WHERE "status" = 'PENDING' AND "document_number" IS NOT NULL;
CREATE INDEX "user_enrollments_tenant_created_idx" ON "osi"."user_enrollments"("tenant_id", "created_at" DESC);

