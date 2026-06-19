/*
  Warnings:

  - A unique constraint covering the columns `[room_id,device_id,date]` on the table `DailySensorSummary` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "DailySensorSummary_room_id_date_key";

-- AlterTable
ALTER TABLE "DailySensorSummary" ADD COLUMN     "device_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DailySensorSummary_room_id_device_id_date_key" ON "DailySensorSummary"("room_id", "device_id", "date");

-- AddForeignKey
ALTER TABLE "DailySensorSummary" ADD CONSTRAINT "DailySensorSummary_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
