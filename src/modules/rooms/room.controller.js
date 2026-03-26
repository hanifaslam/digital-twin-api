const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')

const roomController = {
  create: async (req, res) => {
    try {
      const { name, building_id, floor, status } = req.body || {}

      if (!name || !building_id || floor === undefined) {
        return error(res, 'Missing required fields', 400)
      }

      const existingRoom = await prisma.room.findFirst({
        where: { name, building_id }
      })

      if (existingRoom) {
        return error(res, 'Room name already exists in this building', 400)
      }

      await prisma.room.create({
        data: {
          name,
          building_id,
          floor: parseInt(floor),
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
      const { q, status, building_id, floor } = req.query || {}
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

      if (status !== undefined && status !== '') {
        where.status = status === 'true' || status === true
      }

      if (building_id) {
        where.building_id = building_id
      }

      if (floor) {
        where.floor = parseInt(floor)
      }

      const [rooms, total] = await Promise.all([
        prisma.room.findMany({
          where,
          include: {
            building: {
              select: { id: true, name: true, code: true }
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

      return success(res, 'success', rooms, 200, metadata)
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
          building: true
        }
      })

      if (!room) return error(res, 'Room not found', 404)

      return success(res, 'success', room)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, building_id, floor, status } = req.body || {}

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

      let updateData = {
        name,
        building_id,
        floor: floor !== undefined ? parseInt(floor) : undefined,
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
        where: { id }
      })
      if (!roomExists) return error(res, 'Room not found', 404)

      await prisma.room.delete({ where: { id } })

      return success(res, 'success', null)
    } catch (err) {
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
