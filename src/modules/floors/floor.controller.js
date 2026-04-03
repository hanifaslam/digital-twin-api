const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

const withDeactivationFlag = (masterFloor) => {
  const roomCount = masterFloor?._count?.rooms || 0
  const { _count, ...masterFloorData } = masterFloor

  return {
    ...masterFloorData,
    can_deactivate: roomCount === 0
  }
}

const masterFloorController = {
  create: async (req, res) => {
    try {
      const { name, status } = req.body || {}

      if (!name) {
        return error(res, 'Missing required fields', 400)
      }

      const existingMasterFloor = await prisma.floor.findUnique({
        where: { name }
      })

      if (existingMasterFloor) {
        return error(res, 'Master floor name already exists', 400)
      }

      await prisma.floor.create({
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
      const { q, status, building } = req.query || {}
      const statuses = [
        ...new Set(
          status
            ?.split(',')
            .map((item) => item.trim().toLowerCase())
            .filter((item) => item === 'true' || item === 'false')
        )
      ]
      const buildingIds = building
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean)
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

      if (buildingIds?.length) {
        where.rooms = {
          some: {
            building_id: {
              in: buildingIds
            }
          }
        }
      }

      const [masterFloors, total] = await Promise.all([
        prisma.floor.findMany({
          where,
          skip,
          take: perPage,
          include: {
            _count: {
              select: {
                rooms: true
              }
            }
          },
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.floor.count({ where })
      ])

      const metadata = buildPagination(page, perPage, total)

      return success(
        res,
        'success',
        masterFloors.map(withDeactivationFlag),
        200,
        metadata
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllFloor: async (req, res) => {
    try {
      const floors = await prisma.floor.findMany({
        select: {
          id: true,
          name: true
        },
        orderBy: {
          name: 'asc'
        }
      })

      return success(res, 'success', floors)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const masterFloor = await prisma.floor.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              rooms: true
            }
          }
        }
      })

      if (!masterFloor) return error(res, 'Master floor not found', 404)

      return success(res, 'success', withDeactivationFlag(masterFloor))
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, status } = req.body || {}

      const masterFloorExists = await prisma.floor.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              rooms: true
            }
          }
        }
      })
      if (!masterFloorExists) return error(res, 'Master floor not found', 404)

      if (
        status !== undefined &&
        (status === false || status === 'false') &&
        masterFloorExists._count.rooms > 0
      ) {
        return error(
          res,
          'Cannot deactivate master floor because it is still used by related rooms',
          400
        )
      }

      if (name) {
        const conflict = await prisma.floor.findFirst({
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

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      await prisma.floor.update({
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
      const masterFloorExists = await prisma.floor.findUnique({
        where: { id }
      })
      if (!masterFloorExists) return error(res, 'Master floor not found', 404)

      await prisma.floor.delete({ where: { id } })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const masterFloor = await prisma.floor.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              rooms: true
            }
          }
        }
      })
      if (!masterFloor) return error(res, 'Master floor not found', 404)

      const newStatus = !masterFloor.status

      if (!newStatus && masterFloor._count.rooms > 0) {
        return error(
          res,
          'Cannot deactivate master floor because it is still used by related rooms',
          400
        )
      }

      await prisma.floor.update({
        where: { id },
        data: { status: newStatus }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = masterFloorController
