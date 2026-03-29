const prisma = require('../../config/prisma')
const bcrypt = require('bcryptjs')
const { success, error } = require('../../config/response')
const redisClient = require('../../config/redis')

const userController = {
  create: async (req, res) => {
    try {
      const {
        name,
        username,
        email,
        password,
        confirm_password,
        role_id,
        status
      } = req.body || {}

      if (!name || !username || !email || !password || !role_id) {
        return error(res, 'Missing required fields', 400)
      }

      if (password !== confirm_password) {
        return error(res, 'Password and confirm password do not match', 400)
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { username }]
        }
      })

      if (existingUser) {
        if (existingUser.email === email) {
          return error(res, 'Email already registered', 400)
        }
        if (existingUser.username === username) {
          return error(res, 'Username already taken', 400)
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10)

      const roleExists = await prisma.role.findUnique({
        where: { id: role_id }
      })

      if (!roleExists) {
        return error(res, 'Role not found', 400)
      }

      await prisma.user.create({
        data: {
          name,
          username,
          email,
          password: hashedPassword,
          role_id,
          status: status !== undefined ? status : true
        }
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllUsers: async (req, res) => {
    try {
      const { role } = req.query || {}
      const where = {
        status: true,
        lecturer: null
      }

      if (role) {
        where.role = {
          code: role
        }
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true
        },
        orderBy: {
          name: 'asc'
        }
      })

      return success(res, 'success', users)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const { q, status, role } = req.query || {}
      const statuses = [
        ...new Set(
          status
            ?.split(',')
            .map((item) => item.trim().toLowerCase())
            .filter((item) => item === 'true' || item === 'false')
        )
      ]
      const roleIds = role
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      let where = {}

      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } }
        ]
      }

      if (statuses?.length === 1) {
        where.status = statuses[0] === 'true'
      }

      if (roleIds?.length === 1) {
        where.role_id = roleIds[0]
      }

      if (roleIds?.length > 1) {
        where.role_id = {
          in: roleIds
        }
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: perPage,
          include: {
            role: true
          },
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.user.count({ where })
      ])

      const formattedData = users.map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role_name: user.role?.name || null,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at
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
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          role: true
        }
      })

      if (!user) return error(res, 'User not found', 404)

      const formattedUser = {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role?.name,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at
      }

      return success(res, 'success', formattedUser)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, username, email, role_id, status } = req.body || {}

      const userExists = await prisma.user.findUnique({ where: { id } })
      if (!userExists) return error(res, 'User not found', 404)

      if (email || username) {
        const conflict = await prisma.user.findFirst({
          where: {
            OR: [
              email ? { email } : null,
              username ? { username } : null
            ].filter(Boolean),
            NOT: { id }
          }
        })

        if (conflict) {
          if (email && conflict.email === email) {
            return error(res, 'Email already registered', 400)
          }
          if (username && conflict.username === username) {
            return error(res, 'Username already taken', 400)
          }
        }
      }

      if (role_id) {
        const roleExists = await prisma.role.findUnique({
          where: { id: role_id }
        })
        if (!roleExists) {
          return error(res, 'Role not found', 400)
        }
      }

      let updateData = {
        name,
        username,
        email,
        role_id,
        status
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      await prisma.user.update({
        where: { id },
        data: updateData
      })

      // Invalidate Redis cache
      await redisClient
        .del(`user:auth:${id}`)
        .catch((err) => console.error('Redis Del Error:', err))

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({ where: { id } })
      if (!user) return error(res, 'User not found', 404)

      const newStatus = !user.status

      await prisma.user.update({
        where: { id },
        data: { status: newStatus }
      })

      // Invalidate Redis cache
      await redisClient
        .del(`user:auth:${id}`)
        .catch((err) => console.error('Redis Del Error:', err))

      return success(res, 'success')
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  resetPassword: async (req, res) => {
    try {
      const { id } = req.params
      const { new_password, confirm_password } = req.body || {}

      if (!new_password || !confirm_password) {
        return error(res, 'Missing required fields', 400)
      }

      if (new_password !== confirm_password) {
        return error(res, 'Password and confirm password do not match', 400)
      }

      const userExists = await prisma.user.findUnique({ where: { id } })
      if (!userExists) return error(res, 'User not found', 404)

      const hashedPassword = await bcrypt.hash(new_password, 10)

      await prisma.user.update({
        where: { id },
        data: { password: hashedPassword }
      })

      // Invalidate Redis cache
      await redisClient
        .del(`user:auth:${id}`)
        .catch((err) => console.error('Redis Del Error:', err))

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = userController
