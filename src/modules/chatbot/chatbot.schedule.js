const { getJakartaScheduleContext } = require('../../utils/date')

const DAY_NAME_MAP = {
  senin: 'MONDAY',
  monday: 'MONDAY',
  selasa: 'TUESDAY',
  tuesday: 'TUESDAY',
  rabu: 'WEDNESDAY',
  wednesday: 'WEDNESDAY',
  kamis: 'THURSDAY',
  thursday: 'THURSDAY',
  jumat: 'FRIDAY',
  "jum'at": 'FRIDAY',
  friday: 'FRIDAY'
}

const DAY_LABEL_MAP = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat'
}

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const shiftJakartaDate = (date, dayOffset = 0) => {
  const shifted = new Date(date)
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset)
  return shifted
}

const resolveScheduleDay = (dateInput) => {
  const normalizedDateInput = normalizeText(dateInput)
  const now = new Date()
  const currentContext = getJakartaScheduleContext(now)

  if (
    !normalizedDateInput ||
    ['today', 'hari ini', 'now', 'sekarang'].includes(normalizedDateInput)
  ) {
    return {
      requested_label: dateInput || 'hari ini',
      target_day: currentContext.currentDay,
      target_label: currentContext.currentDay
        ? DAY_LABEL_MAP[currentContext.currentDay]
        : 'Hari ini',
      is_today: true,
      current_time: currentContext.currentTime
    }
  }

  if (['besok', 'tomorrow'].includes(normalizedDateInput)) {
    const tomorrowContext = getJakartaScheduleContext(shiftJakartaDate(now, 1))
    return {
      requested_label: dateInput,
      target_day: tomorrowContext.currentDay,
      target_label: tomorrowContext.currentDay
        ? DAY_LABEL_MAP[tomorrowContext.currentDay]
        : 'Besok',
      is_today: false,
      current_time: null
    }
  }

  const explicitDay = DAY_NAME_MAP[normalizedDateInput]
  if (explicitDay) {
    return {
      requested_label: dateInput,
      target_day: explicitDay,
      target_label: DAY_LABEL_MAP[explicitDay],
      is_today: explicitDay === currentContext.currentDay,
      current_time:
        explicitDay === currentContext.currentDay
          ? currentContext.currentTime
          : null
    }
  }

  return null
}

module.exports = {
  resolveScheduleDay
}
