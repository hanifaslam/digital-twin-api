-- CreateEnum
CREATE TYPE "AcademicPeriodType" AS ENUM ('GANJIL', 'GENAP');

-- CreateTable
CREATE TABLE "AcademicPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AcademicPeriodType" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicPeriod_status_idx" ON "AcademicPeriod"("status");

-- CreateIndex
CREATE INDEX "AcademicPeriod_start_date_end_date_idx" ON "AcademicPeriod"("start_date", "end_date");
