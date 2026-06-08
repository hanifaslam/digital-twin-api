const prisma = require('../../config/prisma')
const {
  formatTime,
  getJakartaDayRange,
  getJakartaScheduleContext
} = require('../../utils/date')
const { buildEnergyMonitoringSummary } = require('../dashboard/dashboard.controller')
const { buildClarificationState } = require('./chatbot.clarification')
const { resolveScheduleDay } = require('./chatbot.schedule')

const ROOM_LOG_SELECT = {
  id: true,
  room_id: true,
  device_id: true,
  sensor_type: true,
  voltage: true,
  current: true,
  power: true,
  energy: true,
  frequency: true,
  power_factor: true,
  temperature: true,
  humidity: true,
  created_at: true
}

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const toNumberOrNull = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null
  }

  return Number(Number(value).toFixed(digits))
}

const buildToolResult = ({
  ok = true,
  message = 'success',
  data = null,
  contextScope = {},
  clarification = null
}) => ({
  ok,
  message,
  data,
  clarification,
  context_scope: {
    building_id: contextScope.building_id || null,
    room_id: contextScope.room_id || null,
    lecturer_id: contextScope.lecturer_id || null
  }
})

const mergeContextScope = (current, next) => ({
  building_id: next?.building_id || current.building_id || null,
  room_id: next?.room_id || current.room_id || null,
  lecturer_id: next?.lecturer_id || current.lecturer_id || null
})

const getLatestRoomPower = async (roomId) => {
  const log = await prisma.sensorLog.findFirst({
    where: {
      room_id: roomId,
      power: { not: null }
    },
    orderBy: { created_at: 'desc' },
    select: ROOM_LOG_SELECT
  })

  return log
    ? {
        room_id: log.room_id,
        power_watts: toNumberOrNull(log.power, 1),
        energy_kwh: toNumberOrNull(log.energy, 3),
        voltage: toNumberOrNull(log.voltage, 1),
        current: toNumberOrNull(log.current, 2),
        frequency: toNumberOrNull(log.frequency, 1),
        power_factor: toNumberOrNull(log.power_factor, 2),
        updated_at: log.created_at
      }
    : null
}

const getTopRoomsByPower = async (buildingId, limit = 3) => {
  const rooms = await prisma.room.findMany({
    where: {
      building_id: buildingId,
      status: true
    },
    select: {
      id: true,
      name: true
    },
    orderBy: { name: 'asc' }
  })

  const latestLogs = await Promise.all(
    rooms.map(async (room) => ({
      room_id: room.id,
      room_name: room.name,
      latest_power: await getLatestRoomPower(room.id)
    }))
  )

  return latestLogs
    .filter((item) => item.latest_power?.power_watts !== null)
    .sort(
      (a, b) =>
        Number(b.latest_power?.power_watts || 0) -
        Number(a.latest_power?.power_watts || 0)
    )
    .slice(0, limit)
}

const getBuildingDeviceHealth = async (buildingId) => {
  const devices = await prisma.device.findMany({
    where: {
      status: true,
      room: {
        building_id: buildingId
      }
    },
    select: {
      id: true,
      name: true,
      is_online: true,
      last_seen_at: true,
      last_latency_ms: true,
      room: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ room: { name: 'asc' } }, { name: 'asc' }]
  })

  const counts = devices.reduce(
    (acc, device) => {
      if (device.is_online) acc.online += 1
      else acc.offline += 1
      return acc
    },
    { online: 0, offline: 0 }
  )

  return {
    counts,
    offline_devices: devices
      .filter((device) => !device.is_online)
      .slice(0, 5)
      .map((device) => ({
        id: device.id,
        name: device.name,
        room_name: device.room?.name || null,
        last_seen_at: device.last_seen_at,
        last_latency_ms: device.last_latency_ms
      }))
  }
}

const getRoomEnvironment = async (roomId) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      building: {
        select: {
          id: true,
          name: true
        }
      }
    }
  })

  if (!room) return null

  const latestLog = await prisma.sensorLog.findFirst({
    where: {
      room_id: roomId,
      OR: [{ temperature: { not: null } }, { humidity: { not: null } }]
    },
    orderBy: { created_at: 'desc' },
    select: ROOM_LOG_SELECT
  })

  return {
    room_id: room.id,
    room_name: room.name,
    building_id: room.building?.id || null,
    building_name: room.building?.name || null,
    temperature_c: toNumberOrNull(latestLog?.temperature, 1),
    humidity_percent: toNumberOrNull(latestLog?.humidity, 1),
    updated_at: latestLog?.created_at || null
  }
}

