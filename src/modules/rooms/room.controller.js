const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')

const roomController = {
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
        prisma.masterFloor.findUnique({
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
          status: status !== undefined ? (status === 'true' || status === true) : true
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


      if (building_id) {
        where.building_id = building_id
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

      const metadata = {
        per_page: perPage,
        current_page: page,
        total_row: total,
        total_page: Math.ceil(total / perPage)
      }

      const formattedRooms = rooms.map((room) => {
        const { building, floor, status, created_at, updated_at, ...roomData } = room
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
          floor: true
        }
      })

      if (!room) return error(res, 'Room not found', 404)

      const { building, floor, status, created_at, updated_at, ...roomData } = room
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
        where: { id }
      })
      if (!roomExists) return error(res, 'Room not found', 404)

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
        const floorExists = await prisma.masterFloor.findUnique({
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
        status: status !== undefined ? (status === 'true' || status === true) : undefined
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

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
              attendances: true,
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

      if (roomExists._count.attendances > 0) {
        dependencies.push('attendance')
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
        where: { id }
      })
      if (!room) return error(res, 'Room not found', 404)

      const newStatus = !room.status

      await prisma.room.update({
        where: { id },
        data: { status: newStatus }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = roomController
