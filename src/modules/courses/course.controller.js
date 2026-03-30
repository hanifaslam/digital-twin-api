const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

const semesterToEnum = (semester) => `SEMESTER_${semester}`
const enumToSemester = (semester) => Number(semester.split('_')[1])
const courseSemesters = Array.from({ length: 8 }, (_, index) => ({
  value: index + 1,
  label: `Semester ${index + 1}`
}))
const formatCourse = (course) => ({
  id: course.id,
  code: course.code,
  name: course.name,
  semester: enumToSemester(course.semester),
  study_program_id: course.study_program_id,
  study_program_name: course.study_program?.name || null,
  status: course.status,
  created_at: course.created_at,
  updated_at: course.updated_at
})

const ensureStudyProgramExists = async (studyProgramId) => {
  return prisma.studyProgram.findUnique({
    where: { id: studyProgramId }
  })
}

const findCourseConflict = async ({ id, code, name, study_program_id }) => {
  const orConditions = [code ? { code } : null, name ? { name } : null].filter(
    Boolean
  )

  if (orConditions.length === 0) {
    return null
  }

  return prisma.course.findFirst({
    where: {
      study_program_id,
      OR: orConditions,
      ...(id ? { NOT: { id } } : {})
    }
  })
}

const courseController = {
  create: async (req, res) => {
    try {
      const { code, name, semester, study_program_id, status } = req.body || {}

      const studyProgram = await ensureStudyProgramExists(study_program_id)
      if (!studyProgram) {
        return error(res, 'Study program not found', 404)
      }

      const existingCourse = await findCourseConflict({
        code,
        name,
        study_program_id
      })

      if (existingCourse) {
        if (existingCourse.code === code) {
          return error(
            res,
            'Course code already exists in this study program',
            400
          )
        }

        if (existingCourse.name === name) {
          return error(
            res,
            'Course name already exists in this study program',
            400
          )
        }
      }

      await prisma.course.create({
        data: {
          code,
          name,
          semester: semesterToEnum(semester),
          study_program_id,
          status: status !== undefined ? status : true
        }
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllActive: async (req, res) => {
    try {
      const { study_program_id } = req.query || {}

      const where = {
        status: true,
        ...(study_program_id ? { study_program_id } : {})
      }

      const courses = await prisma.course.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          semester: true,
          study_program_id: true
        },
        orderBy: [{ semester: 'asc' }, { name: 'asc' }]
      })

      return success(
        res,
        'success',
        courses.map((course) => ({
          ...course,
          semester: enumToSemester(course.semester)
        }))
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllSemesters: async (req, res) => {
    try {
      return success(res, 'success', courseSemesters)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const { q, status, study_program_id, semester } = req.query || {}
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
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } }
        ]
      }

      if (statuses.length === 1) {
        where.status = statuses[0] === 'true'
      }

      if (study_program_id) {
        where.study_program_id = study_program_id
      }

      if (semester && !Number.isNaN(Number(semester))) {
        where.semester = semesterToEnum(Number(semester))
      }

      const [courses, total] = await Promise.all([
        prisma.course.findMany({
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
          orderBy: [{ semester: 'asc' }, { created_at: 'desc' }]
        }),
        prisma.course.count({ where })
      ])

      return success(
        res,
        'success',
        courses.map(formatCourse),
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
      const course = await prisma.course.findUnique({
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

      if (!course) {
        return error(res, 'Course not found', 404)
      }

      return success(res, 'success', formatCourse(course))
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { code, name, semester, study_program_id, status } = req.body || {}

      const existingCourse = await prisma.course.findUnique({
        where: { id }
      })

      if (!existingCourse) {
        return error(res, 'Course not found', 404)
      }

      const targetStudyProgramId =
        study_program_id || existingCourse.study_program_id

      if (study_program_id) {
        const studyProgram = await ensureStudyProgramExists(study_program_id)
        if (!studyProgram) {
          return error(res, 'Study program not found', 404)
        }
      }

      const conflict = await findCourseConflict({
        id,
        code: code || existingCourse.code,
        name: name || existingCourse.name,
        study_program_id: targetStudyProgramId
      })

      if (conflict) {
        if ((code || existingCourse.code) === conflict.code) {
          return error(
            res,
            'Course code already exists in this study program',
            400
          )
        }

        if ((name || existingCourse.name) === conflict.name) {
          return error(
            res,
            'Course name already exists in this study program',
            400
          )
        }
      }

      const updateData = {
        code,
        name,
        semester: semester !== undefined ? semesterToEnum(semester) : undefined,
        study_program_id,
        status
      }

      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      await prisma.course.update({
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
      const existingCourse = await prisma.course.findUnique({
        where: { id }
      })

      if (!existingCourse) {
        return error(res, 'Course not found', 404)
      }

      await prisma.course.delete({
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
      const existingCourse = await prisma.course.findUnique({
        where: { id }
      })

      if (!existingCourse) {
        return error(res, 'Course not found', 404)
      }

      await prisma.course.update({
        where: { id },
        data: {
          status: !existingCourse.status
        }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = courseController
