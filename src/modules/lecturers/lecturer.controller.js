const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const redisClient = require('../../config/redis')

const lecturerController = {
  create: async (req, res) => {
    try {
      const { nip, study_program_id, user_id } = req.body || {}

      if (!nip || !study_program_id || !user_id) {
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

      const lecturer = await prisma.lecturer.create({
        data: {
          nip,
          study_program_id,
          user_id
        }
      })

      // Invalidate associated user cache
      await redisClient.del(`user:auth:${user_id}`).catch((err) => console.error('Redis Del Error:', err))

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const { q } = req.query || {}
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      let where = {}

      if (q) {
        where.OR = [
          { nip: { contains: q, mode: 'insensitive' } },
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } }
        ]
      }

      const [lecturers, total] = await Promise.all([
        prisma.lecturer.findMany({
          where,
          skip,
          take: perPage,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
                role: true
              }
            }
          },
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.lecturer.count({ where })
      ])

      const formattedData = lecturers.map((lecturer) => ({
        id: lecturer.id,
        study_program_id: lecturer.study_program_id,
        user_id: lecturer.user_id,
        name: lecturer.user?.name,
        email: lecturer.user?.email,
        nip: lecturer.nip,
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
        include: {
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
      })

      if (!lecturer) return error(res, 'Lecturer not found', 404)

      const formattedData = {
        id: lecturer.id,
        nip: lecturer.nip,
        study_program_id: lecturer.study_program_id,
        user_id: lecturer.user_id,
        name: lecturer.user?.name,
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
      const { nip, study_program_id, user_id } = req.body || {}

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

      let updateData = {
        nip,
        study_program_id,
        user_id
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      await prisma.lecturer.update({
        where: { id },
        data: updateData
      })

      // Invalidate current associated user cache
      await redisClient.del(`user:auth:${lecturerExists.user_id}`).catch((err) => console.error('Redis Del Error:', err))
      
      // If user_id was changed, also invalidate the new user's cache
      if (user_id && user_id !== lecturerExists.user_id) {
        await redisClient.del(`user:auth:${user_id}`).catch((err) => console.error('Redis Del Error:', err))
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

      // Invalidate associated user cache
      await redisClient.del(`user:auth:${lecturer.user_id}`).catch((err) => console.error('Redis Del Error:', err))

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = lecturerController
