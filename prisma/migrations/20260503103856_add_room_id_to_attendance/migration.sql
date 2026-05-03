-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "room_id" TEXT;

-- CreateIndex
CREATE INDEX "Attendance_room_id_idx" ON "Attendance"("room_id");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
