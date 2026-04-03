const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

const masterClassController = {
  create: async (req, res) => {
    try {
      const { name, status } = req.body || {}

      const existingMasterClass = await prisma.masterClass.findFirst({
        where: {
          name: {
            equals: name,
            mode: 'insensitive'
          }
        }
      })

      if (existingMasterClass) {
        return error(res, 'Master class name already exists', 400)
      }

      await prisma.masterClass.create({
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

      const where = {}

      if (q) {
        where.name = { contains: q, mode: 'insensitive' }
      }

      if (statuses.length === 1) {
        where.status = statuses[0] === 'true'
      }

      const [masterClasses, total] = await Promise.all([
        prisma.masterClass.findMany({
          where,
          skip,
          take: perPage,
          orderBy: [{ name: 'asc' }, { created_at: 'desc' }]
        }),
        prisma.masterClass.count({ where })
      ])

      return success(
        res,
        'success',
        masterClasses,
        200,
        buildPagination(page, perPage, total)
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllClass: async (req, res) => {
    try {
      const masterClasses = await prisma.masterClass.findMany({
        select: {
          id: true,
          name: true,
          status: true
        },
        orderBy: {
          name: 'asc'
        }
      })

      return success(res, 'success', masterClasses)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const masterClass = await prisma.masterClass.findUnique({
        where: { id }
      })

      if (!masterClass) {
        return error(res, 'Master class not found', 404)
      }

      return success(res, 'success', masterClass)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, status } = req.body || {}

      const existingMasterClass = await prisma.masterClass.findUnique({
        where: { id }
      })

      if (!existingMasterClass) {
        return error(res, 'Master class not found', 404)
      }

      if (name) {
        const conflict = await prisma.masterClass.findFirst({
          where: {
            name: {
              equals: name,
              mode: 'insensitive'
            },
            NOT: { id }
          }
        })

        if (conflict) {
          return error(res, 'Master class name already exists', 400)
        }
      }

      const updateData = {
        name,
        status:
          status !== undefined
            ? status === 'true' || status === true
            : undefined
      }

      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      await prisma.masterClass.update({
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
      const existingMasterClass = await prisma.masterClass.findUnique({
        where: { id }
      })

      if (!existingMasterClass) {
        return error(res, 'Master class not found', 404)
      }

      await prisma.masterClass.delete({
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
      const existingMasterClass = await prisma.masterClass.findUnique({
        where: { id }
      })

      if (!existingMasterClass) {
        return error(res, 'Master class not found', 404)
      }

      await prisma.masterClass.update({
        where: { id },
        data: {
          status: !existingMasterClass.status
        }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = masterClassController
