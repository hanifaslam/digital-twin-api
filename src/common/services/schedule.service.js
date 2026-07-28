const { Day } = require('@prisma/client')
const prisma = require('../../config/prisma')
const { getJakartaDateParts } = require('../../utils/date')

/**
 * Mendapatkan jadwal efektif untuk suatu tanggal, termasuk jadwal pengganti (reschedule)
 * dan membuang jadwal asli yang dibatalkan (cancelled/rescheduled) pada minggu tersebut.
 * 
 * @param {Date} targetDate Tanggal target
 * @param {Object} baseWhere Filter Prisma tambahan untuk tabel Schedule
 * @param {Object} include Relasi Prisma tambahan untuk di-include
 * @returns {Array} Array of effective schedules
 */
const getEffectiveSchedulesForDate = async (targetDate, baseWhere = {}, include = {}) => {
  const parts = getJakartaDateParts(targetDate)
  const startOfDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0))
  
  const jsDate = new Date(targetDate)
  const targetDayOfWeek = jsDate.getDay() || 7
  
  const startOfWeekJs = new Date(jsDate)
  startOfWeekJs.setDate(jsDate.getDate() - targetDayOfWeek + 1)
  const startOfWeekParts = getJakartaDateParts(startOfWeekJs)
  const startOfWeek = new Date(Date.UTC(startOfWeekParts.year, startOfWeekParts.month - 1, startOfWeekParts.day, 0, 0, 0))

  const endOfWeekJs = new Date(startOfWeekJs)
  endOfWeekJs.setDate(startOfWeekJs.getDate() + 6)
  const endOfWeekParts = getJakartaDateParts(endOfWeekJs)
  const endOfWeek = new Date(Date.UTC(endOfWeekParts.year, endOfWeekParts.month - 1, endOfWeekParts.day, 23, 59, 59, 999))

  const dayMap = { Sunday: null, Monday: Day.MONDAY, Tuesday: Day.TUESDAY, Wednesday: Day.WEDNESDAY, Thursday: Day.THURSDAY, Friday: Day.FRIDAY, Saturday: null }
  const currentDay = dayMap[parts.weekday]

  if (!currentDay) return []

  const schedules = await prisma.schedule.findMany({
    where: {
      ...baseWhere,
      status: true,
      OR: [
        { 
          day: currentDay, 
          overrides: { none: { override_date: { gte: startOfWeek, lte: endOfWeek } } } 
        },
        { overrides: { some: { override_date: startOfDay, is_cancelled: false } } }
      ]
    },
    include: {
      ...include,
      overrides: {
        where: { override_date: startOfDay, is_cancelled: false },
        include: { new_room: { include: { building: true } }, new_time_slot: true }
      }
    }
  })

  return schedules.map(sched => {
    if (sched.overrides && sched.overrides.length > 0) {
      const override = sched.overrides[0]
      return {
        ...sched,
        room_id: override.new_room_id || sched.room_id,
        room: override.new_room || sched.room,
        time_slot_id: override.new_time_slot_id || sched.time_slot_id,
        time_slot: override.new_time_slot || sched.time_slot,
        day: currentDay, // Update day to reflect the override date's day
        is_override: true
      }
    }
    return sched
  })
}

module.exports = {
  getEffectiveSchedulesForDate
}
