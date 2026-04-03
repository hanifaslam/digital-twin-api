-- CreateTable
CREATE TABLE "Helper" (
    "id" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "phone_number" TEXT,
    "user_id" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Helper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelperBuilding" (
    "helper_id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,

    CONSTRAINT "HelperBuilding_pkey" PRIMARY KEY ("helper_id","building_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Helper_nip_key" ON "Helper"("nip");

-- CreateIndex
CREATE UNIQUE INDEX "Helper_user_id_key" ON "Helper"("user_id");

-- CreateIndex
CREATE INDEX "HelperBuilding_building_id_idx" ON "HelperBuilding"("building_id");

-- AddForeignKey
ALTER TABLE "Helper"
ADD CONSTRAINT "Helper_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelperBuilding"
ADD CONSTRAINT "HelperBuilding_helper_id_fkey"
FOREIGN KEY ("helper_id") REFERENCES "Helper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelperBuilding"
ADD CONSTRAINT "HelperBuilding_building_id_fkey"
FOREIGN KEY ("building_id") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
