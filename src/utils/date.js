const { Day } = require('@prisma/client')

const getJakartaDateParts = (date) => {
  const d = date ? new Date(date) : new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d)

  const get = (type) => parts.find((p) => p.type === type)?.value

  return {
    weekday: get('weekday'),
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hours: Number(get('hour')),
    minutes: Number(get('minute')),
    seconds: Number(get('second'))
  }
}

const getJakartaTime = (date) => {
  const { hours, minutes } = getJakartaDateParts(date)

  return {
    hours,
    minutes
  }
}

const getJakartaScheduleContext = (date) => {
  const parts = getJakartaDateParts(date)
  const dayMap = {
    Monday: Day.MONDAY,
    Tuesday: Day.TUESDAY,
    Wednesday: Day.WEDNESDAY,
    Thursday: Day.THURSDAY,
    Friday: Day.FRIDAY
  }

  return {
    ...parts,
    currentDay: dayMap[parts.weekday] || null,
    currentTime: `${parts.hours.toString().padStart(2, '0')}:${parts.minutes
      .toString()
      .padStart(2, '0')}`,
    isWeekend: !dayMap[parts.weekday]
  }
}

const toUtcFromJakarta = (year, month, day, hour = 0, minute = 0, second = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second))

const getJakartaDayRange = (date = new Date()) => {
  const { year, month, day } = getJakartaDateParts(date)

  return {
    start: toUtcFromJakarta(year, month, day, 0, 0, 0),
    end: toUtcFromJakarta(year, month, day, 23, 59, 59)
  }
}

/**
 * Format a Date object or string to HH:mm string (Asia/Jakarta)
 * @param {Date|string} date - Date object or date string
 * @returns {string|null} - Formatted time (HH:mm) or null if invalid
 */
const formatTime = (date) => {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null

  const { hours, minutes } = getJakartaTime(d)
  return (
    hours.toString().padStart(2, '0') +
    ':' +
    minutes.toString().padStart(2, '0')
  )
}

module.exports = {
  formatTime,
  getJakartaDayRange,
  getJakartaDateParts,
  getJakartaScheduleContext,
  getJakartaTime
}
