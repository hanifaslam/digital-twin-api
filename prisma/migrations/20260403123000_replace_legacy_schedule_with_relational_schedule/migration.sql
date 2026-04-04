DROP TABLE "Schedule";

CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "study_program_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "time_slot_id" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Schedule_study_program_id_class_id_room_id_lecturer_id_course_id_time_slot_id_key"
ON "Schedule"(
    "study_program_id",
    "class_id",
    "room_id",
    "lecturer_id",
    "course_id",
    "time_slot_id"
);

CREATE INDEX "Schedule_study_program_id_idx" ON "Schedule"("study_program_id");
CREATE INDEX "Schedule_class_id_idx" ON "Schedule"("class_id");
CREATE INDEX "Schedule_lecturer_id_idx" ON "Schedule"("lecturer_id");
CREATE INDEX "Schedule_room_id_idx" ON "Schedule"("room_id");
CREATE INDEX "Schedule_course_id_idx" ON "Schedule"("course_id");
CREATE INDEX "Schedule_time_slot_id_idx" ON "Schedule"("time_slot_id");

ALTER TABLE "Schedule"
ADD CONSTRAINT "Schedule_study_program_id_fkey"
FOREIGN KEY ("study_program_id") REFERENCES "StudyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Schedule"
ADD CONSTRAINT "Schedule_class_id_fkey"
FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Schedule"
ADD CONSTRAINT "Schedule_lecturer_id_fkey"
FOREIGN KEY ("lecturer_id") REFERENCES "Lecturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Schedule"
ADD CONSTRAINT "Schedule_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Schedule"
ADD CONSTRAINT "Schedule_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Schedule"
ADD CONSTRAINT "Schedule_time_slot_id_fkey"
FOREIGN KEY ("time_slot_id") REFERENCES "TimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
