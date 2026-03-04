require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Definisikan Permissions per Modul
  const permissionsData = [
    { name: "USER_MANAGEMENT", module: "AUTH" },
    { name: "ROLE_MANAGEMENT", module: "AUTH" },
    { name: "MASTER_DATA_READ", module: "MASTER" },
    { name: "MASTER_DATA_EDIT", module: "MASTER" },
    { name: "SCHEDULE_MANAGE", module: "JADWAL" },
    { name: "ATTENDANCE_CREATE", module: "KEHADIRAN" },
    { name: "ATTENDANCE_READ", module: "KEHADIRAN" },
    { name: "DIGITAL_TWIN_VIEW", module: "DIGITAL_TWIN" },
    { name: "MONITORING_READ", module: "INFRA" },
    { name: "DEVICE_CONTROL", module: "CONTROLLING" },
    { name: "ANALYTICS_READ", module: "ANALYTICS" },
  ];

  for (const p of permissionsData) {
    await prisma.permission.upsert({
      where: { name: p.name },
      update: {},
      create: p,
    });
  }

  // 2. Buat Roles
  const roles = ["SUPERADMIN", "DOSEN", "HELPER", "MAHASISWA"];
  const allPerms = await prisma.permission.findMany();

  for (const roleName of roles) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    // Mapping Role ke Permission
    let rolePerms = [];
    if (roleName === "SUPERADMIN") {
      rolePerms = allPerms;
    } else if (roleName === "DOSEN") {
      rolePerms = allPerms.filter((p) =>
        [
          "ATTENDANCE_CREATE",
          "DEVICE_CONTROL",
          "MONITORING_READ",
          "DIGITAL_TWIN_VIEW",
        ].includes(p.name),
      );
    } else if (roleName === "HELPER") {
      rolePerms = allPerms.filter((p) =>
        [
          "MONITORING_READ",
          "DEVICE_CONTROL",
          "DIGITAL_TWIN_VIEW",
          "MASTER_DATA_READ",
        ].includes(p.name),
      );
    } else if (roleName === "MAHASISWA") {
      rolePerms = allPerms.filter((p) =>
        ["DIGITAL_TWIN_VIEW"].includes(p.name),
      );
    }

    for (const p of rolePerms) {
      await prisma.rolePermission.upsert({
        where: {
          role_id_permission_id: { role_id: role.id, permission_id: p.id },
        },
        update: {},
        create: { role_id: role.id, permission_id: p.id },
      });
    }
  }

  // 3. Buat Super Admin Awal
  const superRole = await prisma.role.findUnique({
    where: { name: "SUPERADMIN" },
  });
  const hashedPassword = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@twin.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "admin@twin.com",
      password: hashedPassword,
      role_id: superRole.id,
    },
  });

  console.log("Seed data success! 🚀");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
