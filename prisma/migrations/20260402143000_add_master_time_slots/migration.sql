CREATE TABLE "MasterTimeSlot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterTimeSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MasterTimeSlot_name_key" ON "MasterTimeSlot"("name");
CREATE UNIQUE INDEX "MasterTimeSlot_start_time_end_time_key" ON "MasterTimeSlot"("start_time", "end_time");
CREATE INDEX "MasterTimeSlot_start_time_idx" ON "MasterTimeSlot"("start_time");
