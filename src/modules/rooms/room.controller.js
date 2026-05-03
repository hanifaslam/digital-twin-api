const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')
const { Day } = require('@prisma/client')
const { getJakartaTime } = require('../../utils/date')

const getRoomDependencyCount = (room) => {
  const schedules = room?._count?.schedules || 0
  const sensorLogs = room?._count?.sensor_logs || 0
  const devices = room?._count?.devices || 0
  const deviceStatus = room?.device_status ? 1 : 0

  return schedules + sensorLogs + devices + deviceStatus
}

const withDeactivationFlag = (room) => {
  const { _count, device_status, ...roomData } = room

  return {
    ...roomData,
    can_deactivate: getRoomDependencyCount(room) === 0
  }
}

const roomController = {
  getAllRooms: async (req, res) => {
    try {
      const { building_id } = req.query || {}

      let where = {
        status: true
      }

      if (building_id) {
        where.building_id = building_id
      }

      const rooms = await prisma.room.findMany({
        where,
        select: {
          id: true,
          name: true
        },
        orderBy: {
          name: 'asc'
        }
      })

      return success(res, 'success', rooms)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  create: async (req, res) => {
    try {
      const { name, building_id, floor_id, status } = req.body || {}

      if (!name || !building_id || !floor_id) {
        return error(res, 'Missing required fields', 400)
      }

      const existingRoom = await prisma.room.findFirst({
        where: { name, building_id }
      })

      if (existingRoom) {
        return error(res, 'Room name already exists in this building', 400)
      }

      const [buildingExists, floorExists] = await Promise.all([
        prisma.building.findUnique({
          where: { id: building_id },
          select: { id: true }
        }),
        prisma.floor.findUnique({
          where: { id: floor_id },
          select: { id: true }
        })
      ])

      if (!buildingExists) {
        return error(res, 'Building not found', 400)
      }

      if (!floorExists) {
        return error(res, 'Floor not found', 400)
      }

      await prisma.room.create({
        data: {
          name,
          building_id,
          floor_id,
          status:
            status !== undefined ? status === 'true' || status === true : true
        }
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const { q, status, building_id, floor_id } = req.query || {}
      const statuses = [
        ...new Set(
          status
            ?.split(',')
            .map((item) => item.trim().toLowerCase())
            .filter((item) => item === 'true' || item === 'false')
        )
      ]
      const buildingIds = building_id
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      let where = {}

      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { building: { name: { contains: q, mode: 'insensitive' } } }
        ]
      }

      if (statuses?.length === 1) {
        where.status = statuses[0] === 'true'
      }

      if (buildingIds?.length === 1) {
        where.building_id = buildingIds[0]
      }

      if (buildingIds?.length > 1) {
        where.building_id = {
          in: buildingIds
        }
      }

      if (floor_id) {
        where.floor_id = floor_id
      }

      const [rooms, total] = await Promise.all([
        prisma.room.findMany({
          where,
          include: {
            building: {
              select: { id: true, name: true, code: true }
            },
            floor: {
              select: { id: true, name: true }
            },
            _count: {
              select: {
                schedules: true,
                sensor_logs: true,
                devices: true
              }
            },
            device_status: {
              select: { id: true }
            }
          },
          skip,
          take: perPage,
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.room.count({ where })
      ])

      const metadata = buildPagination(page, perPage, total)

      const formattedRooms = rooms.map((room) => {
        const { building, floor, status, created_at, updated_at, ...roomData } =
          withDeactivationFlag(room)
        return {
          ...roomData,
          building_name: building?.name,
          floor_name: floor?.name,
          status,
          created_at,
          updated_at
        }
      })

      return success(res, 'success', formattedRooms, 200, metadata)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const room = await prisma.room.findUnique({
        where: { id },
        include: {
          building: true,
          floor: true,
          _count: {
            select: {
              schedules: true,
              sensor_logs: true,
              devices: true
            }
          },
          device_status: {
            select: { id: true }
          }
        }
      })

      if (!room) return error(res, 'Room not found', 404)

      const { building, floor, status, created_at, updated_at, ...roomData } =
        withDeactivationFlag(room)
      const formattedRoom = {
        ...roomData,
        building_name: building?.name,
        floor_name: floor?.name,
        status,
        created_at,
        updated_at
      }

      return success(res, 'success', formattedRoom)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, building_id, floor_id, status } = req.body || {}

      const roomExists = await prisma.room.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              schedules: true,
              sensor_logs: true,
              devices: true
            }
          },
          device_status: {
            select: { id: true }
          }
        }
      })
      if (!roomExists) return error(res, 'Room not found', 404)

      if (
        status !== undefined &&
        (status === false || status === 'false') &&
        getRoomDependencyCount(roomExists) > 0
      ) {
        return error(
          res,
          'Cannot deactivate room because it is still used by related data',
          400
        )
      }

      if (name && (building_id || roomExists.building_id)) {
        const conflict = await prisma.room.findFirst({
          where: {
            name,
            building_id: building_id || roomExists.building_id,
            NOT: { id }
          }
        })

        if (conflict) {
          return error(res, 'Room name already exists in this building', 400)
        }
      }

      if (building_id) {
        const buildingExists = await prisma.building.findUnique({
          where: { id: building_id },
          select: { id: true }
        })

        if (!buildingExists) {
          return error(res, 'Building not found', 400)
        }
      }

      if (floor_id) {
        const floorExists = await prisma.floor.findUnique({
          where: { id: floor_id },
          select: { id: true }
        })

        if (!floorExists) {
          return error(res, 'Floor not found', 400)
        }
      }

      let updateData = {
        name,
        building_id,
        floor_id,
        status:
          status !== undefined
            ? status === 'true' || status === true
            : undefined
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      await prisma.room.update({
        where: { id },
        data: updateData
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  delete: async (req, res) => {
    try {
      const { id } = req.params
      const roomExists = await prisma.room.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              schedules: true,
              sensor_logs: true,
              devices: true
            }
          },
          device_status: {
            select: { id: true }
          }
        }
      })
      if (!roomExists) return error(res, 'Room not found', 404)

      const dependencies = []

      if (roomExists._count.schedules > 0) {
        dependencies.push('schedule')
      }


      if (roomExists._count.sensor_logs > 0) {
        dependencies.push('sensor log')
      }

      if (roomExists._count.devices > 0) {
        dependencies.push('device')
      }

      if (roomExists.device_status) {
        dependencies.push('device status')
      }

      if (dependencies.length > 0) {
        return error(
          res,
          `Cannot delete room because it is still used by: ${dependencies.join(', ')}`,
          400
        )
      }

      await prisma.room.delete({ where: { id } })

      return success(res, 'success', null)
    } catch (err) {
      if (err.code === 'P2003') {
        return error(
          res,
          'Cannot delete room because it is still referenced by related data',
          400
        )
      }

      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const room = await prisma.room.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              schedules: true,
              sensor_logs: true,
              devices: true
            }
          },
          device_status: {
            select: { id: true }
          }
        }
      })
      if (!room) return error(res, 'Room not found', 404)

      const newStatus = !room.status

      if (!newStatus && getRoomDependencyCount(room) > 0) {
        return error(
          res,
          'Cannot deactivate room because it is still used by related data',
          400
        )
      }

      await prisma.room.update({
        where: { id },
        data: { status: newStatus }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getPublicSchedules: async (req, res) => {
    try {
      const { room_id } = req.query
      if (!room_id) {
        return error(res, 'room_id query parameter is required', 400)
      }

      const now = new Date()
      const daysMap = {
        1: Day.MONDAY,
        2: Day.TUESDAY,
        3: Day.WEDNESDAY,
        4: Day.THURSDAY,
        5: Day.FRIDAY
      }
      const currentDay = daysMap[now.getDay()]

      const room = await prisma.room.findUnique({
        where: { id: room_id },
        include: {
          building: true,
          floor: true,
          schedules: {
            where: {
              day: currentDay || undefined,
              status: true
            },
            include: {
              course: {
                select: { name: true, code: true }
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
          }
        }
      })

      if (!room) {
        return error(res, 'Room not found', 404)
      }

      const formattedSchedules = room.schedules.map((s) => ({
        id: s.id,
        course_name: s.course.name,
        course_code: s.course.code,
        start_time: s.time_slot.start_time,
        end_time: s.time_slot.end_time,
        lecturer_name: s.lecturer.user?.name || 'N/A'
      }))

      const responseData = {
        id: room.id,
        name: room.name,
        building: room.building?.name,
        floor: room.floor?.name,
        schedules: formattedSchedules
      }

      return success(res, 'success', responseData)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = roomController
