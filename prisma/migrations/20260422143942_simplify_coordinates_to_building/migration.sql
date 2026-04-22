/*
  Warnings:

  - You are about to drop the column `latitude` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `radius` on the `Room` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Room" DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "radius";
