-- MT-01C1A is additive. It does not transform osi_users.employeeProfile and
-- does not create employee profiles automatically.

CREATE TYPE "osi"."EmployeeEmploymentStatus" AS ENUM (
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'TERMINATED'
);

CREATE TYPE "osi"."EmployeeContractType" AS ENUM (
  'PERMANENT',
  'MOBILE_STAFF',
  'FIXED_TERM',
  'CONTRACTOR'
);

CREATE TYPE "osi"."EmployeeAvailabilityStatus" AS ENUM (
  'AVAILABLE',
  'LIMITED',
  'UNAVAILABLE'
);

CREATE TABLE "osi"."employee_profiles" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "membership_id" text NOT NULL,
  "user_id" text NOT NULL,
  "employee_code" varchar(64) NOT NULL,
  "normalized_employee_code" varchar(64) NOT NULL,
  "job_title" varchar(120),
  "department_code" varchar(64),
  "employment_status" "osi"."EmployeeEmploymentStatus" NOT NULL,
  "contract_type" "osi"."EmployeeContractType",
  "availability_status" "osi"."EmployeeAvailabilityStatus" NOT NULL,
  "supervisor_membership_id" text,
  "supervisor_user_id" text,
  "hired_at" date,
  "contract_starts_at" date,
  "contract_ends_at" date,
  "terminated_at" date,
  "provisioning_source" "osi"."TenantProvisioningSource" NOT NULL DEFAULT 'MANUAL',
  "provisioning_batch_id" varchar(128),
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_profiles_employee_code_nonempty_check"
    CHECK (
      btrim("employee_code") <> ''
      AND "employee_code" = upper(btrim("employee_code"))
    ),
  CONSTRAINT "employee_profiles_normalized_code_check"
    CHECK (
      "normalized_employee_code" <> ''
      AND "normalized_employee_code" = upper(regexp_replace(btrim("employee_code"), '[[:space:]]+', '', 'g'))
    ),
  CONSTRAINT "employee_profiles_supervisor_pair_check"
    CHECK (
      ("supervisor_membership_id" IS NULL AND "supervisor_user_id" IS NULL)
      OR
      ("supervisor_membership_id" IS NOT NULL AND "supervisor_user_id" IS NOT NULL)
    ),
  CONSTRAINT "employee_profiles_no_self_supervision_check"
    CHECK (
      "supervisor_membership_id" IS NULL
      OR "supervisor_membership_id" <> "membership_id"
    ),
  CONSTRAINT "employee_profiles_contract_dates_check"
    CHECK (
      "contract_starts_at" IS NULL
      OR "contract_ends_at" IS NULL
      OR "contract_starts_at" <= "contract_ends_at"
    ),
  CONSTRAINT "employee_profiles_hired_contract_end_check"
    CHECK (
      ("hired_at" IS NULL OR "contract_starts_at" IS NULL OR "hired_at" <= "contract_starts_at")
      AND
      ("hired_at" IS NULL OR "contract_ends_at" IS NULL OR "hired_at" <= "contract_ends_at")
    ),
  CONSTRAINT "employee_profiles_termination_status_check"
    CHECK (
      ("employment_status" = 'TERMINATED') = ("terminated_at" IS NOT NULL)
    ),
  CONSTRAINT "employee_profiles_termination_dates_check"
    CHECK (
      ("hired_at" IS NULL OR "terminated_at" IS NULL OR "hired_at" <= "terminated_at")
      AND
      ("contract_starts_at" IS NULL OR "terminated_at" IS NULL OR "contract_starts_at" <= "terminated_at")
    )
);

CREATE UNIQUE INDEX "employee_profiles_tenant_id_id_key"
  ON "osi"."employee_profiles" ("tenant_id", "id");

CREATE UNIQUE INDEX "employee_profiles_tenant_id_membership_id_key"
  ON "osi"."employee_profiles" ("tenant_id", "membership_id");

CREATE UNIQUE INDEX "employee_profiles_tenant_id_membership_id_user_id_key"
  ON "osi"."employee_profiles" ("tenant_id", "membership_id", "user_id");

CREATE UNIQUE INDEX "employee_profiles_tenant_id_normalized_employee_code_key"
  ON "osi"."employee_profiles" ("tenant_id", "normalized_employee_code");

CREATE INDEX "employee_profiles_tenant_id_employment_status_department_co_idx"
  ON "osi"."employee_profiles" ("tenant_id", "employment_status", "department_code");

CREATE INDEX "employee_profiles_tenant_id_availability_status_idx"
  ON "osi"."employee_profiles" ("tenant_id", "availability_status");

CREATE INDEX "employee_profiles_tenant_id_supervisor_membership_id_idx"
  ON "osi"."employee_profiles" ("tenant_id", "supervisor_membership_id");

CREATE INDEX "employee_profiles_provisioning_batch_id_idx"
  ON "osi"."employee_profiles" ("provisioning_batch_id");

ALTER TABLE "osi"."employee_profiles"
  ADD CONSTRAINT "employee_profiles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."employee_profiles"
  ADD CONSTRAINT "employee_profiles_tenant_id_membership_id_user_id_fkey"
  FOREIGN KEY ("tenant_id", "membership_id", "user_id")
  REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."employee_profiles"
  ADD CONSTRAINT "employee_profiles_tenant_id_supervisor_membership_id_super_fkey"
  FOREIGN KEY ("tenant_id", "supervisor_membership_id", "supervisor_user_id")
  REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "osi"."employee_profiles_guard_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."membership_id" IS DISTINCT FROM OLD."membership_id"
     OR NEW."user_id" IS DISTINCT FROM OLD."user_id" THEN
    RAISE EXCEPTION 'EmployeeProfile enterprise identity is immutable'
      USING ERRCODE = '23514';
  END IF;

  NEW."updated_at" := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "employee_profiles_guard_update_trigger"
BEFORE UPDATE ON "osi"."employee_profiles"
FOR EACH ROW
EXECUTE FUNCTION "osi"."employee_profiles_guard_update"();

COMMENT ON TABLE "osi"."employee_profiles" IS
  'Tenant-owned employment data. Access authority remains in tenant_memberships; global identity remains in osi_users.';
