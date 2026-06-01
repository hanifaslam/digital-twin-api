const { Day } = require('@prisma/client')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { getActivityLogs } = require('../../common/activity-log')

const DAY_ORDER = [
  Day.MONDAY,
  Day.TUESDAY,
  Day.WEDNESDAY,
  Day.THURSDAY,
  Day.FRIDAY
]

const DAY_LABELS = {
  [Day.MONDAY]: 'Mon',
  [Day.TUESDAY]: 'Tue',
  [Day.WEDNESDAY]: 'Wed',
  [Day.THURSDAY]: 'Thu',
  [Day.FRIDAY]: 'Fri'
}

const getJakartaParts = (date = new Date()) => {
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
  }).formatToParts(date)

  const get = (type) => parts.find((p) => p.type === type)?.value

  return {
    weekday: get('weekday'),
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second'))
  }
}

const toUtcFromJakarta = (year, month, day, hour = 0, minute = 0, second = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second))

const getCurrentContext = () => {
  const parts = getJakartaParts()
  const dayMap = {
    Monday: Day.MONDAY,
    Tuesday: Day.TUESDAY,
    Wednesday: Day.WEDNESDAY,
    Thursday: Day.THURSDAY,
    Friday: Day.FRIDAY
  }
  const currentDay = dayMap[parts.weekday] || null
  const currentTime = `${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`

  return { parts, currentDay, currentTime }
}

const getJakartaDayRange = (year, month, day) => {
  const start = toUtcFromJakarta(year, month, day, 0, 0, 0)
  const end = toUtcFromJakarta(year, month, day, 23, 59, 59)
  return { start, end }
}

const getJakartaMonthRange = (year, month) => {
  const start = toUtcFromJakarta(year, month, 1, 0, 0, 0)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextMonthYear = month === 12 ? year + 1 : year
  const nextMonthStart = toUtcFromJakarta(nextMonthYear, nextMonth, 1, 0, 0, 0)
  const end = new Date(nextMonthStart.getTime() - 1000)
  return { start, end }
}

const DAY_TO_WEEKDAY = {
  [Day.MONDAY]: 1,
  [Day.TUESDAY]: 2,
  [Day.WEDNESDAY]: 3,
  [Day.THURSDAY]: 4,
  [Day.FRIDAY]: 5
}

const getMinutesFromTime = (time = '00:00') => {
  const [hour, minute] = time.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

const getScheduleDurationHours = (schedule) => {
  const start = getMinutesFromTime(schedule.time_slot?.start_time)
  const end = getMinutesFromTime(schedule.time_slot?.end_time)
  return Math.max(end - start, 0) / 60
}

const enumerateScheduleOccurrences = (schedule, startDate, endDate) => {
  const targetWeekday = DAY_TO_WEEKDAY[schedule.day]
  if (!targetWeekday) return []

  const occurrences = []
  const cursor = new Date(startDate)

  while (cursor <= endDate) {
    const cursorParts = getJakartaParts(cursor)
    const cursorStart = toUtcFromJakarta(
      cursorParts.year,
      cursorParts.month,
      cursorParts.day,
      0,
      0,
      0
    )

    if (cursorStart < startDate) {
      cursor.setUTCDate(cursor.getUTCDate() + 1)
      continue
    }

    const weekday = new Date(cursorStart).getUTCDay()
    if (weekday === targetWeekday) {
      const [startHour, startMinute] = (schedule.time_slot?.start_time || '00:00')
        .split(':')
        .map(Number)
      const [endHour, endMinute] = (schedule.time_slot?.end_time || '00:00')
        .split(':')
        .map(Number)

      const startAt = toUtcFromJakarta(
        cursorParts.year,
        cursorParts.month,
        cursorParts.day,
        startHour,
        startMinute,
        0
      )
      const endAt = toUtcFromJakarta(
        cursorParts.year,
        cursorParts.month,
        cursorParts.day,
        endHour,
        endMinute,
        0
      )

      occurrences.push({
        schedule_id: schedule.id,
        room_id: schedule.room_id,
        start_at: startAt,
        end_at: endAt,
        duration_hours: getScheduleDurationHours(schedule)
      })
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return occurrences
}

const findAttendanceOccurrenceIndex = (occurrences, attendance, usedIndexes) => {
  const attendanceParts = getJakartaParts(attendance.check_in_at)
  const attendanceDateKey = `${attendanceParts.year}-${attendanceParts.month}-${attendanceParts.day}`

  const buildDateKey = (date) => {
    const parts = getJakartaParts(date)
    return `${parts.year}-${parts.month}-${parts.day}`
  }

  const candidates = occurrences
    .map((occurrence, index) => ({ occurrence, index }))
    .filter(({ occurrence, index }) => {
      if (usedIndexes.has(index)) return false
      if (buildDateKey(occurrence.start_at) !== attendanceDateKey) return false
      if (attendance.room_id && occurrence.room_id !== attendance.room_id) return false
      return attendance.check_in_at <= occurrence.end_at
    })
    .sort((a, b) => a.occurrence.start_at - b.occurrence.start_at)

  if (candidates.length) {
    return candidates[0].index
  }

  if (!attendance.room_id) {
    const fallback = occurrences
      .map((occurrence, index) => ({ occurrence, index }))
      .filter(({ occurrence, index }) => {
        if (usedIndexes.has(index)) return false
        if (buildDateKey(occurrence.start_at) !== attendanceDateKey) return false
        return attendance.check_in_at <= occurrence.end_at
      })
      .sort((a, b) => a.occurrence.start_at - b.occurrence.start_at)

    return fallback[0]?.index ?? -1
  }

  return -1
}

const formatSyncLabel = (date) => {
  if (!date) return 'No Data'

  const diffMs = Date.now() - new Date(date).getTime()
  const diffSeconds = Math.max(Math.floor(diffMs / 1000), 0)

  if (diffSeconds <= 30) return 'Live'

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(date))
}

const formatLatencyLabel = (latencyMs) => {
  if (latencyMs === null || latencyMs === undefined) return '--'
  return `${latencyMs} ms`
}

const roundNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 0
  }

  return Number(Number(value).toFixed(digits))
}

