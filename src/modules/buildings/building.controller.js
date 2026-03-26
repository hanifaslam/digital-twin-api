const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')

const buildingController = {
  create: async (req, res) => {
    try {
      const { name, code, status } = req.body || {}

      if (!name) {
        return error(res, 'Missing required fields', 400)
      }

      const existingBuilding = await prisma.building.findUnique({
        where: { name }
      })

      if (existingBuilding) {
        return error(res, 'Building name already exists', 400)
      }

      if (code) {
        const existingCode = await prisma.building.findUnique({
          where: { code }
        })
        if (existingCode) {
          return error(res, 'Building code already exists', 400)
        }
      }

      await prisma.building.create({
        data: {
          name,
          code,
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
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      let where = {}

      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } }
        ]
      }

      if (status !== undefined && status !== '') {
        where.status = status === 'true' || status === true
      }

      const [buildings, total] = await Promise.all([
        prisma.building.findMany({
          where,
          skip,
          take: perPage,
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.building.count({ where })
      ])

      const metadata = {
        per_page: perPage,
        current_page: page,
        total_row: total,
        total_page: Math.ceil(total / perPage)
      }

      return success(res, 'success', buildings, 200, metadata)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const building = await prisma.building.findUnique({
        where: { id }
      })

      if (!building) return error(res, 'Building not found', 404)

      return success(res, 'success', building)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, code, status } = req.body || {}

      const buildingExists = await prisma.building.findUnique({
        where: { id }
      })
      if (!buildingExists) return error(res, 'Building not found', 404)

      if (name) {
        const conflict = await prisma.building.findFirst({
          where: {
            name,
            NOT: { id }
          }
        })
        if (conflict) return error(res, 'Building name already exists', 400)
      }

      if (code) {
        const conflict = await prisma.building.findFirst({
          where: {
            code,
            NOT: { id }
          }
        })
        if (conflict) return error(res, 'Building code already exists', 400)
      }

      let updateData = {
        name,
        code,
        status:
          status !== undefined
            ? status === 'true' || status === true
            : undefined
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      await prisma.building.update({
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
      const buildingExists = await prisma.building.findUnique({
        where: { id },
        include: { _count: { select: { rooms: true } } }
      })
      if (!buildingExists) return error(res, 'Building not found', 404)

      if (buildingExists._count.rooms > 0) {
        return error(res, 'Cannot delete building with active rooms', 400)
      }

      await prisma.building.delete({ where: { id } })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const building = await prisma.building.findUnique({
        where: { id }
      })
      if (!building) return error(res, 'Building not found', 404)

      const newStatus = !building.status

      await prisma.building.update({
        where: { id },
        data: { status: newStatus }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = buildingController
