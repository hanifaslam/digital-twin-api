const cron = require('node-cron')
const prisma = require('../../config/prisma')
const { getIO } = require('../../config/socket')
const { getJakartaScheduleContext } = require('../../utils/date')
const { addActivityLog } = require('../activity-log')
const { emitActivityLogUpdate } = require('../../config/socket')
const { getEffectiveSchedulesForDate } = require('../services/schedule.service')

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
    const jakartaDayStart = getJakartaDayStart()
    const { currentDay, currentTime } = getJakartaScheduleContext()

    // Ambil semua dosen agar status dashboard selalu tersinkron,
    // tidak bergantung pada apakah dosen sudah registrasi face data.
    const allSchedules = await getEffectiveSchedulesForDate(new Date(), {}, { time_slot: true })
    
    // Group schedules by lecturer for quick access
    const schedulesByLecturerId = {}
    for (const s of allSchedules) {
      if (!schedulesByLecturerId[s.lecturer_id]) schedulesByLecturerId[s.lecturer_id] = []
      schedulesByLecturerId[s.lecturer_id].push(s)
    }

    const lecturers = await prisma.lecturer.findMany({
      include: {
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
      const lecturerSchedules = schedulesByLecturerId[lecturer.id] || []
      // 1. Hitung Status Otomatis berdasarkan jadwal aktif + attendance hari ini
      const activeSchedule = lecturerSchedules.find((s) => {
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

    const item = addActivityLog({
      category: 'PRESENCE',
      message: 'Lecturer availability status updated.'
    })
    emitActivityLogUpdate(item)
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
