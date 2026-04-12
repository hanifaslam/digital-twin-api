-- CreateTable
CREATE TABLE "DailySensorSummary" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "avg_voltage" DOUBLE PRECISION,
    "avg_current" DOUBLE PRECISION,
    "avg_power" DOUBLE PRECISION,
    "total_energy" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySensorSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailySensorSummary_room_id_date_key" ON "DailySensorSummary"("room_id", "date");

-- AddForeignKey
ALTER TABLE "DailySensorSummary" ADD CONSTRAINT "DailySensorSummary_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
