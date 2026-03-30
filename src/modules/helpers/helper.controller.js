const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

const normalizeBuildingIds = (buildingIds) => [
  ...new Set((buildingIds || []).map((id) => id?.trim()).filter(Boolean))
]

const includeHelperRelations = {
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  buildings: {
    include: {
      building: {
        select: {
          id: true,
          name: true
        }
      }
    }
  }
}

const formatBuildingsForList = (buildings = []) =>
  buildings.map((item) => item.building.name)

const formatBuildingsForShow = (buildings = []) =>
  buildings.map((item) => ({
    id: item.building.id,
    name: item.building.name
  }))

const helperController = {
  create: async (req, res) => {
    try {
      const { nip, phone_number, user_id, building_ids, status } =
        req.body || {}
      const uniqueBuildingIds = normalizeBuildingIds(building_ids)

      const existingHelper = await prisma.helper.findFirst({
        where: {
          OR: [{ nip }, { user_id }]
        }
      })

      if (existingHelper) {
        if (existingHelper.nip === nip) {
          return error(res, 'NIP already registered', 400)
        }

        if (existingHelper.user_id === user_id) {
          return error(
            res,
            'User ID already associated with another helper',
            400
          )
        }
      }

      const userExists = await prisma.user.findUnique({
        where: { id: user_id },
        select: { id: true }
      })

      if (!userExists) {
        return error(res, 'User not found', 400)
      }

      const buildings = await prisma.building.findMany({
        where: {
          id: { in: uniqueBuildingIds }
        },
        select: {
          id: true
        }
      })

      if (buildings.length !== uniqueBuildingIds.length) {
        return error(res, 'One or more buildings not found', 400)
      }

      await prisma.helper.create({
        data: {
          nip,
          phone_number: phone_number || null,
          user_id,
          status: status !== undefined ? status : true,
          buildings: {
            create: uniqueBuildingIds.map((building_id) => ({
              building_id
            }))
          }
        }
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllActive: async (req, res) => {
    try {
      const { building_id } = req.query || {}

      const helpers = await prisma.helper.findMany({
        where: {
          status: true,
          ...(building_id
            ? {
                buildings: {
                  some: { building_id }
                }
              }
            : {})
        },
        select: {
          id: true,
          user: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          user: {
            name: 'asc'
          }
        }
      })

      return success(
        res,
        'success',
        helpers.map((helper) => ({
          id: helper.id,
          name: helper.user?.name || null
        }))
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const { q, status, building_id } = req.query || {}
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

      const where = {}

      if (q) {
        where.OR = [
          { nip: { contains: q, mode: 'insensitive' } },
          { phone_number: { contains: q, mode: 'insensitive' } },
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } }
        ]
      }

      if (statuses.length === 1) {
        where.status = statuses[0] === 'true'
      }

      if (buildingIds?.length) {
        where.buildings = {
          some: {
            building_id: {
              in: buildingIds
            }
          }
        }
      }

      const [helpers, total] = await Promise.all([
        prisma.helper.findMany({
          where,
          skip,
          take: perPage,
          include: includeHelperRelations,
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.helper.count({ where })
      ])

      const formattedData = helpers.map((helper) => ({
        id: helper.id,
        name: helper.user?.name || null,
        nip: helper.nip,
        email: helper.user?.email || null,
        phone_number: helper.phone_number,
        user_id: helper.user_id,
        status: helper.status,
        buildings: formatBuildingsForList(helper.buildings),
        created_at: helper.created_at,
        updated_at: helper.updated_at
      }))

      return success(
        res,
        'success',
        formattedData,
        200,
        buildPagination(page, perPage, total)
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const helper = await prisma.helper.findUnique({
        where: { id },
        include: includeHelperRelations
      })

      if (!helper) {
        return error(res, 'Helper not found', 404)
      }

      return success(res, 'success', {
        id: helper.id,
        name: helper.user?.name || null,
        nip: helper.nip,
        email: helper.user?.email || null,
        phone_number: helper.phone_number,
        user_id: helper.user_id,
        status: helper.status,
        buildings: formatBuildingsForShow(helper.buildings),
        created_at: helper.created_at,
        updated_at: helper.updated_at
      })
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { nip, phone_number, user_id, building_ids, status } =
        req.body || {}
      const uniqueBuildingIds = building_ids
        ? normalizeBuildingIds(building_ids)
        : undefined

      const helperExists = await prisma.helper.findUnique({
        where: { id }
      })

      if (!helperExists) {
        return error(res, 'Helper not found', 404)
      }

      if (nip || user_id) {
        const conflict = await prisma.helper.findFirst({
          where: {
            OR: [nip ? { nip } : null, user_id ? { user_id } : null].filter(
              Boolean
            ),
            NOT: { id }
          }
        })

        if (conflict) {
          if (nip && conflict.nip === nip) {
            return error(res, 'NIP already registered', 400)
          }

          if (user_id && conflict.user_id === user_id) {
            return error(
              res,
              'User ID already associated with another helper',
              400
            )
          }
        }
      }

      if (user_id) {
        const userExists = await prisma.user.findUnique({
          where: { id: user_id },
          select: { id: true }
        })

        if (!userExists) {
          return error(res, 'User not found', 400)
        }
      }

      if (uniqueBuildingIds) {
        const buildings = await prisma.building.findMany({
          where: {
            id: { in: uniqueBuildingIds }
          },
          select: {
            id: true
          }
        })

        if (buildings.length !== uniqueBuildingIds.length) {
          return error(res, 'One or more buildings not found', 400)
        }
      }

      const updateData = {
        nip,
        phone_number: phone_number === '' ? null : phone_number,
        user_id,
        status
      }

      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      if (
        Object.keys(updateData).length === 0 &&
        uniqueBuildingIds === undefined
      ) {
        return error(res, 'No valid fields provided for update', 400)
      }

      await prisma.$transaction(async (tx) => {
        await tx.helper.update({
          where: { id },
          data: updateData
        })

        if (uniqueBuildingIds !== undefined) {
          await tx.helperBuilding.deleteMany({
            where: { helper_id: id }
          })

          if (uniqueBuildingIds.length > 0) {
            await tx.helperBuilding.createMany({
              data: uniqueBuildingIds.map((building_id) => ({
                helper_id: id,
                building_id
              }))
            })
          }
        }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  delete: async (req, res) => {
    try {
      const { id } = req.params
      const helperExists = await prisma.helper.findUnique({
        where: { id }
      })

      if (!helperExists) {
        return error(res, 'Helper not found', 404)
      }

      await prisma.helper.delete({
        where: { id }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const helper = await prisma.helper.findUnique({
        where: { id }
      })

      if (!helper) {
        return error(res, 'Helper not found', 404)
      }

      await prisma.helper.update({
        where: { id },
        data: {
          status: !helper.status
        }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = helperController