const getRoomSnapshot = async (roomId) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      building: {
        select: {
          id: true,
          name: true
        }
      }
    }
  })

  if (!room) return null

  const [latestPower, latestEnvironment, devices] = await Promise.all([
    getLatestRoomPower(roomId),
    getRoomEnvironment(roomId),
    prisma.device.findMany({
      where: {
        room_id: roomId,
        status: true
      },
      select: {
        id: true,
        name: true,
        type: true,
        is_online: true,
        is_on: true,
        last_seen_at: true
      },
      orderBy: { name: 'asc' }
    })
  ])

  return {
    room_id: room.id,
    room_name: room.name,
    building_id: room.building?.id || null,
    building_name: room.building?.name || null,
    latest_power: latestPower,
    latest_environment: latestEnvironment,
    devices
  }
}

const getBuildingSnapshot = async (buildingId) => {
  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: {
      id: true,
      name: true,
      status: true,
      rooms: {
        where: { status: true },
        select: {
          id: true,
          name: true
        },
        orderBy: { name: 'asc' }
      }
    }
  })

  if (!building || !building.status) return null

  const [energySummary, deviceHealth, topRooms] = await Promise.all([
    buildEnergyMonitoringSummary(building.id),
    getBuildingDeviceHealth(building.id),
    getTopRoomsByPower(building.id)
  ])

  return {
    building_id: building.id,
    building_name: building.name,
    room_count: building.rooms.length,
    rooms: building.rooms.slice(0, 10),
    energy_summary: energySummary,
    device_health: deviceHealth,
    top_rooms_by_power: topRooms.map((item) => ({
      room_id: item.room_id,
      room_name: item.room_name,
      power_watts: item.latest_power?.power_watts ?? null,
      energy_kwh: item.latest_power?.energy_kwh ?? null,
      updated_at: item.latest_power?.updated_at ?? null
    }))
  }
}

const findBuilding = async ({ buildingId, buildingName }) => {
  if (buildingId) {
    return prisma.building.findFirst({
      where: {
        id: buildingId,
        status: true
      },
      select: { id: true, name: true }
    })
  }

  if (!buildingName) return null

  const matches = await prisma.building.findMany({
    where: {
      status: true,
      name: {
        contains: buildingName,
        mode: 'insensitive'
      }
    },
    select: { id: true, name: true },
    take: 5,
    orderBy: { name: 'asc' }
  })

  if (matches.length === 1) return matches[0]

  return matches
}

const findRoom = async ({ roomId, roomName, buildingId }) => {
  if (roomId) {
    return prisma.room.findFirst({
      where: {
        id: roomId,
        status: true
      },
      select: {
        id: true,
        name: true,
        building_id: true,
        building: {
          select: { name: true }
        }
      }
    })
  }

  if (!roomName) return null

  const matches = await prisma.room.findMany({
    where: {
      status: true,
      name: {
        contains: roomName,
        mode: 'insensitive'
      },
      ...(buildingId ? { building_id: buildingId } : {})
    },
    select: {
      id: true,
      name: true,
      building_id: true,
      building: {
        select: { name: true }
      }
    },
    take: 5,
    orderBy: [{ name: 'asc' }]
  })

  if (matches.length === 1) return matches[0]

  return matches
}

const findLecturer = async ({ lecturerId, lecturerName }) => {
  if (lecturerId) {
    return prisma.lecturer.findUnique({
      where: { id: lecturerId },
      include: {
        user: {
          select: {
            name: true
          }
        }
      }
    })
  }

  if (!lecturerName) return null

  const matches = await prisma.lecturer.findMany({
    where: {
      user: {
        name: {
          contains: lecturerName,
          mode: 'insensitive'
        }
      }
    },
    include: {
      user: {
        select: {
          name: true
        }
      }
    },
    take: 5,
    orderBy: {
      user: {
        name: 'asc'
      }
    }
  })

  if (matches.length === 1) return matches[0]

  return matches
}

