require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // 1. Buat Modules (Dashboard dan User Management)
  const modulesData = [
    { name: 'Dashboard', code: 'dashboard', sequence: 1 },
    { name: 'User Management', code: 'user_management', sequence: 2 }
  ]

  const modules = {}
  for (const m of modulesData) {
    modules[m.code] = await prisma.module.upsert({
      where: { code: m.code },
      update: m,
      create: m
    })
  }

  // 2. Definisikan Permissions
  const permissionsData = [
    { name: 'DASHBOARD', module_code: 'dashboard' },
    { name: 'USER', module_code: 'user_management' },
    { name: 'ROLE', module_code: 'user_management' }
  ]

  for (const p of permissionsData) {
    await prisma.permission.upsert({
      where: { name: p.name },
      update: { module_id: modules[p.module_code].id },
      create: {
        name: p.name,
        module_id: modules[p.module_code].id
      }
    })
  }

  // 3. Buat Roles
  const roles = ['Super Admin', 'Dosen', 'Helper', 'Mahasiswa']
  const allPerms = await prisma.permission.findMany()

  for (const roleName of roles) {
    const roleCode = roleName.toUpperCase().replace(/\s+/g, '_')
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {
        code: roleCode,
        status: true
      },
      create: {
        name: roleName,
        code: roleCode,
        status: true
      }
    })

    // Mapping Role ke Permission
    let rolePerms = []
    if (roleName === 'Super Admin') {
      rolePerms = allPerms
    } else {
      // Role lain sementara hanya Dashboard View
      rolePerms = allPerms.filter((p) => p.name === 'DASHBOARD')
    }

    for (const p of rolePerms) {
      await prisma.rolePermission.upsert({
        where: {
          role_id_permission_id: { role_id: role.id, permission_id: p.id }
        },
        update: {},
        create: { role_id: role.id, permission_id: p.id }
      })
    }
  }

  // 4. Buat Super Admin Awal
  const superRole = await prisma.role.findUnique({
    where: { name: 'Super Admin' }
  })
  const hashedPassword = await bcrypt.hash('secret123', 10)

  await prisma.user.upsert({
    where: { email: 'admin@twin.com' },
    update: {},
    create: {
      name: 'Super Admin',
      username: 'Superadmin',
      email: 'admin@twin.com',
      password: hashedPassword,
      role_id: superRole.id
    }
  })

  console.log('Seed data success! 🚀')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
