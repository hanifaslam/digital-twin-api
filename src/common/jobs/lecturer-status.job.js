const cron = require('node-cron')
const { Day } = require('@prisma/client')
const prisma = require('../../config/prisma')
const { getIO } = require('../../config/socket')
const { getJakartaTime } = require('../../utils/date')

const getJakartaDayStart = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())

  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value

  return new Date(`${year}-${month}-${day}T00:00:00+07:00`)
}

const syncLecturerAvailability = async () => {
  console.log('[Cron] Checking lecturer status & schedule transitions...')
  try {
    const now = new Date()
    const jakartaDayStart = getJakartaDayStart()
    const daysMap = {
      1: Day.MONDAY,
      2: Day.TUESDAY,
      3: Day.WEDNESDAY,
      4: Day.THURSDAY,
      5: Day.FRIDAY
    }
    const currentDay = daysMap[now.getDay()]
    const { hours, minutes } = getJakartaTime(now)
    const currentTime =
      hours.toString().padStart(2, '0') +
      ':' +
      minutes.toString().padStart(2, '0')

    // Ambil semua dosen agar status dashboard selalu tersinkron,
    // tidak bergantung pada apakah dosen sudah registrasi face data.
    const lecturers = await prisma.lecturer.findMany({
      include: {
        schedules: {
          where: {
            day: currentDay || undefined, // Jika weekend (null), jangan filter berdasarkan hari ini (atau skip)
            status: true
          },
          include: { time_slot: true }
        },
        attendances: {
          where: {
            check_in_at: {
              gte: jakartaDayStart
            }
          },
          take: 1
        }
      }
    })

    for (const lecturer of lecturers) {
      // 1. Hitung Status Otomatis berdasarkan jadwal aktif + attendance hari ini
      const activeSchedule = lecturer.schedules.find((s) => {
        const { start_time, end_time } = s.time_slot
        return currentTime >= start_time && currentTime <= end_time
      })
      const hasAttendanceToday = lecturer.attendances.length > 0

      let expectedAutoStatus = 'OFFLINE'
      if (hasAttendanceToday) {
        expectedAutoStatus = activeSchedule ? 'BUSY' : 'AVAILABLE'
      }

      // 2. DETEKSI TRANSISI (Logika Inti Opsi 3)
      // Jika status otomatis sekarang berbeda dengan "Ingatan" sistem sebelumnya,
      // Berarti terjadi perpindahan jadwal (Misal: Kelas selesai, atau Kelas baru mulai).
      const isTransition =
        lecturer.last_auto_status &&
        lecturer.last_auto_status !== expectedAutoStatus

      let finalStatus = lecturer.status
      let finalIsManual = lecturer.is_manual

      if (isTransition) {
        // Jika ada transisi, RESET mode manual dan ikuti sistem otomatis
        finalStatus = expectedAutoStatus
        finalIsManual = false
        console.log(
          `[Cron] Transition detected for ${lecturer.id}. Resetting manual mode to AUTO.`
        )
      } else {
        // Jika TIDAK ada transisi:
        if (!lecturer.is_manual) {
          // Kalau mode AUTO, update status sesuai jadwal
          finalStatus = expectedAutoStatus
        }
        // Kalau mode MANUAL, biarkan status apa adanya (nggak disentuh)
      }

      // 3. Update Database (Hanya jika ada perubahan)
      if (
        lecturer.status !== finalStatus ||
        lecturer.is_manual !== finalIsManual ||
        lecturer.last_auto_status !== expectedAutoStatus
      ) {
        await prisma.lecturer.update({
          where: { id: lecturer.id },
          data: {
            status: finalStatus,
            is_manual: finalIsManual,
            overridden_at: finalIsManual ? lecturer.overridden_at : null,
            last_auto_status: expectedAutoStatus
          }
        })

        // Emit socket event for real-time update
        try {
          getIO().emit('lecturer-status-updated', {
            id: lecturer.id,
            status: finalStatus,
            is_manual: finalIsManual
          })
        } catch (e) {
          // Socket might not be initialized yet if cron runs during startup
          console.error('Socket Emit Error (Cron):', e.message)
        }
      }
    }
  } catch (error) {
    console.error('[Cron Error] Sync Lecturer Status:', error)
  }
}

// Jalankan setiap 1 menit
const startLecturerStatusJob = () => {
  // Pattern: minute hour day-of-month month day-of-week
  // * means every minute
  cron.schedule('* * * * *', syncLecturerAvailability)

  // Jalankan sekali saat startup untuk inisialisasi awal
  syncLecturerAvailability()
}

module.exports = startLecturerStatusJob