const resolveBuildingOrExplain = async ({ buildingId, buildingName }) => {
  const building = await findBuilding({ buildingId, buildingName })

  if (!building) {
    return buildToolResult({
      ok: false,
      message: 'Gedung tidak ditemukan.',
      data: null
    })
  }

  if (Array.isArray(building)) {
    return buildToolResult({
      ok: false,
      message: 'Nama gedung masih ambigu.',
      data: {
        matches: building.map((item) => ({
          id: item.id,
          name: item.name
        }))
      },
      clarification: buildClarificationState({
        entityType: 'building',
        matches: building.map((item) => ({
          id: item.id,
          name: item.name
        })),
        prompt:
          'Saya menemukan beberapa gedung dengan nama mirip. Pilih gedung yang dimaksud.'
      })
    })
  }

  return building
}

const resolveRoomOrExplain = async ({ roomId, roomName, buildingId }) => {
  const room = await findRoom({ roomId, roomName, buildingId })

  if (!room) {
    return buildToolResult({
      ok: false,
      message: 'Ruangan tidak ditemukan.',
      data: null
    })
  }

  if (Array.isArray(room)) {
    return buildToolResult({
      ok: false,
      message: 'Nama ruangan masih ambigu.',
      data: {
        matches: room.map((item) => ({
          id: item.id,
          name: item.name,
          building_name: item.building?.name || null
        }))
      },
      clarification: buildClarificationState({
        entityType: 'room',
        matches: room.map((item) => ({
          id: item.id,
          name: item.name,
          building_id: item.building_id,
          building_name: item.building?.name || null
        })),
        prompt:
          'Saya menemukan beberapa ruangan dengan nama mirip. Pilih ruangan yang dimaksud.'
      })
    })
  }

  return room
}

const resolveLecturerOrExplain = async ({ lecturerId, lecturerName }) => {
  const lecturer = await findLecturer({ lecturerId, lecturerName })

  if (!lecturer) {
    return buildToolResult({
      ok: false,
      message: 'Dosen tidak ditemukan.',
      data: null
    })
  }

  if (Array.isArray(lecturer)) {
    return buildToolResult({
      ok: false,
      message: 'Nama dosen masih ambigu.',
      data: {
        matches: lecturer.map((item) => ({
          id: item.id,
          name: item.user?.name || null,
          nip: item.nip
        }))
      },
      clarification: buildClarificationState({
        entityType: 'lecturer',
        matches: lecturer.map((item) => ({
          id: item.id,
          name: item.user?.name || null,
          lecturer_id: item.id,
          nip: item.nip
        })),
        prompt:
          'Saya menemukan beberapa dosen dengan nama mirip. Pilih dosen yang dimaksud.'
      })
    })
  }

  return lecturer
}

const getRoomSchedulesForDay = async (roomId, dateInput) => {
  const resolvedDay = resolveScheduleDay(dateInput)

  if (!resolvedDay) {
    return { unsupported: true }
  }

  const { target_day: targetDay, current_time: currentTime, is_today: isToday } =
    resolvedDay

  if (!targetDay) {
    return {
      ...resolvedDay,
      schedules: []
    }
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      room_id: roomId,
      day: targetDay,
      status: true
    },
    include: {
      course: {
        select: { name: true, code: true }
      },
      class: {
        select: { id: true, name: true }
      },
      time_slot: {
        select: { start_time: true, end_time: true }
      },
      lecturer: {
        include: {
          user: {
            select: { name: true }
          }
        }
      }
    },
    orderBy: {
      time_slot: {
        start_time: 'asc'
      }
    }
  })

  return {
    ...resolvedDay,
    schedules: schedules.map((schedule) => ({
      id: schedule.id,
      course_name: schedule.course?.name || null,
      course_code: schedule.course?.code || null,
      class_id: schedule.class?.id || null,
      class_name: schedule.class?.name || null,
      lecturer_name: schedule.lecturer?.user?.name || null,
      start_time: schedule.time_slot.start_time,
      end_time: schedule.time_slot.end_time,
      is_active_now:
        isToday &&
        currentTime >= schedule.time_slot.start_time &&
        currentTime <= schedule.time_slot.end_time
    }))
  }
}

