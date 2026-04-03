CREATE TABLE "MasterClass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterClass_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MasterClass_name_key" ON "MasterClass"("name");
