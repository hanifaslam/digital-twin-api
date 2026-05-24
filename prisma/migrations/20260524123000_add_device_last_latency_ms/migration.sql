ALTER TABLE "Device"
ADD COLUMN "last_latency_ms" INTEGER;

CREATE INDEX "Device_last_latency_ms_idx" ON "Device"("last_latency_ms");
