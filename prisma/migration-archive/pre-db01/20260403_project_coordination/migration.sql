-- Coordination production foundation
-- Durable project coordination dossier + communication log

CREATE TABLE IF NOT EXISTS "osi_project_coordination" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "requirements_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "milestones_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "documents_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "osi_project_coordination_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "osi_project_coordination_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "osi_projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_project_coordination_project_id_key"
  ON "osi_project_coordination"("project_id");

CREATE TABLE IF NOT EXISTS "osi_project_coordination_communications" (
  "id" TEXT NOT NULL,
  "coordination_id" TEXT NOT NULL,
  "template_key" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "subject" TEXT,
  "content" TEXT NOT NULL,
  "recipient_name" TEXT,
  "recipient_email" TEXT,
  "sent_by_id" TEXT,
  "sent_by_role" TEXT,
  "sent_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_project_coordination_communications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "osi_project_coordination_communications_coordination_id_fkey"
    FOREIGN KEY ("coordination_id") REFERENCES "osi_project_coordination"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "osi_project_coordination_communications_coordination_id_sent_at_idx"
  ON "osi_project_coordination_communications"("coordination_id", "sent_at");
