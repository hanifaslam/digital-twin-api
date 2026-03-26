require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('--- Cleaning database ---')
  // Order matters for deletion due to foreign key constraints
  await prisma.sensorLog.deleteMany({})
  await prisma.deviceStatus.deleteMany({})
  await prisma.attendance.deleteMany({})
  await prisma.schedule.deleteMany({})
  await prisma.lecturer.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.room.deleteMany({})
  await prisma.building.deleteMany({})
  await prisma.studyProgram.deleteMany({})
  await prisma.rolePermission.deleteMany({})
  await prisma.permission.deleteMany({})
  await prisma.module.deleteMany({})
  await prisma.role.deleteMany({})

  console.log('--- Seeding data ---')

  // 1. Modules (5)
  const modulesData = [
    { name: 'Dashboard', code: 'dashboard', sequence: 1 },
    { name: 'User Management', code: 'user_management', sequence: 2 },
    { name: 'Master Data', code: 'master', sequence: 3 }
  ]
  const modules = {}
  for (const m of modulesData) {
    modules[m.code] = await prisma.module.create({ data: m })
  }

  // 2. Permissions (Linked to Modules)
  const permissionsData = [
    { name: 'DASHBOARD', module_code: 'dashboard' },
    { name: 'USER', module_code: 'user_management' },
    { name: 'ROLE', module_code: 'user_management' },
    { name: 'BUILDING', module_code: 'master' },
    { name: 'ROOM', module_code: 'master' },
    { name: 'STUDY_PROGRAM', module_code: 'master' },
    { name: 'LECTURER', module_code: 'master' }
  ]
  const perms = {}
  for (const p of permissionsData) {
    perms[p.name] = await prisma.permission.create({
      data: { name: p.name, module_id: modules[p.module_code].id }
    })
  }

  // 3. Roles (3)
  const rolesData = [
    { name: 'Super Admin', code: 'SA' },
    { name: 'Dosen', code: 'DSN' },
    { name: 'Staff', code: 'STF' }
  ]
  const allPerms = await prisma.permission.findMany()
  const roles = {}

  for (const r of rolesData) {
    roles[r.code] = await prisma.role.create({
      data: { name: r.name, code: r.code, status: true }
    })

    // Assign Permissions
    let rolePerms = []
    if (r.code === 'SA') {
      rolePerms = allPerms
    } else {
      rolePerms = allPerms.filter((p) => p.name === 'DASHBOARD')
    }

    for (const p of rolePerms) {
      await prisma.rolePermission.create({
        data: { role_id: roles[r.code].id, permission_id: p.id }
      })
    }
  }

  const hashedPassword = await bcrypt.hash('Password123!', 10)

  // 4. Buildings (5)
  const buildingsData = [
    { name: 'Gedung Sekolah A', code: 'SA' },
    { name: 'Gedung Sekolah B', code: 'SB' },
    { name: 'Gedung Sekolah C', code: 'SC' },
    { name: 'Gedung Kuliah Terpadu', code: 'GKT' },
    { name: 'Gedung Kerja Sama', code: 'GKS' }
  ]
  const buildings = []
  for (const b of buildingsData) {
    buildings.push(await prisma.building.create({ data: b }))
  }

  // 5. Study Programs (5)
  const spData = [
    { name: 'Teknik Informatika', code: 'IK' },
    { name: 'Teknologi Rekayasa Komputer', code: 'TRK' },
    { name: 'Cyber Security', code: 'CS' },
    { name: 'Multimedia', code: 'MM' },
    { name: 'Sistem Informasi', code: 'SI' }
  ]
  const studyPrograms = []
  for (const s of spData) {
    studyPrograms.push(await prisma.studyProgram.create({ data: s }))
  }

  // 6. Rooms (5)
  const rooms = []
  for (let i = 0; i < 5; i++) {
    rooms.push(
      await prisma.room.create({
        data: {
          name: `Room 1.${i + 1}`,
          building_id: buildings[i].id,
          floor: 1
        }
      })
    )
  }

  // 7. Users & Lecturers (5)
  // Super Admin
  await prisma.user.create({
    data: {
      name: 'Super Admin',
      username: 'superadmin',
      email: 'admin@twin.com',
      password: hashedPassword,
      role_id: roles['SA'].id
    }
  })

  // Lecturers
  const lecturerData = [
    { name: 'Budi Rahardjo, Ph.D.', email: 'budi.rahardjo@polines.ac.id' },
    {
      name: 'Dr. Eng. Ir. Rinaldi Munir',
      email: 'rinaldi.munir@polines.ac.id'
    },
    {
      name: 'Prof. Suhono Harso Supangkat',
      email: 'suhono.harso@polines.ac.id'
    },
    {
      name: 'Dr. techn. Wikan Danar Sunindyo',
      email: 'wikan.danar@polines.ac.id'
    },
    { name: 'Ir. Windy Gambetta, MBA.', email: 'windy.gambetta@polines.ac.id' }
  ]
  const lecturers = []
  for (let i = 0; i < 5; i++) {
    const user = await prisma.user.create({
      data: {
        name: lecturerData[i].name,
        username: lecturerData[i].email.split('@')[0],
        email: lecturerData[i].email,
        password: hashedPassword,
        role_id: roles['DSN'].id
      }
    })

    lecturers.push(
      await prisma.lecturer.create({
        data: {
          nip: `NIP100${i + 1}`,
          user_id: user.id,
          study_program_id: studyPrograms[i % studyPrograms.length].id
        }
      })
    )
  }

  // 8. Schedules (5)
  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']
  for (let i = 0; i < 5; i++) {
    await prisma.schedule.create({
      data: {
        lecturer_id: lecturers[i].id,
        room_id: rooms[i].id,
        day: days[i],
        start_time: '08:00',
        end_time: '10:00'
      }
    })
  }

  // 9. Device Status (5)
  // for (let i = 0; i < 5; i++) {
  //   await prisma.deviceStatus.create({
  //     data: { room_id: rooms[i].id, light: true, ac: false }
  //   })
  // }

  // 10. Sensor Logs (5)
  // for (let i = 0; i < 5; i++) {
  //   await prisma.sensorLog.create({
  //     data: {
  //       room_id: rooms[i].id,
  //       voltage: 220,
  //       current: 1.5,
  //       power: 330,
  //       energy: 10.5,
  //       frequency: 50,
  //       power_factor: 0.9
  //     }
  //   })
  // }

  // 11. Attendances (5)
  // for (let i = 0; i < 5; i++) {
  //   await prisma.attendance.create({
  //     data: {
  //       lecturer_id: lecturers[i].id,
  //       room_id: rooms[i].id,
  //       status: 'HADIR',
  //       check_in_at: new Date()
  //     }
  //   })
  // }

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