const getMondayOfCurrentWeek = (currentDate) => {
  const monday = new Date(currentDate)
  const weekday = monday.getUTCDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  monday.setUTCDate(monday.getUTCDate() + offset)
  return monday
}

const getRoleIdentity = (role = {}) =>
  (role.code || role.name || '')
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

const getScopedBuildingIds = async (user = {}) => {
  const roleIdentity = getRoleIdentity(user.role)

  if (roleIdentity === 'SA' || roleIdentity === 'SUPER_ADMIN') {
    return null
  }

  if (!user.helper?.id) {
    return []
  }

  const helperBuildings = await prisma.helperBuilding.findMany({
    where: { helper_id: user.helper.id },
    select: { building_id: true }
  })

  return helperBuildings.map((item) => item.building_id)
}

const buildScopedWhere = (buildingIds, extraWhere = {}) => ({
  ...extraWhere,
  ...(Array.isArray(buildingIds)
    ? {
        room: {
          building_id: {
            in: buildingIds.length ? buildingIds : ['']
          }
        }
      }
    : {})
})

const resolveSelectedBuilding = async (user, requestedBuildingId) => {
  const scopedBuildingIds = await getScopedBuildingIds(user)

  const buildingWhere = Array.isArray(scopedBuildingIds)
    ? { id: { in: scopedBuildingIds.length ? scopedBuildingIds : [''] } }
    : { status: true }

  const buildings = await prisma.building.findMany({
    where: buildingWhere,
    select: {
      id: true,
      name: true
    },
    orderBy: { name: 'asc' }
  })

  const selectedBuilding =
    requestedBuildingId &&
    buildings.some((item) => item.id === requestedBuildingId)
      ? buildings.find((item) => item.id === requestedBuildingId)
      : buildings[0] || null

  return {
    scopedBuildingIds,
    buildings,
    selectedBuilding
  }
}

const buildDeviceLiveSummary = async (buildingIds = null) => {
  const [activeDevices, lastSeenDevice, latencyAggregate] = await Promise.all([
    prisma.device.count({
      where: buildScopedWhere(buildingIds, {
        status: true,
        is_online: true
      })
    }),
    prisma.device.findFirst({
      where: buildScopedWhere(buildingIds, {
        status: true,
        last_seen_at: { not: null }
      }),
      orderBy: { last_seen_at: 'desc' },
      select: { id: true, name: true, last_seen_at: true }
    }),
    prisma.device.aggregate({
      where: buildScopedWhere(buildingIds, {
        status: true,
        is_online: true,
        last_latency_ms: { not: null }
      }),
      _avg: {
        last_latency_ms: true
      }
    })
  ])

  const latencyMs =
    latencyAggregate._avg.last_latency_ms === null
      ? null
      : Math.round(latencyAggregate._avg.last_latency_ms)

  return {
    active_devices: activeDevices,
    latency_ms: latencyMs,
    latency: formatLatencyLabel(latencyMs),
    last_sync: formatSyncLabel(lastSeenDevice?.last_seen_at)
  }
}

