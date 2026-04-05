-- CreateEnum (skip if already exists)
DO $$ BEGIN
  CREATE TYPE "Day" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: tambah kolom dengan default dulu supaya existing rows tidak null
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "day" "Day" NOT NULL DEFAULT 'MONDAY';

-- Hapus default setelah kolom terisi
ALTER TABLE "Schedule" ALTER COLUMN "day" DROP DEFAULT;

-- DropIndex
DROP INDEX IF EXISTS "Schedule_study_program_id_class_id_room_id_lecturer_id_cour_key";

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_study_program_id_class_id_room_id_lecturer_id_cour_key" ON "Schedule"("study_program_id", "class_id", "room_id", "lecturer_id", "course_id", "time_slot_id", "day");
