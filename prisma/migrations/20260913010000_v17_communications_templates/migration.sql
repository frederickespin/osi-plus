SET search_path = osi, public;

CREATE TYPE "CommunicationTemplateCategory" AS ENUM ('VISIT_CONFIRMATION','EVALUATOR_ASSIGNMENT','SURVEY_PIC','CLIENT_INFORMATION_REQUEST','DOCUMENT_REQUEST','QUOTE_SENT','QUOTE_FOLLOW_UP','QUOTE_ACCEPTED','QUOTE_REJECTED','BOOKER_NOTIFICATION','AGENT_NOTIFICATION','LEAD_ACCOUNT_NOTIFICATION');
CREATE TYPE "CommunicationTemplateState" AS ENUM ('DRAFT','PUBLISHED','INACTIVE');
CREATE TYPE "CommunicationTemplateVersionState" AS ENUM ('DRAFT','PUBLISHED','INACTIVE');
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL','WHATSAPP','PORTAL','INTERNAL','SMS');
CREATE TYPE "CommunicationAudience" AS ENUM ('CLIENT','BOOKER','LEAD_ACCOUNT','AGENT','EVALUATOR','SALES','COORDINATOR','PAYER','APPROVER','REFERRAL','INTERNAL_TEAM');
CREATE TYPE "CommunicationMilestone" AS ENUM ('VISIT_CONFIRMATION','EVALUATOR_ASSIGNMENT','SURVEY_PIC_CLIENT','SURVEY_PIC_EVALUATOR','VISIT_RESCHEDULED','VISIT_CANCELLED','QUOTE_SENT','FOLLOW_UP_1','FOLLOW_UP_2','EXPIRY_REMINDER','QUOTE_ACCEPTED','QUOTE_REJECTED','CLIENT_INFORMATION_REQUEST','DOCUMENT_REQUEST','BOOKER_NOTIFICATION','AGENT_NOTIFICATION','LEAD_ACCOUNT_NOTIFICATION');
CREATE TYPE "CommunicationStatus" AS ENUM ('PREPARED','QUEUED','SENT','DELIVERED','FAILED','CANCELLED');