const buildEnergyMonitoringSummary = async (buildingId) => {
  if (!buildingId) {
    return {
      building_id: null,
      building_name: null,
      has_live_data: false,
      current_active_demand_watts: 0,
      current_active_demand_label: '0 W',
      change_percent_vs_average: 0,
      trend_window_seconds: 40,
      trend: [],
      last_updated_at: null
    }
  }

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: {
      id: true,
      name: true,
      status: true
    }
  })

  if (!building || !building.status) {
    return {
      building_id: buildingId,
      building_name: null,
      has_live_data: false,
      current_active_demand_watts: 0,
      current_active_demand_label: '0 W',
      change_percent_vs_average: 0,
      trend_window_seconds: 40,
      trend: [],
      last_updated_at: null
    }
  }

  const now = Date.now()
  const windowSeconds = 40
  const bucketSeconds = 5
  const bucketCount = windowSeconds / bucketSeconds
  const windowStart = new Date(now - windowSeconds * 1000)

  const rooms = await prisma.room.findMany({
    where: {
      building_id: building.id,
      status: true
    },
    select: {
      id: true
    }
  })

  if (rooms.length === 0) {
    return {
      building_id: building.id,
      building_name: building.name,
      has_live_data: false,
      current_active_demand_watts: 0,
      current_active_demand_label: '0 W',
      change_percent_vs_average: 0,
      trend_window_seconds: windowSeconds,
      trend: [],
      last_updated_at: null
    }
  }

  const roomIds = rooms.map((room) => room.id)
  const powerDevices = await prisma.device.findMany({
    where: {
      room_id: { in: roomIds },
      status: true
    },
    select: {
      id: true
    }
  })

  const [recentLogs, latestLogsPerDevice] = await Promise.all([
    prisma.sensorLog.findMany({
      where: {
        room_id: { in: roomIds },
        created_at: {
          gte: windowStart
        },
        power: { not: null }
      },
      select: {
        room_id: true,
        power: true,
        created_at: true
      },
      orderBy: { created_at: 'asc' }
    }),
    Promise.all(
      powerDevices.map((device) =>
        prisma.sensorLog.findFirst({
          where: {
            device_id: device.id,
            power: { not: null }
          },
          select: {
            device_id: true,
            room_id: true,
            power: true,
            created_at: true
          },
          orderBy: { created_at: 'desc' }
        })
      )
    )
  ])

  const bucketMap = new Map()

  for (let i = 0; i < bucketCount; i += 1) {
    const bucketTime = now - (bucketCount - 1 - i) * bucketSeconds * 1000
    const bucketKey = Math.floor(bucketTime / (bucketSeconds * 1000))
    bucketMap.set(bucketKey, {
      ts: new Date(bucketKey * bucketSeconds * 1000),
      total_power: 0
    })
  }

  recentLogs.forEach((log) => {
    const bucketKey = Math.floor(
      new Date(log.created_at).getTime() / (bucketSeconds * 1000)
    )

    if (bucketMap.has(bucketKey)) {
      const current = bucketMap.get(bucketKey)
      current.total_power += Number(log.power || 0)
    }
  })

  const trend = [...bucketMap.values()].map((item) => ({
    timestamp: item.ts.toISOString(),
    total_power: roundNumber(item.total_power, 1)
  }))

  const currentActiveDemandWatts = roundNumber(
    latestLogsPerDevice.reduce((sum, log) => sum + Number(log?.power || 0), 0),
    1
  )

  const trendAverage =
    trend.length > 0
      ? trend.reduce((sum, item) => sum + item.total_power, 0) / trend.length
      : 0

  const changePercentVsAverage =
    trendAverage === 0
      ? 0
      : roundNumber(
          ((currentActiveDemandWatts - trendAverage) / trendAverage) * 100,
          1
        )

  const latestLog = latestLogsPerDevice
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

  return {
    building_id: building.id,
    building_name: building.name,
    has_live_data: Boolean(latestLog),
    current_active_demand_watts: currentActiveDemandWatts,
    current_active_demand_label: `${roundNumber(currentActiveDemandWatts, 0)} W`,
    change_percent_vs_average: changePercentVsAverage,
    trend_window_seconds: windowSeconds,
    trend,
    last_updated_at: latestLog?.created_at?.toISOString?.() || null
  }
}

