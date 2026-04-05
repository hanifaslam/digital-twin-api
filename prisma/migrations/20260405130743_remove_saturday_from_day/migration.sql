/*
  Warnings:

  - The values [SATURDAY] on the enum `Day` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Day_new" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY');
ALTER TABLE "Schedule" ALTER COLUMN "day" TYPE "Day_new" USING ("day"::text::"Day_new");
ALTER TYPE "Day" RENAME TO "Day_old";
ALTER TYPE "Day_new" RENAME TO "Day";
DROP TYPE "public"."Day_old";
COMMIT;

-- DropIndex
DROP INDEX "Schedule_study_program_id_class_id_room_id_lecturer_id_course_i";
