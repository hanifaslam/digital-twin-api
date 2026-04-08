/*
  Warnings:

  - You are about to drop the column `is_available` on the `Lecturer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Lecturer" DROP COLUMN "is_available",
ADD COLUMN     "is_manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_auto_status" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'OFFLINE';
