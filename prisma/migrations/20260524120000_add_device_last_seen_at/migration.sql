ALTER TABLE "Device"
ADD COLUMN "last_seen_at" TIMESTAMP(3);

CREATE INDEX "Device_last_seen_at_idx" ON "Device"("last_seen_at");
