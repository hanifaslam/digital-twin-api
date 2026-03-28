const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const redisClient = require('../../config/redis')

const normalizeStudyProgramIds = (studyProgramIds) => [
  ...new Set((studyProgramIds || []).map((id) => id?.trim()).filter(Boolean))
]

const includeLecturerRelations = {
  study_programs: {
    include: {
      study_program: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    }
  },
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true
    }
  }
}

const formatStudyProgramsForShow = (studyPrograms = []) =>
  studyPrograms.map((item) => ({
    id: item.study_program.id,
    name: item.study_program.name
  }))

const formatStudyProgramsForList = (studyPrograms = []) =>
  studyPrograms.map((item) => item.study_program.name)

const lecturerController = {
  create: async (req, res) => {
    try {
      const { nip, study_program_ids, user_id } = req.body || {}
      const uniqueStudyProgramIds = normalizeStudyProgramIds(study_program_ids)

      if (!nip || uniqueStudyProgramIds.length === 0 || !user_id) {
        return error(res, 'Missing required fields', 400)
      }

      const existingLecturer = await prisma.lecturer.findFirst({
        where: {
          OR: [{ nip }, { user_id }]
        }
      })

      if (existingLecturer) {
        if (existingLecturer.nip === nip) {
          return error(res, 'NIP already registered', 400)
        }
        if (existingLecturer.user_id === user_id) {
          return error(
            res,
            'User ID already associated with another lecturer',
            400
          )
        }
      }

      const userExists = await prisma.user.findUnique({
        where: { id: user_id }
      })

      if (!userExists) {
        return error(res, 'User not found', 400)
      }

      const studyPrograms = await prisma.studyProgram.findMany({
        where: {
          id: { in: uniqueStudyProgramIds }
        },
        select: {
          id: true
        }
      })

      if (studyPrograms.length !== uniqueStudyProgramIds.length) {
        return error(res, 'One or more study programs not found', 400)
      }

      await prisma.lecturer.create({
        data: {
          nip,
          user_id,
          study_programs: {
            create: uniqueStudyProgramIds.map((study_program_id) => ({
              study_program_id
            }))
          }
        }
      })

      await redisClient
        .del(`user:auth:${user_id}`)
        .catch((err) => console.error('Redis Del Error:', err))

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const { q, study_program } = req.query || {}
      const search = q?.trim()
      const studyProgramIds = study_program
        ?.split(',')
        .map((id) => id.trim())
        .filter(Boolean)
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      let where = {}

      if (search) {
        where.OR = [
          { nip: { contains: search, mode: 'insensitive' } },
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } }
        ]
      }

      if (studyProgramIds?.length) {
        where.study_programs = {
          some: {
            study_program_id: {
              in: studyProgramIds
            }
          }
        }
      }

      const [lecturers, total] = await Promise.all([
        prisma.lecturer.findMany({
          where,
          skip,
          take: perPage,
          include: includeLecturerRelations,
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.lecturer.count({ where })
      ])

      const formattedData = lecturers.map((lecturer) => ({
        id: lecturer.id,
        user_id: lecturer.user_id,
        name: lecturer.user?.name,
        email: lecturer.user?.email,
        nip: lecturer.nip,
        study_program: formatStudyProgramsForList(lecturer.study_programs),
        created_at: lecturer.created_at,
        updated_at: lecturer.updated_at
      }))

      const metadata = {
        per_page: perPage,
        current_page: page,
        total_row: total,
        total_page: Math.ceil(total / perPage)
      }

      return success(res, 'success', formattedData, 200, metadata)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const lecturer = await prisma.lecturer.findUnique({
        where: { id },
        include: includeLecturerRelations
      })

      if (!lecturer) return error(res, 'Lecturer not found', 404)

      const formattedData = {
        id: lecturer.id,
        nip: lecturer.nip,
        user_id: lecturer.user_id,
        name: lecturer.user?.name,
        email: lecturer.user?.email,
        study_program: formatStudyProgramsForShow(lecturer.study_programs),
        created_at: lecturer.created_at,
        updated_at: lecturer.updated_at
      }

      return success(res, 'success', formattedData)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { nip, study_program_ids, user_id } = req.body || {}
      const uniqueStudyProgramIds = study_program_ids
        ? normalizeStudyProgramIds(study_program_ids)
        : undefined

      const lecturerExists = await prisma.lecturer.findUnique({ where: { id } })
      if (!lecturerExists) return error(res, 'Lecturer not found', 404)

      if (nip || user_id) {
        const conflict = await prisma.lecturer.findFirst({
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
              'User ID already associated with another lecturer',
              400
            )
          }
        }
      }

      if (user_id) {
        const userExists = await prisma.user.findUnique({
          where: { id: user_id }
        })
        if (!userExists) {
          return error(res, 'User not found', 400)
        }
      }

      if (study_program_ids && uniqueStudyProgramIds.length === 0) {
        return error(res, 'At least one study program ID is required', 400)
      }

      if (uniqueStudyProgramIds) {
        const studyPrograms = await prisma.studyProgram.findMany({
          where: {
            id: { in: uniqueStudyProgramIds }
          },
          select: {
            id: true
          }
        })

        if (studyPrograms.length !== uniqueStudyProgramIds.length) {
          return error(res, 'One or more study programs not found', 400)
        }
      }

      let updateData = {
        nip,
        user_id
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      await prisma.$transaction(async (tx) => {
        await tx.lecturer.update({
          where: { id },
          data: updateData
        })

        if (uniqueStudyProgramIds) {
          await tx.lecturerStudyProgram.deleteMany({
            where: { lecturer_id: id }
          })

          await tx.lecturerStudyProgram.createMany({
            data: uniqueStudyProgramIds.map((study_program_id) => ({
              lecturer_id: id,
              study_program_id
            }))
          })
        }
      })

      await redisClient
        .del(`user:auth:${lecturerExists.user_id}`)
        .catch((err) => console.error('Redis Del Error:', err))

      if (user_id && user_id !== lecturerExists.user_id) {
        await redisClient
          .del(`user:auth:${user_id}`)
          .catch((err) => console.error('Redis Del Error:', err))
      }

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  delete: async (req, res) => {
    try {
      const { id } = req.params
      const lecturer = await prisma.lecturer.findUnique({ where: { id } })
      if (!lecturer) return error(res, 'Lecturer not found', 404)

      await prisma.lecturer.delete({ where: { id } })

      await redisClient
        .del(`user:auth:${lecturer.user_id}`)
        .catch((err) => console.error('Redis Del Error:', err))

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = lecturerController
