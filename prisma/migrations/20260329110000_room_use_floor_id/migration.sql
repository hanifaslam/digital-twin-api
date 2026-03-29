ALTER TABLE "Room"
ADD COLUMN "floor_id" TEXT;

INSERT INTO "MasterFloor" ("id", "name", "status", "created_at", "updated_at")
SELECT
  CONCAT('legacy-floor-', room_floors.floor::TEXT) AS id,
  room_floors.floor::TEXT AS name,
  true AS status,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "floor"
  FROM "Room"
) AS room_floors
WHERE NOT EXISTS (
  SELECT 1
  FROM "MasterFloor" mf
  WHERE mf."name" = room_floors.floor::TEXT
);

UPDATE "Room" r
SET "floor_id" = mf."id"
FROM "MasterFloor" mf
WHERE mf."name" = r."floor"::TEXT;

ALTER TABLE "Room"
ALTER COLUMN "floor_id" SET NOT NULL;

DROP INDEX IF EXISTS "Room_floor_idx";

CREATE INDEX "Room_floor_id_idx" ON "Room"("floor_id");

ALTER TABLE "Room"
ADD CONSTRAINT "Room_floor_id_fkey"
FOREIGN KEY ("floor_id") REFERENCES "MasterFloor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Room"
DROP COLUMN "floor";
