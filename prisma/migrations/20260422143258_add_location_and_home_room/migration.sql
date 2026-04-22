-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "radius" DOUBLE PRECISION DEFAULT 100;

-- AlterTable
ALTER TABLE "StudyProgram" ADD COLUMN     "home_room_id" TEXT;

-- AddForeignKey
ALTER TABLE "StudyProgram" ADD CONSTRAINT "StudyProgram_home_room_id_fkey" FOREIGN KEY ("home_room_id") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
