-- MT-01B1 — Fundación de autenticación multiempresa.
-- Cambio aditivo. Los endpoints y JWT V2 permanecen inactivos mientras
-- MT01B_AUTH_MODE=LEGACY y MT01B_TENANT_SWITCH_ENABLED=false.

CREATE TYPE "osi"."AuthSessionStatus" AS ENUM (
  'ACTIVE', 'REVOKED', 'COMPROMISED', 'EXPIRED'
);

CREATE TYPE "osi"."AuthRefreshTokenStatus" AS ENUM (
  'ACTIVE', 'ROTATED', 'REVOKED', 'COMPROMISED', 'EXPIRED'
);

CREATE TABLE "osi"."auth_sessions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" "osi"."AuthSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "authorization_version_snapshot" INTEGER NOT NULL,
  "current_refresh_version" INTEGER NOT NULL DEFAULT 0,
  "fingerprint_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "last_refreshed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "compromised_at" TIMESTAMP(3),
  "revocation_reason" VARCHAR(160),
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_versions_check"
    CHECK ("authorization_version_snapshot" > 0 AND "current_refresh_version" >= 0),
  CONSTRAINT "auth_sessions_fingerprint_check"
    CHECK ("fingerprint_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_sessions_expiry_check"
    CHECK ("expires_at" > "created_at")
);

CREATE UNIQUE INDEX "auth_sessions_tenant_id_id_key"
  ON "osi"."auth_sessions"("tenant_id", "id");
CREATE INDEX "auth_sessions_tenant_id_membership_id_status_idx"
  ON "osi"."auth_sessions"("tenant_id", "membership_id", "status");
CREATE INDEX "auth_sessions_user_id_status_idx"
  ON "osi"."auth_sessions"("user_id", "status");
CREATE INDEX "auth_sessions_expires_at_idx"
  ON "osi"."auth_sessions"("expires_at");

ALTER TABLE "osi"."auth_sessions"
  ADD CONSTRAINT "auth_sessions_tenant_id_membership_id_user_id_fkey"
  FOREIGN KEY ("tenant_id", "membership_id", "user_id")
  REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "osi"."auth_refresh_tokens" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "fingerprint_hash" CHAR(64) NOT NULL,
  "status" "osi"."AuthRefreshTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "rotated_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "reuse_detected_at" TIMESTAMP(3),
  "replaced_by_token_id" TEXT,
  CONSTRAINT "auth_refresh_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_refresh_tokens_version_check" CHECK ("version" >= 0),
  CONSTRAINT "auth_refresh_tokens_hash_check"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$' AND "fingerprint_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_refresh_tokens_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE UNIQUE INDEX "auth_refresh_tokens_token_hash_key"
  ON "osi"."auth_refresh_tokens"("token_hash");
CREATE UNIQUE INDEX "auth_refresh_tokens_replaced_by_token_id_key"
  ON "osi"."auth_refresh_tokens"("replaced_by_token_id");
CREATE UNIQUE INDEX "auth_refresh_tokens_tenant_id_session_id_version_key"
  ON "osi"."auth_refresh_tokens"("tenant_id", "session_id", "version");
CREATE UNIQUE INDEX "auth_refresh_tokens_one_active_per_session_key"
  ON "osi"."auth_refresh_tokens"("tenant_id", "session_id")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "auth_refresh_tokens_tenant_id_session_id_status_idx"
  ON "osi"."auth_refresh_tokens"("tenant_id", "session_id", "status");
CREATE INDEX "auth_refresh_tokens_expires_at_idx"
  ON "osi"."auth_refresh_tokens"("expires_at");

ALTER TABLE "osi"."auth_refresh_tokens"
  ADD CONSTRAINT "auth_refresh_tokens_tenant_id_session_id_fkey"
  FOREIGN KEY ("tenant_id", "session_id")
  REFERENCES "osi"."auth_sessions"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."auth_refresh_tokens"
  ADD CONSTRAINT "auth_refresh_tokens_replaced_by_token_id_fkey"
  FOREIGN KEY ("replaced_by_token_id")
  REFERENCES "osi"."auth_refresh_tokens"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
