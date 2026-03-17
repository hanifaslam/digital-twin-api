/*
  Warnings:

  - You are about to drop the column `module` on the `Permission` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `module_id` to the `Permission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Permission" DROP COLUMN "module",
ADD COLUMN     "module_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reset_password_expires" TIMESTAMP(3),
ADD COLUMN     "reset_password_token" TEXT,
ADD COLUMN     "status" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "username" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sequence" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Module_name_key" ON "Module"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Module_code_key" ON "Module"("code");

-- CreateIndex
CREATE INDEX "Attendance_lecturer_id_idx" ON "Attendance"("lecturer_id");

-- CreateIndex
CREATE INDEX "Attendance_room_id_idx" ON "Attendance"("room_id");

-- CreateIndex
CREATE INDEX "Attendance_check_in_at_idx" ON "Attendance"("check_in_at");

-- CreateIndex
CREATE INDEX "Schedule_lecturer_id_room_id_day_idx" ON "Schedule"("lecturer_id", "room_id", "day");

-- CreateIndex
CREATE INDEX "SensorLog_room_id_idx" ON "SensorLog"("room_id");

-- CreateIndex
CREATE INDEX "SensorLog_created_at_idx" ON "SensorLog"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_id_idx" ON "User"("role_id");

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "Module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
