CREATE TABLE "operational_compensation_configs" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "operational_compensation_configs_pkey" PRIMARY KEY ("id")
);
