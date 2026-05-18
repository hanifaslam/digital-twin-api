const { Day } = require('@prisma/client')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')

const DAY_ORDER = [Day.MONDAY, Day.TUESDAY, Day.WEDNESDAY, Day.THURSDAY, Day.FRIDAY]

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

const dashboardController = {
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
      ] =
        await Promise.all([
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
            select: { id: true, name: true }
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

      const lecturerIds = [...new Set(schedules.map((item) => item.lecturer_id))]
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
          class_name: item.course?.name || null,
          class_code: item.class?.name || null,
          lecturer_name: item.lecturer?.user?.name || null,
          room_name: item.room?.name || null,
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
        requestedBuildingId && buildings.some((b) => b.id === requestedBuildingId)
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
      const lecturerId = req.user?.lecturer?.id
      if (!lecturerId) {
        return success(res, 'success', [])
      }

      const { currentDay } = getCurrentContext()
      if (!currentDay) {
        return success(res, 'success', [])
      }

      const schedules = await prisma.schedule.findMany({
        where: {
          lecturer_id: lecturerId,
          day: currentDay,
          status: true
        },
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
            select: { start_time: true, end_time: true }
          }
        },
        orderBy: [{ time_slot: { start_time: 'asc' } }, { created_at: 'asc' }]
      })

      const items = schedules.map((item) => ({
        schedule_id: item.id,
        start_time: item.time_slot?.start_time || null,
        end_time: item.time_slot?.end_time || null,
        class_name: item.course?.name || null,
        class_code: item.class?.name || null,
        room_id: item.room?.id || null,
        room_name: item.room?.name || null
      }))

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

      const classesTaught = attendances.length
      const scheduleCount = schedules.length
      const absences = Math.max(scheduleCount - classesTaught, 0)

      const onTimeCount = attendances.filter((item) => {
        const p = getJakartaParts(item.check_in_at)
        const minutes = p.hour * 60 + p.minute
        return minutes <= 7 * 60 + 30
      }).length

      const onTimeRatePercent =
        classesTaught === 0
          ? 0
          : Number(((onTimeCount / classesTaught) * 100).toFixed(0))

      const totalHours = schedules.reduce((sum, item) => {
        const start = item.time_slot?.start_time || '00:00'
        const end = item.time_slot?.end_time || '00:00'
        const [sh, sm] = start.split(':').map(Number)
        const [eh, em] = end.split(':').map(Number)
        const minutes = eh * 60 + em - (sh * 60 + sm)
        return sum + Math.max(minutes, 0) / 60
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

module.exports = dashboardController
