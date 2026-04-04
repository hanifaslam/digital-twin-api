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
  await prisma.device.deleteMany({})
  await prisma.attendance.deleteMany({})
  await prisma.schedule.deleteMany({})
  await prisma.helperBuilding.deleteMany({})
  await prisma.lecturerStudyProgram.deleteMany({})
  await prisma.helper.deleteMany({})
  await prisma.lecturer.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.room.deleteMany({})
  await prisma.course.deleteMany({})
  await prisma.class.deleteMany({})
  await prisma.studyProgram.deleteMany({})
  await prisma.timeSlot.deleteMany({})
  await prisma.floor.deleteMany({})
  await prisma.building.deleteMany({})
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
    { name: 'LECTURER', module_code: 'master' },
    { name: 'HELPER', module_code: 'master' },
    { name: 'DEVICE', module_code: 'master' }
  ]
  const perms = {}
  for (const p of permissionsData) {
    perms[p.name] = await prisma.permission.create({
      data: { name: p.name, module_id: modules[p.module_code].id }
    })
  }

  // 3. Roles
  const rolesData = [
    { name: 'Super Admin', code: 'SA' },
    { name: 'Dosen', code: 'DSN' },
    { name: 'Staff', code: 'STF' },
    { name: 'Helper', code: 'HLP' }
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
    } else if (r.code === 'HLP') {
      rolePerms = allPerms.filter((p) =>
        ['DASHBOARD', 'HELPER'].includes(p.name)
      )
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

  // 6. Master Floors (5)
  const floorsData = [
    { name: 'Lantai 1' },
    { name: 'Lantai 2' },
    { name: 'Lantai 3' },
    { name: 'Lantai 4' },
    { name: 'Lantai 5' }
  ]
  const floors = []
  for (const floor of floorsData) {
    floors.push(await prisma.floor.create({ data: floor }))
  }

  // 7. Master Time Slots
  const timeSlotsData = [
    { name: 'Jam ke 2', start_time: '07:45', end_time: '08:30' },
    { name: 'Jam ke 3', start_time: '08:30', end_time: '09:15' },
    { name: 'Jam ke 9', start_time: '14:00', end_time: '14:45' },
    { name: 'Jam ke 10', start_time: '14:45', end_time: '15:30' },
    { name: 'Jam ke 10B', start_time: '15:30', end_time: '16:00' },
    { name: 'Jam ke 11', start_time: '16:00', end_time: '16:45' },
    { name: 'Jam ke 12', start_time: '16:45', end_time: '17:30' },
    { name: 'Jam ke 13', start_time: '17:30', end_time: '18:15' }
  ]
  const timeSlots = []
  for (const timeSlot of timeSlotsData) {
    timeSlots.push(await prisma.timeSlot.create({ data: timeSlot }))
  }

  // 8. Master Classes
  const masterClassesData = [
    { name: 'Kelas A', study_program_id: studyPrograms[0].id },
    { name: 'Kelas B', study_program_id: studyPrograms[1].id },
    { name: 'Kelas C', study_program_id: studyPrograms[2].id }
  ]
  const masterClasses = []
  for (const masterClass of masterClassesData) {
    masterClasses.push(await prisma.class.create({ data: masterClass }))
  }

  // 9. Rooms (5)
  const rooms = []
  for (let i = 0; i < 5; i++) {
    rooms.push(
      await prisma.room.create({
        data: {
          name: `Room 1.${i + 1}`,
          building_id: buildings[i].id,
          floor_id: floors[i].id
        }
      })
    )
  }

  // 10. Courses
  const coursesData = [
    {
      code: 'IF101',
      name: 'Algoritma dan Pemrograman',
      semester: 'SEMESTER_1',
      study_program_id: studyPrograms[0].id
    },
    {
      code: 'TRK201',
      name: 'Sistem Embedded',
      semester: 'SEMESTER_3',
      study_program_id: studyPrograms[1].id
    },
    {
      code: 'CS301',
      name: 'Keamanan Jaringan',
      semester: 'SEMESTER_5',
      study_program_id: studyPrograms[2].id
    }
  ]
  const courses = []
  for (const course of coursesData) {
    courses.push(await prisma.course.create({ data: course }))
  }

  // 11. Users & Lecturers (5)
  // Super Admin
  await prisma.user.create({
    data: {
      name: 'Super Admin',
      username: 'Superadmin',
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
          study_programs: {
            create: [
              {
                study_program_id: studyPrograms[i % studyPrograms.length].id
              }
            ]
          }
        }
      })
    )
  }

  // 12. Schedules
  for (let i = 0; i < 3; i++) {
    await prisma.schedule.create({
      data: {
        study_program_id: studyPrograms[i].id,
        class_id: masterClasses[i].id,
        room_id: rooms[i].id,
        lecturer_id: lecturers[i].id,
        course_id: courses[i].id,
        time_slot_id: timeSlots[i].id,
        status: true
      }
    })
  }

  // 13. Device Status (5)
  // for (let i = 0; i < 5; i++) {
  //   await prisma.deviceStatus.create({
  //     data: { room_id: rooms[i].id, light: true, ac: false }
  //   })
  // }

  // 14. Sensor Logs (5)
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

  // 15. Attendances (5)
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
