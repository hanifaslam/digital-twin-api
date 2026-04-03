ALTER TABLE "Class"
ADD COLUMN "study_program_id" TEXT;

DO $$
DECLARE
  class_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO class_count
  FROM "Class"
  WHERE "study_program_id" IS NULL;

  IF class_count > 0 THEN
    RAISE EXCEPTION
      'Cannot automatically assign study_program_id for % existing class rows. Please map them manually before re-running this migration.',
      class_count;
  END IF;
END $$;

ALTER TABLE "Class"
ALTER COLUMN "study_program_id" SET NOT NULL;

DROP INDEX "Class_name_key";

CREATE INDEX "Class_study_program_id_idx" ON "Class"("study_program_id");
CREATE UNIQUE INDEX "Class_study_program_id_name_key" ON "Class"("study_program_id", "name");

ALTER TABLE "Class"
ADD CONSTRAINT "Class_study_program_id_fkey"
FOREIGN KEY ("study_program_id") REFERENCES "StudyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
