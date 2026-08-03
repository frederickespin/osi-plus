CREATE TABLE "evaluator_article_catalog_snapshots" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "evaluator_article_catalog_snapshots_pkey" PRIMARY KEY ("id")
);