CREATE TABLE "communication_templates" (
  "id" TEXT NOT NULL,
  "template_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "category" "CommunicationTemplateCategory" NOT NULL,
  "state" "CommunicationTemplateState" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communication_template_versions" (
  "id" TEXT NOT NULL,
  "version_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "state" "CommunicationTemplateVersionState" NOT NULL DEFAULT 'DRAFT',
  "audiences" "CommunicationAudience"[] NOT NULL,
  "channels" "CommunicationChannel"[] NOT NULL,
  "subject_template" VARCHAR(300),
  "body_text_template" TEXT NOT NULL,
  "body_html_template" TEXT,
  "variables" JSONB NOT NULL,
  "content_sha256" CHAR(64) NOT NULL,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "created_by_membership_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "published_by_membership_id" TEXT,
  "published_by_user_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "communication_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communication_records" (
  "id" TEXT NOT NULL,
  "communication_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "template_version_id" TEXT NOT NULL,
  "survey_assignment_id" TEXT,
  "quote_proposal_revision_id" TEXT,
  "milestone" "CommunicationMilestone" NOT NULL,
  "channel" "CommunicationChannel" NOT NULL,
  "recipient_type" "CommunicationAudience" NOT NULL,
  "recipient_ref" UUID NOT NULL,
  "recipient_snapshot" JSONB NOT NULL,
  "rendered_subject" VARCHAR(300),
  "rendered_body_text" TEXT NOT NULL,
  "rendered_body_html" TEXT,
  "resolved_variables" JSONB NOT NULL,
  "context_snapshot" JSONB NOT NULL,
  "content_sha256" CHAR(64) NOT NULL,
  "status" "CommunicationStatus" NOT NULL DEFAULT 'PREPARED',
  "provider_ref" VARCHAR(191),
  "prepared_by_membership_id" TEXT NOT NULL,
  "prepared_by_user_id" TEXT NOT NULL,
  "prepared_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "queued_at" TIMESTAMPTZ(6),
  "sent_at" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  CONSTRAINT "communication_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communication_commands" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "target_ref" UUID,
  "result_json" JSONB NOT NULL,
  "actor_membership_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_commands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communication_audit_events" (
  "id" TEXT NOT NULL,
  "event_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "aggregate_type" VARCHAR(80) NOT NULL,
  "aggregate_ref" UUID NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "before_snapshot" JSONB,
  "after_snapshot" JSONB,
  "actor_membership_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "communication_templates_tenant_id_key" ON "communication_templates"("tenant_id","id");
CREATE UNIQUE INDEX "communication_templates_tenant_ref_key" ON "communication_templates"("tenant_id","template_ref");
CREATE UNIQUE INDEX "communication_templates_tenant_code_key" ON "communication_templates"("tenant_id","code");
CREATE INDEX "communication_templates_catalog_idx" ON "communication_templates"("tenant_id","category","state","name");
CREATE UNIQUE INDEX "communication_template_versions_tenant_id_key" ON "communication_template_versions"("tenant_id","id");
CREATE UNIQUE INDEX "communication_template_versions_tenant_ref_key" ON "communication_template_versions"("tenant_id","version_ref");
CREATE UNIQUE INDEX "communication_template_versions_number_key" ON "communication_template_versions"("tenant_id","template_id","version");
CREATE UNIQUE INDEX "communication_template_versions_single_draft_key" ON "communication_template_versions"("tenant_id","template_id") WHERE "state"='DRAFT';
CREATE INDEX "communication_template_versions_current_idx" ON "communication_template_versions"("tenant_id","template_id","state","version" DESC);
CREATE UNIQUE INDEX "communication_records_tenant_ref_key" ON "communication_records"("tenant_id","communication_ref");
CREATE INDEX "communication_records_case_idx" ON "communication_records"("tenant_id","pipeline_case_id","prepared_at" DESC);
CREATE INDEX "communication_records_assignment_idx" ON "communication_records"("tenant_id","survey_assignment_id","prepared_at" DESC);
CREATE INDEX "communication_records_quote_revision_idx" ON "communication_records"("tenant_id","quote_proposal_revision_id","prepared_at" DESC);
CREATE UNIQUE INDEX "communication_commands_request_key" ON "communication_commands"("tenant_id","request_id");
CREATE INDEX "communication_commands_target_idx" ON "communication_commands"("tenant_id","target_ref","created_at" DESC);
CREATE UNIQUE INDEX "communication_audit_events_tenant_ref_key" ON "communication_audit_events"("tenant_id","event_ref");
CREATE INDEX "communication_audit_events_aggregate_idx" ON "communication_audit_events"("tenant_id","aggregate_ref","created_at" DESC);

ALTER TABLE "communication_templates"
  ADD CONSTRAINT "communication_templates_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_templates_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_.-]{2,79}$');
ALTER TABLE "communication_template_versions"
  ADD CONSTRAINT "communication_template_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_template_versions_template_fkey" FOREIGN KEY ("tenant_id","template_id") REFERENCES "communication_templates"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_template_versions_creator_fkey" FOREIGN KEY ("tenant_id","created_by_membership_id","created_by_user_id") REFERENCES "tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_template_versions_publisher_fkey" FOREIGN KEY ("tenant_id","published_by_membership_id","published_by_user_id") REFERENCES "tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_template_versions_version_check" CHECK ("version">0),
  ADD CONSTRAINT "communication_template_versions_audiences_check" CHECK (cardinality("audiences")>0),
  ADD CONSTRAINT "communication_template_versions_channels_check" CHECK (cardinality("channels")>0),
  ADD CONSTRAINT "communication_template_versions_hash_check" CHECK ("content_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "communication_template_versions_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from"),
  ADD CONSTRAINT "communication_template_versions_publication_check" CHECK (("state"='DRAFT' AND "published_at" IS NULL AND "published_by_membership_id" IS NULL AND "published_by_user_id" IS NULL) OR ("state"<>'DRAFT' AND "published_at" IS NOT NULL AND "published_by_membership_id" IS NOT NULL AND "published_by_user_id" IS NOT NULL));
ALTER TABLE "communication_records"
  ADD CONSTRAINT "communication_records_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_records_case_fkey" FOREIGN KEY ("tenant_id","pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_records_template_version_fkey" FOREIGN KEY ("tenant_id","template_version_id") REFERENCES "communication_template_versions"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_records_assignment_fkey" FOREIGN KEY ("tenant_id","survey_assignment_id") REFERENCES "survey_assignments"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_records_quote_revision_fkey" FOREIGN KEY ("tenant_id","quote_proposal_revision_id") REFERENCES "quote_proposal_revisions"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_records_actor_fkey" FOREIGN KEY ("tenant_id","prepared_by_membership_id","prepared_by_user_id") REFERENCES "tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_records_hash_check" CHECK ("content_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "communication_records_status_time_check" CHECK (("status"='PREPARED' AND "queued_at" IS NULL AND "sent_at" IS NULL AND "delivered_at" IS NULL AND "failed_at" IS NULL AND "cancelled_at" IS NULL) OR ("status"='QUEUED' AND "queued_at" IS NOT NULL AND "sent_at" IS NULL AND "delivered_at" IS NULL AND "failed_at" IS NULL AND "cancelled_at" IS NULL) OR ("status"='SENT' AND "sent_at" IS NOT NULL AND "delivered_at" IS NULL AND "failed_at" IS NULL AND "cancelled_at" IS NULL) OR ("status"='DELIVERED' AND "sent_at" IS NOT NULL AND "delivered_at" IS NOT NULL AND "failed_at" IS NULL AND "cancelled_at" IS NULL) OR ("status"='FAILED' AND "failed_at" IS NOT NULL AND "delivered_at" IS NULL AND "cancelled_at" IS NULL) OR ("status"='CANCELLED' AND "cancelled_at" IS NOT NULL AND "delivered_at" IS NULL));
ALTER TABLE "communication_commands"
  ADD CONSTRAINT "communication_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_commands_actor_fkey" FOREIGN KEY ("tenant_id","actor_membership_id","actor_user_id") REFERENCES "tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_commands_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "communication_audit_events"
  ADD CONSTRAINT "communication_audit_events_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "communication_audit_events_actor_fkey" FOREIGN KEY ("tenant_id","actor_membership_id","actor_user_id") REFERENCES "tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "communication_template_version_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'COMMUNICATION_TEMPLATE_VERSION_DELETE_FORBIDDEN' USING ERRCODE='23514'; END IF;
  IF OLD."state"<>'DRAFT' THEN RAISE EXCEPTION 'COMMUNICATION_TEMPLATE_VERSION_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR NEW."template_id" IS DISTINCT FROM OLD."template_id" OR NEW."version" IS DISTINCT FROM OLD."version" OR NEW."version_ref" IS DISTINCT FROM OLD."version_ref" THEN RAISE EXCEPTION 'COMMUNICATION_TEMPLATE_VERSION_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "communication_template_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'COMMUNICATION_TEMPLATE_DELETE_FORBIDDEN' USING ERRCODE='23514'; END IF;
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR NEW."template_ref" IS DISTINCT FROM OLD."template_ref" OR NEW."code" IS DISTINCT FROM OLD."code" THEN RAISE EXCEPTION 'COMMUNICATION_TEMPLATE_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "communication_record_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'COMMUNICATION_RECORD_DELETE_FORBIDDEN' USING ERRCODE='23514'; END IF;
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR NEW."communication_ref" IS DISTINCT FROM OLD."communication_ref" OR NEW."pipeline_case_id" IS DISTINCT FROM OLD."pipeline_case_id" OR NEW."template_version_id" IS DISTINCT FROM OLD."template_version_id" OR NEW."survey_assignment_id" IS DISTINCT FROM OLD."survey_assignment_id" OR NEW."quote_proposal_revision_id" IS DISTINCT FROM OLD."quote_proposal_revision_id" OR NEW."milestone" IS DISTINCT FROM OLD."milestone" OR NEW."channel" IS DISTINCT FROM OLD."channel" OR NEW."recipient_type" IS DISTINCT FROM OLD."recipient_type" OR NEW."recipient_ref" IS DISTINCT FROM OLD."recipient_ref" OR NEW."recipient_snapshot" IS DISTINCT FROM OLD."recipient_snapshot" OR NEW."rendered_subject" IS DISTINCT FROM OLD."rendered_subject" OR NEW."rendered_body_text" IS DISTINCT FROM OLD."rendered_body_text" OR NEW."rendered_body_html" IS DISTINCT FROM OLD."rendered_body_html" OR NEW."resolved_variables" IS DISTINCT FROM OLD."resolved_variables" OR NEW."context_snapshot" IS DISTINCT FROM OLD."context_snapshot" OR NEW."content_sha256" IS DISTINCT FROM OLD."content_sha256" OR NEW."prepared_by_membership_id" IS DISTINCT FROM OLD."prepared_by_membership_id" OR NEW."prepared_by_user_id" IS DISTINCT FROM OLD."prepared_by_user_id" OR NEW."prepared_at" IS DISTINCT FROM OLD."prepared_at" THEN RAISE EXCEPTION 'COMMUNICATION_RECORD_SNAPSHOT_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NOT ((OLD."status"='PREPARED' AND NEW."status" IN ('QUEUED','FAILED','CANCELLED')) OR (OLD."status"='QUEUED' AND NEW."status" IN ('SENT','FAILED','CANCELLED')) OR (OLD."status"='SENT' AND NEW."status" IN ('DELIVERED','FAILED'))) THEN RAISE EXCEPTION 'COMMUNICATION_STATUS_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "communication_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'COMMUNICATION_APPEND_ONLY' USING ERRCODE='23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "communication_templates_guard" BEFORE UPDATE OR DELETE ON "communication_templates" FOR EACH ROW EXECUTE FUNCTION "communication_template_guard"();
CREATE TRIGGER "communication_template_versions_guard" BEFORE UPDATE OR DELETE ON "communication_template_versions" FOR EACH ROW EXECUTE FUNCTION "communication_template_version_guard"();
CREATE TRIGGER "communication_records_guard" BEFORE UPDATE OR DELETE ON "communication_records" FOR EACH ROW EXECUTE FUNCTION "communication_record_guard"();
CREATE TRIGGER "communication_commands_append_only" BEFORE UPDATE OR DELETE ON "communication_commands" FOR EACH ROW EXECUTE FUNCTION "communication_append_only"();
CREATE TRIGGER "communication_audit_events_append_only" BEFORE UPDATE OR DELETE ON "communication_audit_events" FOR EACH ROW EXECUTE FUNCTION "communication_append_only"();
