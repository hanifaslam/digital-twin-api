const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const path = require('path')
const s3 = require('../../config/s3')
const { PutObjectCommand } = require('@aws-sdk/client-s3')
const redisClient = require('../../config/redis')
const S3_BUCKET = process.env.S3_BUCKET
const S3_ENDPOINT = process.env.S3_ENDPOINT

const getRoleIdentity = (role = {}) =>
  (role.code || role.name || '')
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

const ensureDashboardAccess = (modules) => {
  // If dashboard is already present in modules from the database, return as is
  if (modules.some((module) => module.code === 'dashboard')) {
    return modules
  }

  // Otherwise, always add it as the primary module
  return [
    {
      id: 'dashboard',
      name: 'Dashboard',
      code: 'dashboard',
      children: []
    },
    ...modules
  ]
}

const getUserScopes = async (user) => {
  const roleIdentity = getRoleIdentity(user.role)

  if (['SA', 'SUPER_ADMIN'].includes(roleIdentity)) {
    const [studyPrograms, buildings, lecturer] = await Promise.all([
      prisma.studyProgram.findMany({
        where: { status: true },
        select: {
          id: true,
          name: true
        },
        orderBy: { name: 'asc' }
      }),
      prisma.building.findMany({
        where: { status: true },
        select: {
          id: true,
          name: true
        },
        orderBy: { name: 'asc' }
      }),
      user.lecturer
        ? Promise.resolve(user.lecturer)
        : prisma.lecturer.findUnique({
            where: { user_id: user.id },
            select: { id: true, nip: true }
          })
    ])

    return {
      id: lecturer?.id || null,
      nip: lecturer?.nip || null,
      study_programs: studyPrograms,
      buildings
    }
  }

  if (['DSN', 'DOSEN'].includes(roleIdentity)) {
    const lecturer = user.lecturer?.study_programs
      ? user.lecturer
      : await prisma.lecturer.findUnique({
          where: { user_id: user.id },
          select: {
            id: true,
            nip: true,
            study_programs: {
              select: {
                study_program: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        })

    return {
      id: lecturer?.id || null,
      nip: lecturer?.nip || null,
      study_programs:
        lecturer?.study_programs?.map((item) => ({
          id: item.study_program.id,
          name: item.study_program.name
        })) || [],
      buildings: []
    }
  }

  if (['HLP', 'HELPER', 'HP'].includes(roleIdentity)) {
    const helper = user.helper?.buildings
      ? user.helper
      : await prisma.helper.findUnique({
          where: { user_id: user.id },
          select: {
            buildings: {
              select: {
                building: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        })

    return {
      study_programs: [],
      buildings:
        helper?.buildings?.map((item) => ({
          id: item.building.id,
          name: item.building.name
        })) || []
    }
  }

  return {
    study_programs: [],
    buildings: []
  }
}

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  )

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  )

  return { accessToken, refreshToken }
}

const login = async (req, res) => {
  try {
    const { login: username, password, remember_me } = req.body || {}

    const user = await prisma.user.findFirst({
      where: { username },
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
        lecturer: true,
        helper: true
      }
    })

    if (!user) return error(res, 'Invalid username or password', 401)

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return error(res, 'Invalid username or password', 401)

    const { accessToken, refreshToken } = generateTokens(user)

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/'
    }

    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000
    })

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: remember_me ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    })

    const scopes = await getUserScopes(user)
    return success(res, 'success', {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      profile_picture: user.profile_picture || null,
      role_name: user.role.name,
      role_id: user.role_id,
      role_code: user.role.code || null,
      lecturer_id: scopes.id || null,
      nip: scopes.nip || null,
      phone_number: user.lecturer?.phone_number || user.helper?.phone_number || null
    })
  } catch (err) {
    console.error(err)
    return error(res, 'Internal server error', 500)
  }
}

const refreshToken = async (req, res) => {
  try {
    const token = req.cookies.refreshToken
    if (!token) return error(res, 'Refresh token missing', 401)

    jwt.verify(token, process.env.JWT_REFRESH_SECRET, async (err, decoded) => {
      if (err) return error(res, 'Invalid refresh token', 403)

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { role: true }
      })

      if (!user) return error(res, 'User not found', 401)

      const accessToken = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      )

      // Update Access Token Cookie
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: 15 * 60 * 1000
      })

      return success(res, 'success')
    })
  } catch (err) {
    return error(res, 'Internal server error', 500)
  }
}

