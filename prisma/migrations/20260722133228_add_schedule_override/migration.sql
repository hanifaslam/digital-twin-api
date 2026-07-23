-- CreateTable
CREATE TABLE "ScheduleOverride" (
    "id" TEXT NOT NULL,
    "original_schedule_id" TEXT NOT NULL,
    "override_date" DATE NOT NULL,
    "new_room_id" TEXT NOT NULL,
    "new_time_slot_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleOverride_override_date_idx" ON "ScheduleOverride"("override_date");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOverride_original_schedule_id_override_date_key" ON "ScheduleOverride"("original_schedule_id", "override_date");

-- AddForeignKey
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_original_schedule_id_fkey" FOREIGN KEY ("original_schedule_id") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_new_room_id_fkey" FOREIGN KEY ("new_room_id") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_new_time_slot_id_fkey" FOREIGN KEY ("new_time_slot_id") REFERENCES "TimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
