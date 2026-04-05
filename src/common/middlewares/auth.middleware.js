const jwt = require('jsonwebtoken')
const prisma = require('../../config/prisma')
const { error } = require('../../config/response')
const redisClient = require('../../config/redis')

const getRoleIdentity = (role = {}) =>
  (role.code || role.name || '')
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

const authMiddleware = async (req, res, next) => {
  try {
    // 1. Cek token di Cookie (Utama) atau Header (Cadangan)
    const token =
      req.cookies.accessToken || req.headers.authorization?.split(' ')[1]

    if (!token) return error(res, 'Unauthorized - Access token missing', 401)

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
    const userId = decoded.id
    const redisKey = `user:auth:${userId}`

    let user

    // 2. Cek Cache Redis
    try {
      const cachedUser = await redisClient.get(redisKey)
      if (cachedUser) {
        user = JSON.parse(cachedUser)
      }
    } catch (err) {
      console.error('Redis Get Error:', err)
    }

    if (!user) {
      // 3. Jika tidak ada di cache, ambil dari Database
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: {
                    include: { module: true }
                  }
                }
              }
            }
          },
          lecturer: true
        }
      })

      if (!user) return error(res, 'User not found', 401)

      // Simpan permissions ke dalam objek user agar konsisten
      user.permissions = user.role.permissions.map((rp) => rp.permission.name)

      // 4. Simpan ke Redis (Expire dalam 10 menit / 600 detik)
      try {
        await redisClient.set(redisKey, JSON.stringify(user), {
          EX: 600
        })
      } catch (err) {
        console.error('Redis Set Error:', err)
      }
    }

    req.user = user
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Access token expired', 401)
    }
    return error(res, 'Invalid token', 401)
  }
}

const checkPermission = (permissionName) => {
  return (req, res, next) => {
    if (
      getRoleIdentity(req.user.role) === 'SA' ||
      getRoleIdentity(req.user.role) === 'SUPER_ADMIN'
    )
      return next()

    if (!req.user.permissions.includes(permissionName)) {
      return error(res, "You don't have permission to access this module", 403)
    }
    next()
  }
}

const checkRoomAccess = async (req, res, next) => {
  const { room_id } = req.body || req.params || req.query // Menambahkan req.query untuk kelengkapan
  const user = req.user
  const roleIdentity = getRoleIdentity(user.role)

  if (['SA', 'SUPER_ADMIN', 'HLP', 'HELPER'].includes(roleIdentity)) {
    return next()
  }

  if (['DSN', 'DOSEN'].includes(roleIdentity)) {
    if (!user.lecturer) return error(res, 'Lecturer profile not found', 403)

    const activeSchedule = await prisma.schedule.findFirst({
      where: {
        lecturer_id: user.lecturer.id,
        room_id: room_id,
        status: true
      }
    })

    if (activeSchedule) return next()
  }

  return error(res, "You don't have active access to this room", 403)
}

module.exports = { authMiddleware, checkPermission, checkRoomAccess }