const dashboardController = {
  getDeviceLiveSummary: async (req, res) => {
    try {
      const buildingIds = await getScopedBuildingIds(req.user)
      const summary = await buildDeviceLiveSummary(buildingIds)
      return success(res, 'success', summary)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getLiveActivityLog: async (req, res) => {
    try {
      const limit = req.query?.limit || 20
      return success(res, 'success', getActivityLogs(limit))
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getEnergyMonitoringSummary: async (req, res) => {
    try {
      const requestedBuildingId = (req.query?.building_id || '').trim()
      const { selectedBuilding } = await resolveSelectedBuilding(
        req.user,
        requestedBuildingId
      )
      const summary = await buildEnergyMonitoringSummary(
        selectedBuilding?.id || null
      )
      return success(res, 'success', summary)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getSummaryCards: async (req, res) => {
    try {
      const { parts, currentDay, currentTime } = getCurrentContext()
      const buildingIds = await getScopedBuildingIds(req.user)
      const currentMonthRange = getJakartaMonthRange(parts.year, parts.month)

      const [
        totalLecturers,
        lecturerNewThisMonth,
        activeRoomsGlobal,
        onlineDevicesGlobal,
        buildingsMonitored,
        totalDevices,
        offlineDevices,
        classesActive,
        activeRoomsScoped
      ] = await Promise.all([
        prisma.lecturer.count(),
        prisma.lecturer.count({
          where: {
            created_at: {
              gte: currentMonthRange.start,
              lte: currentMonthRange.end
            }
          }
        }),
        prisma.schedule.findMany({
          where: {
            status: true,
            day: currentDay || undefined,
            time_slot: {
              start_time: { lte: currentTime },
              end_time: { gte: currentTime }
            }
          },
          distinct: ['room_id'],
          select: { room_id: true }
        }),
        prisma.device.count({
          where: {
            status: true,
            is_online: true
          }
        }),
        Array.isArray(buildingIds)
          ? prisma.building.count({
              where: {
                id: { in: buildingIds.length ? buildingIds : [''] }
              }
            })
          : prisma.building.count({ where: { status: true } }),
        prisma.device.count({
          where: buildScopedWhere(buildingIds, { status: true })
        }),
        prisma.device.count({
          where: buildScopedWhere(buildingIds, {
            status: true,
            is_online: false
          })
        }),
        prisma.schedule.count({
          where: buildScopedWhere(buildingIds, {
            status: true,
            day: currentDay || undefined,
            time_slot: {
              start_time: { lte: currentTime },
              end_time: { gte: currentTime }
            }
          })
        }),
        prisma.schedule.findMany({
          where: buildScopedWhere(buildingIds, {
            status: true,
            day: currentDay || undefined,
            time_slot: {
              start_time: { lte: currentTime },
              end_time: { gte: currentTime }
            }
          }),
          distinct: ['room_id'],
          select: { room_id: true }
        })
      ])

      const deviceHealth =
        totalDevices === 0
          ? 100
          : Number(((onlineDevicesGlobal / totalDevices) * 100).toFixed(1))

      return success(res, 'success', {
        total_lecturers: totalLecturers,
        lecturer_new_this_month: lecturerNewThisMonth,
        active_rooms: activeRoomsGlobal.length,
        system_health_percent: deviceHealth,
        buildings_monitored: buildingsMonitored,
        total_devices: totalDevices,
        offline_devices: offlineDevices,
        classes_active: classesActive,
        active_rooms_scoped: activeRoomsScoped.length
      })
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getWeeklyAttendanceOverview: async (_req, res) => {
    try {
      const nowParts = getJakartaParts()
      const todayUtc = toUtcFromJakarta(
        nowParts.year,
        nowParts.month,
        nowParts.day,
        12,
        0,
        0
      )
      const mondayUtc = getMondayOfCurrentWeek(todayUtc)

      const weeklyData = []

      for (let i = 0; i < DAY_ORDER.length; i += 1) {
        const dayValue = DAY_ORDER[i]
        const currentDateUtc = new Date(mondayUtc)
        currentDateUtc.setUTCDate(mondayUtc.getUTCDate() + i)

        const y = currentDateUtc.getUTCFullYear()
        const m = currentDateUtc.getUTCMonth() + 1
        const d = currentDateUtc.getUTCDate()
        const { start, end } = getJakartaDayRange(y, m, d)

        const [scheduledLecturers, attendedLecturers] = await Promise.all([
          prisma.schedule.findMany({
            where: { day: dayValue, status: true },
            distinct: ['lecturer_id'],
            select: { lecturer_id: true }
          }),
          prisma.attendance.findMany({
            where: {
              check_in_at: {
                gte: start,
                lte: end
              }
            },
            distinct: ['lecturer_id'],
            select: { lecturer_id: true }
          })
        ])

        const present = attendedLecturers.length
        const expected = scheduledLecturers.length
        const absent = Math.max(expected - present, 0)

        weeklyData.push({
          day: dayValue,
          label: DAY_LABELS[dayValue],
          present,
          absent
        })
      }

      return success(res, 'success', weeklyData)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getLiveOngoingClasses: async (req, res) => {
    try {
      const { parts, currentDay, currentTime } = getCurrentContext()
      const buildingIds = await getScopedBuildingIds(req.user)
      const { start: startOfDay, end: endOfDay } = getJakartaDayRange(
        parts.year,
        parts.month,
        parts.day
      )

      if (!currentDay) {
        return success(res, 'success', [])
      }

      const schedules = await prisma.schedule.findMany({
        where: buildScopedWhere(buildingIds, {
          status: true,
          day: currentDay,
          time_slot: {
            start_time: { lte: currentTime },
            end_time: { gte: currentTime }
          }
        }),
        include: {
          course: {
            select: { name: true }
          },
          class: {
            select: { name: true }
          },
          room: {
            select: {
              id: true,
              name: true,
              building: {
                select: { name: true }
              }
            }
          },
          lecturer: {
            select: {
              id: true,
              user: {
                select: { name: true }
              }
            }
          },
          time_slot: {
            select: {
              start_time: true,
              end_time: true
            }
          }
        },
        orderBy: [{ time_slot: { start_time: 'asc' } }, { created_at: 'asc' }]
      })

      const lecturerIds = [
        ...new Set(schedules.map((item) => item.lecturer_id))
      ]
      const attendanceToday = await prisma.attendance.findMany({
        where: {
          lecturer_id: { in: lecturerIds.length ? lecturerIds : [''] },
          check_in_at: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        orderBy: { check_in_at: 'asc' }
      })

      const attendanceMap = new Map()
      attendanceToday.forEach((item) => {
        const key = `${item.lecturer_id}:${item.room_id || ''}`
        if (!attendanceMap.has(key)) {
          attendanceMap.set(key, item)
        }
      })

      const items = schedules.map((item) => {
        const key = `${item.lecturer_id}:${item.room_id || ''}`
        const attendance = attendanceMap.get(key)

        let status = 'WAITING'
        if (attendance) {
          const attendedParts = getJakartaParts(attendance.check_in_at)
          const checkInMinutes = attendedParts.hour * 60 + attendedParts.minute
          const [startHour, startMinute] = item.time_slot.start_time
            .split(':')
            .map(Number)
          const startMinutes = startHour * 60 + startMinute

          status = checkInMinutes > startMinutes ? 'LATE' : 'PRESENT'
        }

        return {
          schedule_id: item.id,
          course_name: item.course?.name || null,
          class_code: item.class?.name || null,
          lecturer_name: item.lecturer?.user?.name || null,
          room_name: item.room?.name || null,
          building_name: item.room?.building?.name || null,
          start_time: item.time_slot?.start_time || null,
          end_time: item.time_slot?.end_time || null,
          status
        }
      })

      return success(res, 'success', items)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getUpcomingClasses: async (req, res) => {
    try {
      const { currentDay, currentTime } = getCurrentContext()
      const buildingIds = await getScopedBuildingIds(req.user)

      if (!currentDay) {
        return success(res, 'success', [])
      }

      const schedules = await prisma.schedule.findMany({
        where: buildScopedWhere(buildingIds, {
          status: true,
          day: currentDay,
          time_slot: {
            start_time: { gt: currentTime }
          }
        }),
        include: {
          course: {
            select: { name: true }
          },
          class: {
            select: { name: true }
          },
          room: {
            select: { id: true, name: true }
          },
          time_slot: {
            select: {
              start_time: true,
              end_time: true
            }
          }
        },
        orderBy: [{ time_slot: { start_time: 'asc' } }, { created_at: 'asc' }]
      })

      const items = schedules.map((item) => ({
        schedule_id: item.id,
        class_name: item.course?.name || null,
        class_code: item.class?.name || null,
        room_name: item.room?.name || null,
        start_time: item.time_slot?.start_time || null,
        end_time: item.time_slot?.end_time || null
      }))

      return success(res, 'success', items)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getDeviceMonitoringStatus: async (req, res) => {
    try {
      const scopedBuildingIds = await getScopedBuildingIds(req.user)
      const requestedBuildingId = (req.query?.building_id || '').trim()

      const buildingWhere = Array.isArray(scopedBuildingIds)
        ? { id: { in: scopedBuildingIds.length ? scopedBuildingIds : [''] } }
        : { status: true }

      const buildings = await prisma.building.findMany({
        where: buildingWhere,
        select: {
          id: true,
          name: true
        },
        orderBy: { name: 'asc' }
      })

      const selectedBuildingId =
        requestedBuildingId &&
        buildings.some((b) => b.id === requestedBuildingId)
          ? requestedBuildingId
          : buildings[0]?.id || null

      if (!selectedBuildingId) {
        return success(res, 'success', {
          devices: [],
          health_summary: {
            online: 0,
            warning: 0,
            offline: 0
          }
        })
      }

      const devices = await prisma.device.findMany({
        where: {
          room: {
            building_id: selectedBuildingId
          }
        },
        select: {
          id: true,
          name: true,
          status: true,
          is_online: true,
          room: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [{ room: { name: 'asc' } }, { name: 'asc' }]
      })

      const formattedDevices = devices.map((device) => {
        let connectionStatus = 'WARNING'
        if (device.status && device.is_online) {
          connectionStatus = 'ONLINE'
        } else if (device.status && !device.is_online) {
          connectionStatus = 'OFFLINE'
        }

        return {
          id: device.id,
          name: device.name,
          room_id: device.room?.id || null,
          room_name: device.room?.name || null,
          status: connectionStatus
        }
      })

      const healthSummary = formattedDevices.reduce(
        (acc, item) => {
          if (item.status === 'ONLINE') acc.online += 1
          else if (item.status === 'OFFLINE') acc.offline += 1
          else acc.warning += 1
          return acc
        },
        { online: 0, warning: 0, offline: 0 }
      )

      return success(res, 'success', {
        devices: formattedDevices,
        health_summary: healthSummary
      })
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getMyTeachingSchedule: async (req, res) => {
    try {
      const roleIdentity = getRoleIdentity(req.user?.role)
      const { currentDay } = getCurrentContext()
      if (!currentDay) {
        return success(res, 'success', [])
      }

      let scheduleWhere = {
        day: currentDay,
        status: true
      }

      if (['SA', 'SUPER_ADMIN'].includes(roleIdentity)) {
        scheduleWhere = {
          ...scheduleWhere
        }
      } else if (req.user?.lecturer?.id) {
        scheduleWhere = {
          ...scheduleWhere,
          lecturer_id: req.user.lecturer.id
        }
      } else if (req.user?.helper?.id) {
        const buildingIds = await getScopedBuildingIds(req.user)
        scheduleWhere = buildScopedWhere(buildingIds, scheduleWhere)
      } else {
        return success(res, 'success', [])
      }

      const schedules = await prisma.schedule.findMany({
        where: scheduleWhere,
        include: {
          course: {
            select: { name: true }
          },
          class: {
            select: { name: true }
          },
          room: {
            select: {
              id: true,
              name: true,
              building: {
                select: { id: true, name: true }
              }
            }
          },
          lecturer: {
            select: {
              id: true,
              user: {
                select: { name: true }
              }
            }
          },
          time_slot: {
            select: { start_time: true, end_time: true }
          }
        },
        orderBy: [{ time_slot: { start_time: 'asc' } }, { created_at: 'asc' }]
      })

      const { parts } = getCurrentContext()
      const { start: startOfDay, end: endOfDay } = getJakartaDayRange(
        parts.year,
        parts.month,
        parts.day
      )
      const lecturerIds = [
        ...new Set(
          schedules
            .map((item) => item.lecturer?.id || item.lecturer_id)
            .filter(Boolean)
        )
      ]

      const attendanceToday = await prisma.attendance.findMany({
        where: {
          lecturer_id: { in: lecturerIds.length ? lecturerIds : [''] },
          check_in_at: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        orderBy: { check_in_at: 'asc' }
      })

      const attendanceMap = new Map()
      attendanceToday.forEach((item) => {
        const key = `${item.lecturer_id}:${item.room_id || ''}`
        if (!attendanceMap.has(key)) {
          attendanceMap.set(key, item)
        }
      })

      const items = schedules.map((item) => {
        const lecturerId = item.lecturer?.id || item.lecturer_id
        const key = `${lecturerId}:${item.room_id || ''}`
        const attendance = attendanceMap.get(key)

        let status = 'WAITING'
        if (attendance) {
          const attendedParts = getJakartaParts(attendance.check_in_at)
          const checkInMinutes = attendedParts.hour * 60 + attendedParts.minute
          const [startHour, startMinute] = (item.time_slot?.start_time || '00:00')
            .split(':')
            .map(Number)
          const startMinutes = startHour * 60 + startMinute

          status = checkInMinutes > startMinutes ? 'LATE' : 'PRESENT'
        }

        return {
          schedule_id: item.id,
          start_time: item.time_slot?.start_time || null,
          end_time: item.time_slot?.end_time || null,
          class_name: item.course?.name || null,
          class_code: item.class?.name || null,
          lecturer_name: item.lecturer?.user?.name || null,
          room_id: item.room?.id || null,
          room_name: item.room?.name || null,
          building_id: item.room?.building?.id || null,
          building_name: item.room?.building?.name || null,
          status
        }
      })

      return success(res, 'success', items)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getSemesterSummary: async (req, res) => {
    try {
      const lecturerId = req.user?.lecturer?.id
      if (!lecturerId) {
        return success(res, 'success', {
          classes_taught: 0,
          on_time_rate_percent: 0,
          total_hours: 0,
          absences: 0
        })
      }

      const now = getJakartaParts()
      const startOfSemester = toUtcFromJakarta(now.year, 1, 1, 0, 0, 0)
      const endOfToday = toUtcFromJakarta(
        now.year,
        now.month,
        now.day,
        23,
        59,
        59
      )

      const [schedules, attendances] = await Promise.all([
        prisma.schedule.findMany({
          where: {
            lecturer_id: lecturerId,
            status: true
          },
          include: {
            time_slot: {
              select: { start_time: true, end_time: true }
            }
          }
        }),
        prisma.attendance.findMany({
          where: {
            lecturer_id: lecturerId,
            check_in_at: {
              gte: startOfSemester,
              lte: endOfToday
            }
          },
          orderBy: { check_in_at: 'asc' }
        })
      ])

      const allOccurrences = schedules.flatMap((schedule) =>
        enumerateScheduleOccurrences(schedule, startOfSemester, endOfToday)
      )
      const completedOccurrences = allOccurrences.filter(
        (occurrence) => occurrence.end_at <= new Date()
      )

      const usedOccurrenceIndexes = new Set()
      const matchedAttendances = []

      attendances.forEach((attendance) => {
        const index = findAttendanceOccurrenceIndex(
          completedOccurrences,
          attendance,
          usedOccurrenceIndexes
        )

        if (index === -1) return

        usedOccurrenceIndexes.add(index)
        matchedAttendances.push({
          attendance,
          occurrence: completedOccurrences[index]
        })
      })

      const classesTaught = matchedAttendances.length
      const absences = Math.max(
        completedOccurrences.length - matchedAttendances.length,
        0
      )

      const onTimeCount = matchedAttendances.filter(({ attendance, occurrence }) => {
        return attendance.check_in_at <= occurrence.start_at
      }).length

      const onTimeRatePercent =
        classesTaught === 0
          ? 0
          : Number(((onTimeCount / classesTaught) * 100).toFixed(0))

      const totalHours = matchedAttendances.reduce((sum, { occurrence }) => {
        return sum + occurrence.duration_hours
      }, 0)

      return success(res, 'success', {
        classes_taught: classesTaught,
        on_time_rate_percent: onTimeRatePercent,
        total_hours: Number(totalHours.toFixed(1)),
        absences
      })
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = {
  ...dashboardController,
  buildDeviceLiveSummary,
  buildEnergyMonitoringSummary
}
