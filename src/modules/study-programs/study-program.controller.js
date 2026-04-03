const prisma = require('../../config/prisma')
const { success, error, responseHandler } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

const withDeactivationFlag = (studyProgram) => {
  const { _count, ...studyProgramData } = studyProgram
  const courseCount = studyProgram?._count?.courses || 0

  return {
    ...studyProgramData,
    can_deactivate: courseCount === 0
  }
}

const studyProgramController = {
  create: async (req, res) => {
    try {
      const { name, code, status } = req.body || {}

      if (!name || !code) {
        return error(res, 'Missing required fields', 400)
      }

      const existingProgram = await prisma.studyProgram.findFirst({
        where: {
          OR: [{ name }, { code }]
        }
      })

      if (existingProgram) {
        if (existingProgram.name === name) {
          return error(res, 'Study program name already exists', 400)
        }
        if (existingProgram.code === code) {
          return error(res, 'Study program code already exists', 400)
        }
      }

      await prisma.studyProgram.create({
        data: {
          name,
          code,
          status: status !== undefined ? status : true
        }
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllStudyPrograms: async (req, res) => {
    try {
      const studyPrograms = await prisma.studyProgram.findMany({
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

      return success(res, 'success', studyPrograms)
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

      const [studyPrograms, total] = await Promise.all([
        prisma.studyProgram.findMany({
          where,
          skip,
          take: perPage,
          include: {
            _count: {
              select: {
                courses: true
              }
            }
          },
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.studyProgram.count({ where })
      ])

      const metadata = buildPagination(page, perPage, total)

      return success(
        res,
        'success',
        studyPrograms.map(withDeactivationFlag),
        200,
        metadata
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const studyProgram = await prisma.studyProgram.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              courses: true
            }
          }
        }
      })

      if (!studyProgram) return error(res, 'Study program not found', 404)

      return success(res, 'success', withDeactivationFlag(studyProgram))
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, code, status } = req.body || {}

      const programExists = await prisma.studyProgram.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              courses: true
            }
          }
        }
      })
      if (!programExists) return error(res, 'Study program not found', 404)

      if (status === false && programExists._count.courses > 0) {
        return error(
          res,
          `Cannot deactivate study program because it is still used by ${programExists._count.courses} course(s)`,
          400
        )
      }

      if (name || code) {
        const conflict = await prisma.studyProgram.findFirst({
          where: {
            OR: [name ? { name } : null, code ? { code } : null].filter(
              Boolean
            ),
            NOT: { id }
          }
        })

        if (conflict) {
          if (name && conflict.name === name) {
            return error(res, 'Study program name already exists', 400)
          }
          if (code && conflict.code === code) {
            return error(res, 'Study program code already exists', 400)
          }
        }
      }

      let updateData = { name, code, status }
      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      await prisma.studyProgram.update({
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
      const programExists = await prisma.studyProgram.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              courses: true
            }
          }
        }
      })
      if (!programExists) return error(res, 'Study program not found', 404)

      if (programExists._count.courses > 0) {
        return error(
          res,
          `Cannot delete study program because it is still used by ${programExists._count.courses} course(s)`,
          400
        )
      }

      await prisma.studyProgram.delete({ where: { id } })

      return success(res, 'success', null)
    } catch (err) {
      if (err.code === 'P2003') {
        return error(
          res,
          'Cannot delete study program because it is still referenced by related data',
          400
        )
      }

      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const studyProgram = await prisma.studyProgram.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              courses: true
            }
          }
        }
      })
      if (!studyProgram) return error(res, 'Study program not found', 404)

      const newStatus = !studyProgram.status

      if (!newStatus && studyProgram._count.courses > 0) {
        return error(
          res,
          `Cannot deactivate study program because it is still used by ${studyProgram._count.courses} course(s)`,
          400
        )
      }

      await prisma.studyProgram.update({
        where: { id },
        data: { status: newStatus }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = studyProgramController
