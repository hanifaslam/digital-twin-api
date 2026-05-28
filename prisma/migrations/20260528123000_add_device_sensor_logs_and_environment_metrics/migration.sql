ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'SENSOR';

ALTER TABLE "SensorLog"
ADD COLUMN "device_id" TEXT,
ADD COLUMN "sensor_type" TEXT,
ADD COLUMN "temperature" DOUBLE PRECISION,
ADD COLUMN "humidity" DOUBLE PRECISION;

CREATE INDEX "SensorLog_device_id_idx" ON "SensorLog"("device_id");
CREATE INDEX "SensorLog_sensor_type_idx" ON "SensorLog"("sensor_type");

ALTER TABLE "SensorLog"
ADD CONSTRAINT "SensorLog_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "Device"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
