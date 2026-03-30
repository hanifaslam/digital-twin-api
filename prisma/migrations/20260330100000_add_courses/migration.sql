-- CreateEnum
CREATE TYPE "CourseSemester" AS ENUM (
    'SEMESTER_1',
    'SEMESTER_2',
    'SEMESTER_3',
    'SEMESTER_4',
    'SEMESTER_5',
    'SEMESTER_6',
    'SEMESTER_7',
    'SEMESTER_8'
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "semester" "CourseSemester" NOT NULL,
    "study_program_id" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_study_program_id_code_key" ON "Course"("study_program_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Course_study_program_id_name_key" ON "Course"("study_program_id", "name");

-- CreateIndex
CREATE INDEX "Course_study_program_id_idx" ON "Course"("study_program_id");

-- CreateIndex
CREATE INDEX "Course_semester_idx" ON "Course"("semester");

-- AddForeignKey
ALTER TABLE "Course"
ADD CONSTRAINT "Course_study_program_id_fkey"
FOREIGN KEY ("study_program_id") REFERENCES "StudyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
