ALTER TABLE "MasterFloor"
RENAME COLUMN "nama" TO "name";

ALTER INDEX "MasterFloor_nama_key"
RENAME TO "MasterFloor_name_key";
