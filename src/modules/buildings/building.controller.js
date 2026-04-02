const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

const withDeactivationFlag = (building) => {
  const roomCount = building?._count?.rooms || 0
  const helperCount = building?._count?.helpers || 0
  const { _count, ...buildingData } = building

  return {
    ...buildingData,
    can_deactivate: roomCount === 0 && helperCount === 0
  }
}

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
          { code: { contains: q, mode: 'insensitive' } }
        ]
      }

      if (statuses?.length === 1) {
        where.status = statuses[0] === 'true'
      }

      const [buildings, total] = await Promise.all([
        prisma.building.findMany({
          where,
          skip,
          take: perPage,
          include: {
            _count: {
              select: {
                rooms: true,
                helpers: true
              }
            }
          },
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.building.count({ where })
      ])

      const metadata = buildPagination(page, perPage, total)

      return success(
        res,
        'success',
        buildings.map(withDeactivationFlag),
        200,
        metadata
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllBuildings: async (req, res) => {
    try {
      const buildings = await prisma.building.findMany({
        where: {
          status: true
        },
        select: {
          id: true,
          name: true
        },
        orderBy: {
          name: 'asc'
        }
      })

      return success(res, 'success', buildings)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const building = await prisma.building.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              rooms: true,
              helpers: true
            }
          }
        }
      })

      if (!building) return error(res, 'Building not found', 404)

      return success(res, 'success', withDeactivationFlag(building))
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, code, status } = req.body || {}

      const buildingExists = await prisma.building.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              rooms: true,
              helpers: true
            }
          }
        }
      })
      if (!buildingExists) return error(res, 'Building not found', 404)

      if (
        status !== undefined &&
        (status === false || status === 'false') &&
        (buildingExists._count.rooms > 0 || buildingExists._count.helpers > 0)
      ) {
        return error(
          res,
          'Cannot deactivate building because it is still used by related data',
          400
        )
      }

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

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

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
        where: { id },
        include: {
          _count: {
            select: {
              rooms: true,
              helpers: true
            }
          }
        }
      })
      if (!building) return error(res, 'Building not found', 404)

      const newStatus = !building.status

      if (
        !newStatus &&
        (building._count.rooms > 0 || building._count.helpers > 0)
      ) {
        return error(
          res,
          'Cannot deactivate building because it is still used by related data',
          400
        )
      }

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
