const MAX_ACTIVITY_LOGS = 100

const activityLogs = []

const formatTimeLabel = (date = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)

const addActivityLog = (entry = {}) => {
  const createdAt = entry.created_at ? new Date(entry.created_at) : new Date()

  const item = {
    id: `${createdAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    category: entry.category || 'SYSTEM',
    message: entry.message || 'Activity recorded.',
    created_at: createdAt.toISOString(),
    time_label: formatTimeLabel(createdAt)
  }

  activityLogs.unshift(item)

  if (activityLogs.length > MAX_ACTIVITY_LOGS) {
    activityLogs.length = MAX_ACTIVITY_LOGS
  }

  return item
}

const getActivityLogs = (limit = 20) =>
  activityLogs.slice(0, Math.max(1, Math.min(Number(limit) || 20, MAX_ACTIVITY_LOGS)))

module.exports = {
  addActivityLog,
  getActivityLogs
}
