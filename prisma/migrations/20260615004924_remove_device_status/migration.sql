/*
  Warnings:

  - You are about to drop the `DeviceStatus` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DeviceStatus" DROP CONSTRAINT "DeviceStatus_room_id_fkey";

-- DropTable
DROP TABLE "DeviceStatus";
