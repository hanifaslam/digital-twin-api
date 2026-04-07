/*
  Warnings:

  - You are about to drop the `FaceData` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "FaceData" DROP CONSTRAINT "FaceData_lecturer_id_fkey";

-- DropTable
DROP TABLE "FaceData";

-- CreateTable
CREATE TABLE "face_data" (
    "id" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "image_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "face_data_lecturer_id_key" ON "face_data"("lecturer_id");

-- AddForeignKey
ALTER TABLE "face_data" ADD CONSTRAINT "face_data_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "Lecturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