const getLecturerStatusSnapshot = async (lecturerId) => {
  const lecturer = await prisma.lecturer.findUnique({
    where: { id: lecturerId },
    include: {
      user: {
        select: {
          name: true
        }
      },
      schedules: {
        where: {
          day: getJakartaScheduleContext().currentDay || undefined,
          status: true
        },
        include: {
          room: {
            select: {
              id: true,
              name: true,
              building: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          course: {
            select: {
              name: true,
              code: true
            }
          },
          time_slot: {
            select: {
              start_time: true,
              end_time: true
            }
          }
        },
        orderBy: {
          time_slot: {
            start_time: 'asc'
          }
        }
      }
    }
  })

  if (!lecturer) return null

  const { currentTime } = getJakartaScheduleContext()
  const { start, end } = getJakartaDayRange()
  const todayAttendance = await prisma.attendance.findFirst({
    where: {
      lecturer_id: lecturerId,
      check_in_at: {
        gte: start,
        lte: end
      }
    },
    orderBy: {
      check_in_at: 'desc'
    }
  })

  const activeSchedule = lecturer.schedules.find(
    (item) =>
      currentTime >= item.time_slot.start_time &&
      currentTime <= item.time_slot.end_time
  )

  return {
    lecturer_id: lecturer.id,
    lecturer_name: lecturer.user?.name || null,
    nip: lecturer.nip,
    status: lecturer.status,
    is_manual: lecturer.is_manual,
    overridden_at: formatTime(lecturer.overridden_at),
    attended_at: formatTime(todayAttendance?.check_in_at),
    active_schedule: activeSchedule
      ? {
          course_name: activeSchedule.course?.name || null,
          course_code: activeSchedule.course?.code || null,
          room_id: activeSchedule.room?.id || null,
          room_name: activeSchedule.room?.name || null,
          building_id: activeSchedule.room?.building?.id || null,
          building_name: activeSchedule.room?.building?.name || null,
          start_time: activeSchedule.time_slot.start_time,
          end_time: activeSchedule.time_slot.end_time
        }
      : null
  }
}

const getRoomLecturerStatuses = async (roomId) => {
  const { currentDay, currentTime } = getJakartaScheduleContext()

  const lecturers = await prisma.lecturer.findMany({
    where: {
      AND: [
        {
          user: {
            role: {
              code: {
                notIn: ['SA', 'SUPER_ADMIN', 'AD']
              }
            }
          }
        },
        {
          OR: [
            ...(currentDay
              ? [
                  {
                    schedules: {
                      some: {
                        room_id: roomId,
                        day: currentDay,
                        status: true,
                        time_slot: {
                          start_time: { lte: currentTime },
                          end_time: { gte: currentTime }
                        }
                      }
                    }
                  }
                ]
              : []),
            {
              study_programs: {
                some: {
                  study_program: {
                    home_room_id: roomId
                  }
                }
              }
            }
          ]
        }
      ]
    },
    include: {
      user: {
        select: {
          id: true,
          name: true
        }
      },
      schedules: {
        where: {
          day: currentDay || undefined,
          status: true
        },
        include: {
          room: {
            select: {
              id: true,
              name: true
            }
          },
          time_slot: true,
          course: true
        }
      }
    },
    orderBy: {
      user: {
        name: 'asc'
      }
    }
  })

  return lecturers.map((lecturer) => {
    const activeSchedule = lecturer.schedules.find(
      (schedule) =>
        currentTime >= schedule.time_slot.start_time &&
        currentTime <= schedule.time_slot.end_time &&
        schedule.room_id === roomId
    )

    return {
      lecturer_id: lecturer.id,
      lecturer_name: lecturer.user?.name || null,
      status: lecturer.status,
      is_manual: lecturer.is_manual,
      overridden_at: formatTime(lecturer.overridden_at),
      active_course: activeSchedule?.course?.name || null,
      active_time_range: activeSchedule
        ? `${activeSchedule.time_slot.start_time}-${activeSchedule.time_slot.end_time}`
        : null
    }
  })
}

module.exports = {
  buildToolResult,
  getBuildingSnapshot,
  getLecturerStatusSnapshot,
  getRoomLecturerStatuses,
  getRoomSchedulesForDay,
  getRoomSnapshot,
  mergeContextScope,
  normalizeText,
  resolveBuildingOrExplain,
  resolveLecturerOrExplain,
  resolveRoomOrExplain
}
