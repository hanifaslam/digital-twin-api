ALTER TABLE "MasterFloor"
RENAME TO "Floor";

ALTER TABLE "MasterTimeSlot"
RENAME TO "TimeSlot";

ALTER TABLE "MasterClass"
RENAME TO "Class";

ALTER TABLE "Floor"
RENAME CONSTRAINT "MasterFloor_pkey" TO "Floor_pkey";

ALTER TABLE "TimeSlot"
RENAME CONSTRAINT "MasterTimeSlot_pkey" TO "TimeSlot_pkey";

ALTER TABLE "Class"
RENAME CONSTRAINT "MasterClass_pkey" TO "Class_pkey";

ALTER INDEX "MasterFloor_name_key"
RENAME TO "Floor_name_key";

ALTER INDEX "MasterTimeSlot_name_key"
RENAME TO "TimeSlot_name_key";

ALTER INDEX "MasterTimeSlot_start_time_end_time_key"
RENAME TO "TimeSlot_start_time_end_time_key";

ALTER INDEX "MasterTimeSlot_start_time_idx"
RENAME TO "TimeSlot_start_time_idx";

ALTER INDEX "MasterClass_name_key"
RENAME TO "Class_name_key";
