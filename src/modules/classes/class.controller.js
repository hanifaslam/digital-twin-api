const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

const formatClass = (item) => ({
  id: item.id,
  name: item.name,
  study_program_id: item.study_program_id,
  study_program_name: item.study_program?.name || null,
  status: item.status,
  created_at: item.created_at,
  updated_at: item.updated_at
})

const ensureStudyProgramExists = async (studyProgramId) => {
  return prisma.studyProgram.findUnique({
    where: { id: studyProgramId }
  })
}

const findClassConflict = async ({ id, name, study_program_id }) => {
  if (!name || !study_program_id) {
    return null
  }

  return prisma.class.findFirst({
    where: {
      study_program_id,
      name: {
        equals: name,
        mode: 'insensitive'
      },
      ...(id ? { NOT: { id } } : {})
    }
  })
}

const classController = {
  create: async (req, res) => {
    try {
      const { name, study_program_id, status } = req.body || {}

      const studyProgram = await ensureStudyProgramExists(study_program_id)
      if (!studyProgram) {
        return error(res, 'Study program not found', 404)
      }

      const existingClass = await findClassConflict({
        name,
        study_program_id
      })

      if (existingClass) {
        return error(
          res,
          'Class name already exists in this study program',
          400
        )
      }

      await prisma.class.create({
        data: {
          name,
          study_program_id,
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
      const { q, status, study_program_id } = req.query || {}
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

      if (study_program_id) {
        where.study_program_id = study_program_id
      }

      const [classes, total] = await Promise.all([
        prisma.class.findMany({
          where,
          skip,
          take: perPage,
          include: {
            study_program: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          },
          orderBy: [
            { study_program: { name: 'asc' } },
            { name: 'asc' },
            { created_at: 'desc' }
          ]
        }),
        prisma.class.count({ where })
      ])

      return success(
        res,
        'success',
        classes.map(formatClass),
        200,
        buildPagination(page, perPage, total)
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllClass: async (req, res) => {
    try {
      const { study_program_id } = req.query || {}

      const classes = await prisma.class.findMany({
        where: {
          status: true,
          ...(study_program_id ? { study_program_id } : {})
        },
        select: {
          id: true,
          name: true
        },
        orderBy: [{ study_program: { name: 'asc' } }, { name: 'asc' }]
      })

      return success(res, 'success', classes)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const existingClass = await prisma.class.findUnique({
        where: { id },
        include: {
          study_program: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        }
      })

      if (!existingClass) {
        return error(res, 'Class not found', 404)
      }

      return success(res, 'success', formatClass(existingClass))
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, study_program_id, status } = req.body || {}

      const existingClass = await prisma.class.findUnique({
        where: { id }
      })

      if (!existingClass) {
        return error(res, 'Class not found', 404)
      }

      const targetStudyProgramId =
        study_program_id || existingClass.study_program_id

      if (study_program_id) {
        const studyProgram = await ensureStudyProgramExists(study_program_id)
        if (!studyProgram) {
          return error(res, 'Study program not found', 404)
        }
      }

      if (name || study_program_id) {
        const conflict = await findClassConflict({
          id,
          name: name || existingClass.name,
          study_program_id: targetStudyProgramId
        })

        if (conflict) {
          return error(
            res,
            'Class name already exists in this study program',
            400
          )
        }
      }

      const updateData = {
        name,
        study_program_id,
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

      await prisma.class.update({
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
      const existingClass = await prisma.class.findUnique({
        where: { id }
      })

      if (!existingClass) {
        return error(res, 'Class not found', 404)
      }

      await prisma.class.delete({
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
      const existingClass = await prisma.class.findUnique({
        where: { id }
      })

      if (!existingClass) {
        return error(res, 'Class not found', 404)
      }

      await prisma.class.update({
        where: { id },
        data: {
          status: !existingClass.status
        }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = classController
