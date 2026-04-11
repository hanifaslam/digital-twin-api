/*
  Warnings:

  - You are about to drop the column `check_out_at` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `room_id` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Attendance` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_room_id_fkey";

-- DropIndex
DROP INDEX "Attendance_room_id_idx";

-- AlterTable
ALTER TABLE "Attendance" DROP COLUMN "check_out_at",
DROP COLUMN "room_id",
DROP COLUMN "status";
