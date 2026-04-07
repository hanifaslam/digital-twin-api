/*
  Warnings:

  - You are about to drop the `face_data` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "face_data" DROP CONSTRAINT "face_data_lecturer_id_fkey";

-- DropTable
DROP TABLE "face_data";

-- CreateTable
CREATE TABLE "FaceData" (
    "id" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "image_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FaceData_lecturer_id_key" ON "FaceData"("lecturer_id");

-- AddForeignKey
ALTER TABLE "FaceData" ADD CONSTRAINT "FaceData_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "Lecturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