const getMe = async (req, res) => {
  try {
    const user = req.user

    const formatAccess = (permissions) => {
      const modules = {}

      permissions.forEach((rp) => {
        const p = rp.permission
        const m = p.module

        if (!modules[m.id]) {
          modules[m.id] = {
            id: m.id,
            name: m.name,
            code: m.code,
            sequence: m.sequence || 0,
            children: []
          }
        }

        if (m.code !== 'dashboard') {
          modules[m.id].children.push({
            id: p.id,
            name: p.name
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/\b\w/g, (l) => l.toUpperCase()),
            code: p.name.toLowerCase(),
            sequence: p.sequence || 0
          })
        }
      })

      return Object.values(modules)
        .map((m) => {
          const firstChild = m.children[0]

          const shouldCollapse = m.is_group === false

          if (shouldCollapse) {
            return {
              id: firstChild ? firstChild.id : m.id,
              name: m.name,
              code: m.code,
              sequence: m.sequence || 0,
              children: []
            }
          }

          return {
            id: m.id,
            name: m.name,
            code: m.code,
            sequence: m.sequence || 0,
            children: m.children
              .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
              .map(({ sequence, ...rest }) => rest)
          }
        })
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
        .map(({ sequence, ...rest }) => rest)
    }

    const access = ensureDashboardAccess(
      formatAccess(user.role.permissions),
      user.role.permissions,
      user.role
    )
    const scopes = await getUserScopes(user)

    return success(res, 'success', {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      profile_picture: user.profile_picture || null,
      role_name: user.role.name,
      role_id: user.role_id,
      role_code: user.role.code || null,
      lecturer_id: scopes.id || null,
      nip: scopes.nip || null,
      phone_number: user.lecturer?.phone_number || user.helper?.phone_number || null,
      study_programs: scopes.study_programs,
      buildings: scopes.buildings,
      access
    })
  } catch (err) {
    return error(res, 'Internal server error', 500)
  }
}

const logout = (req, res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/'
  }

  res.clearCookie('accessToken', cookieOptions)
  res.clearCookie('refreshToken', cookieOptions)

  return success(res, 'success')
}

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {}
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) return error(res, 'Email tidak terdaftar', 404)

    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 3600000) // 1 jam

    await prisma.user.update({
      where: { id: user.id },
      data: {
        reset_password_token: token,
        reset_password_expires: expires
      }
    })

    return success(res, 'Token reset password berhasil dibuat', { token })
  } catch (err) {
    console.error(err)
    return error(res, 'Internal server error', 500)
  }
}

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params
    const { password, confirm_password } = req.body || {}

    if (password !== confirm_password) {
      return error(res, 'Konfirmasi password tidak cocok', 400)
    }

    const user = await prisma.user.findFirst({
      where: {
        reset_password_token: token,
        reset_password_expires: { gte: new Date() }
      }
    })

    if (!user)
      return error(res, 'Token tidak valid atau sudah kadaluwarsa', 400)

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        reset_password_token: null,
        reset_password_expires: null
      }
    })

    return success(res, 'Password berhasil diperbarui')
  } catch (err) {
    console.error(err)
    return error(res, 'Internal server error', 500)
  }
}

const changePassword = async (req, res) => {
  try {
    const { old_password, new_password, confirm_password } = req.body || {}
    const user_id = req.user.id

    if (new_password !== confirm_password) {
      return error(res, 'Konfirmasi password baru tidak cocok', 400)
    }

    const user = await prisma.user.findUnique({ where: { id: user_id } })
    if (!user) return error(res, 'User tidak ditemukan', 404)

    const isMatch = await bcrypt.compare(old_password, user.password)
    if (!isMatch) return error(res, 'Password lama salah', 400)

    const hashedPassword = await bcrypt.hash(new_password, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    })

    await redisClient.del(`user:auth:${user_id}`)

    return success(res, 'Password berhasil diubah')
  } catch (err) {
    console.error(err)
    return error(res, 'Internal server error', 500)
  }
}

const updateProfile = async (req, res) => {
  try {
    const { name, email, phone_number } = req.body || {}
    const user_id = req.user.id

    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: { email, id: { not: user_id } }
      })
      if (existingUser) {
        return error(res, 'Email already in use', 400)
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: user_id },
      include: { lecturer: true, helper: true }
    })

    if (!user) return error(res, 'User not found', 404)

    await prisma.$transaction(async (tx) => {
      if (name !== undefined || email !== undefined) {
        await tx.user.update({
          where: { id: user_id },
          data: {
            ...(name !== undefined && { name }),
            ...(email !== undefined && { email })
          }
        })
      }

      if (phone_number !== undefined) {
        if (user.lecturer) {
          await tx.lecturer.update({
            where: { user_id: user_id },
            data: { phone_number }
          })
        } else if (user.helper) {
          await tx.helper.update({
            where: { user_id: user_id },
            data: { phone_number }
          })
        }
      }
    })

    await redisClient.del(`user:auth:${user_id}`)

    return success(res, 'Profile updated successfully')
  } catch (err) {
    console.error(err)
    return error(res, 'Internal server error', 500)
  }
}

const uploadProfilePhoto = async (req, res) => {
  try {
    const user_id = req.user.id
    const file = req.file

    if (!file) return error(res, 'Photo is required', 400)

    const ext = path.extname(file.originalname)
    const filename = `profiles/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: filename,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read'
      })
    )

    const imageUrl = `${S3_ENDPOINT}/${S3_BUCKET}/${filename}`

    await prisma.user.update({
      where: { id: user_id },
      data: { profile_picture: imageUrl }
    })

    await redisClient.del(`user:auth:${user_id}`)

    return success(res, 'Profile photo updated successfully', {
      profile_picture: imageUrl
    })
  } catch (err) {
    console.error('Upload Photo Error:', err)
    return error(res, 'Internal server error', 500)
  }
}

module.exports = {
  login,
  refreshToken,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  uploadProfilePhoto
}
