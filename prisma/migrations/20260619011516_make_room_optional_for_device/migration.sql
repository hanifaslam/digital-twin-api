-- DropForeignKey
ALTER TABLE "Device" DROP CONSTRAINT "Device_room_id_fkey";

-- AlterTable
ALTER TABLE "Device" ALTER COLUMN "room_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
