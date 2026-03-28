const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')

const masterFloorController = {
  create: async (req, res) => {
    try {
      const { name, status } = req.body || {}

      if (!name) {
        return error(res, 'Missing required fields', 400)
      }

      const existingMasterFloor = await prisma.masterFloor.findUnique({
        where: { name }
      })

      if (existingMasterFloor) {
        return error(res, 'Master floor name already exists', 400)
      }

      await prisma.masterFloor.create({
        data: {
          name,
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
      const { q, status } = req.query || {}
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
        where.name = { contains: q, mode: 'insensitive' }
      }

      if (statuses?.length === 1) {
        where.status = statuses[0] === 'true'
      }

      const [masterFloors, total] = await Promise.all([
        prisma.masterFloor.findMany({
          where,
          skip,
          take: perPage,
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.masterFloor.count({ where })
      ])

      const metadata = {
        per_page: perPage,
        current_page: page,
        total_row: total,
        total_page: Math.ceil(total / perPage)
      }

      return success(res, 'success', masterFloors, 200, metadata)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const masterFloor = await prisma.masterFloor.findUnique({
        where: { id }
      })

      if (!masterFloor) return error(res, 'Master floor not found', 404)

      return success(res, 'success', masterFloor)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, status } = req.body || {}

      const masterFloorExists = await prisma.masterFloor.findUnique({
        where: { id }
      })
      if (!masterFloorExists) return error(res, 'Master floor not found', 404)

      if (name) {
        const conflict = await prisma.masterFloor.findFirst({
          where: {
            name,
            NOT: { id }
          }
        })

        if (conflict) {
          return error(res, 'Master floor name already exists', 400)
        }
      }

      let updateData = {
        name,
        status:
          status !== undefined
            ? status === 'true' || status === true
            : undefined
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      await prisma.masterFloor.update({
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
      const masterFloorExists = await prisma.masterFloor.findUnique({
        where: { id }
      })
      if (!masterFloorExists) return error(res, 'Master floor not found', 404)

      await prisma.masterFloor.delete({ where: { id } })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const masterFloor = await prisma.masterFloor.findUnique({
        where: { id }
      })
      if (!masterFloor) return error(res, 'Master floor not found', 404)

      await prisma.masterFloor.update({
        where: { id },
        data: { status: !masterFloor.status }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = masterFloorController
