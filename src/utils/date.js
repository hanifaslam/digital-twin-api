const getJakartaTime = (date) => {
  const d = date ? new Date(date) : new Date()
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(d)

  return {
    hours: parseInt(parts.find((p) => p.type === 'hour').value),
    minutes: parseInt(parts.find((p) => p.type === 'minute').value)
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
  getJakartaTime
}
