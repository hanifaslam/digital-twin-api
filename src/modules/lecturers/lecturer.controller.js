const bcrypt = require('bcryptjs')
const path = require('path')
const XLSX = require('xlsx')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const redisClient = require('../../config/redis')
const { buildPagination } = require('../../utils/pagination')
const { getIO } = require('../../config/socket')
const { getJakartaScheduleContext, getJakartaDayRange } = require('../../utils/date')
const { addActivityLog } = require('../../common/activity-log')
const { emitActivityLogUpdate } = require('../../config/socket')

const normalizeStudyProgramIds = (studyProgramIds) => [
  ...new Set((studyProgramIds || []).map((id) => id?.trim()).filter(Boolean))
]

const LECTURER_ROLE_CODES = ['DSN', 'DOSEN']
const DEFAULT_LECTURER_PASSWORD = 'Password123!'
const LECTURER_EMAIL_DOMAIN = 'polines.ac.id'
const LECTURER_TEMPLATE_PATH = path.join(
  process.cwd(),
  'lecturer_upload_template.xlsx'
)
const LECTURER_TEMPLATE_HEADERS = {
  nip: ['nip', 'nidn', 'nomor induk'],
  name: ['nama', 'nama dosen', 'lecturer name', 'name'],
  study_program_codes: [
    'kode program studi',
    'kode prodi',
    'study program code',
    'study_program_code',
    'study_program_codes'
  ],
  phone_number: [
    'no hp',
    'nomor hp',
    'phone',
    'phone number',
    'phone_number'
  ]
}

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

const findColumnValue = (row = {}, aliases = []) => {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [
    normalizeHeader(key),
    value
  ])

  for (const alias of aliases) {
    const found = normalizedEntries.find(([key]) => key === alias)
    if (found) {
      return found[1]
    }
  }

  return undefined
}

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

const buildNameSlug = (value) => {
  // Hapus gelar di belakang (setelah koma)
  let nameWithoutTitles = value ? String(value).split(',')[0] : ''
  // Hapus awalan gelar umum
  nameWithoutTitles = nameWithoutTitles.replace(/\b(prof|dr|ir|drs|dra|h|hj)\b\.?/gi, '')

  const normalized = normalizeName(nameWithoutTitles)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')

  return normalized || 'lecturer'
}

const splitStudyProgramCodes = (value) => [
  ...new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
  )
]

const ensureUniqueIdentity = async (tx, baseSlug) => {
  let suffix = 0

  while (true) {
    const username =
      suffix === 0 ? baseSlug : `${baseSlug}${String(suffix + 1)}`
    const emailLocalPart =
      suffix === 0 ? baseSlug : `${baseSlug}${String(suffix + 1)}`
    const email = `${emailLocalPart}@${LECTURER_EMAIL_DOMAIN}`

    const existingUser = await tx.user.findFirst({
      where: {
        OR: [{ username }, { email }]
      },
      select: { id: true }
    })

    if (!existingUser) {
      return { username, email }
    }

    suffix += 1
  }
}

const parseLecturerWorkbookRows = (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    return []
  }

  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false
  })

  return rows
    .map((row, index) => {
      const nip = String(
        findColumnValue(row, LECTURER_TEMPLATE_HEADERS.nip) || ''
      ).trim()
      const name = normalizeName(
        findColumnValue(row, LECTURER_TEMPLATE_HEADERS.name)
      )
      const studyProgramCodes = splitStudyProgramCodes(
        findColumnValue(row, LECTURER_TEMPLATE_HEADERS.study_program_codes)
      )
      const phoneNumber = String(
        findColumnValue(row, LECTURER_TEMPLATE_HEADERS.phone_number) || ''
      ).trim()

      return {
        row_number: index + 2,
        nip,
        name,
        study_program_codes: studyProgramCodes,
        phone_number: phoneNumber || null
      }
    })
    .filter(
      (row) =>
        row.nip ||
        row.name ||
        row.study_program_codes.length > 0 ||
        row.phone_number
    )
}

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
      status: true,
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

const formatImportedLecturer = (lecturer) => ({
  id: lecturer.id,
  nip: lecturer.nip,
  name: lecturer.user?.name || null,
  username: lecturer.user?.username || null,
  email: lecturer.user?.email || null,
  phone_number: lecturer.phone_number,
  study_programs: formatStudyProgramsForShow(lecturer.study_programs)
})

const lecturerController = {
  downloadTemplate: async (req, res) => {
    try {
      return res.download(
        LECTURER_TEMPLATE_PATH,
        'lecturer_upload_template.xlsx'
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  create: async (req, res) => {
    try {
      const { nip, study_program_ids, user_id, phone_number } = req.body || {}
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
          phone_number,
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

  uploadExcel: async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return error(res, 'Excel file is required', 400)
      }

      let rows = []

      try {
        rows = parseLecturerWorkbookRows(req.file.buffer)
      } catch (parseError) {
        return error(
          res,
          `Failed to read Excel file: ${parseError.message}`,
          400
        )
      }

      if (rows.length === 0) {
        return error(res, 'Excel file has no lecturer rows to import', 400)
      }

      const duplicateNipsInFile = new Set()
      const seenNips = new Set()

      rows.forEach((row) => {
        if (!row.nip) return
        if (seenNips.has(row.nip)) {
          duplicateNipsInFile.add(row.nip)
          return
        }
        seenNips.add(row.nip)
      })

      const role = await prisma.role.findFirst({
        where: {
          code: { in: LECTURER_ROLE_CODES }
        },
        select: { id: true, code: true }
      })

      if (!role) {
        return error(res, 'Lecturer role not found', 400)
      }

      const uniqueStudyProgramCodes = [
        ...new Set(
          rows.flatMap((row) => row.study_program_codes).filter(Boolean)
        )
      ]
      const studyPrograms = await prisma.studyProgram.findMany({
        where: {
          code: { in: uniqueStudyProgramCodes }
        },
        select: {
          id: true,
          code: true,
          name: true
        }
      })
      const studyProgramMap = new Map(
        studyPrograms.map((item) => [item.code.toUpperCase(), item])
      )

      const existingLecturers = await prisma.lecturer.findMany({
        where: {
          nip: { in: rows.map((row) => row.nip).filter(Boolean) }
        },
        select: {
          nip: true,
          user: {
            select: {
              name: true
            }
          }
        }
      })
      const existingLecturerMap = new Map(
        existingLecturers.map((item) => [item.nip, item])
      )

      const skipped = []
      const validRows = []

      rows.forEach((row) => {
        const rowErrors = []

        if (!row.nip) {
          rowErrors.push('NIP is required')
        }

        if (!row.name) {
          rowErrors.push('Name is required')
        }

        if (row.study_program_codes.length === 0) {
          rowErrors.push('At least one study program code is required')
        }

        if (row.nip && duplicateNipsInFile.has(row.nip)) {
          rowErrors.push('Duplicate NIP found in the uploaded file')
        }

        const missingStudyPrograms = row.study_program_codes.filter(
          (code) => !studyProgramMap.has(code)
        )

        if (missingStudyPrograms.length > 0) {
          rowErrors.push(
            `Study program code not found: ${missingStudyPrograms.join(', ')}`
          )
        }

        const existingLecturer = existingLecturerMap.get(row.nip)

        if (existingLecturer) {
          skipped.push({
            row_number: row.row_number,
            nip: row.nip,
            name: row.name,
            reason: `Lecturer with NIP ${row.nip} already exists`
          })
          return
        }

        if (rowErrors.length > 0) {
          skipped.push({
            row_number: row.row_number,
            nip: row.nip || null,
            name: row.name || null,
            reason: rowErrors.join('; ')
          })
          return
        }

        validRows.push({
          ...row,
          study_program_ids: row.study_program_codes.map(
            (code) => studyProgramMap.get(code).id
          )
        })
      })

      if (validRows.length === 0) {
        return error(
          res,
          'No valid lecturer rows found in the uploaded file',
          400
        )
      }

      const passwordHash = await bcrypt.hash(DEFAULT_LECTURER_PASSWORD, 10)
      const createdLecturers = await prisma.$transaction(async (tx) => {
        const created = []

        for (const row of validRows) {
          const baseSlug = buildNameSlug(row.name)
          const { username, email } = await ensureUniqueIdentity(tx, baseSlug)

          const user = await tx.user.create({
            data: {
              name: row.name,
              username,
              email,
              password: passwordHash,
              role_id: role.id
            }
          })

          const lecturer = await tx.lecturer.create({
            data: {
              nip: row.nip,
              user_id: user.id,
              phone_number: row.phone_number,
              study_programs: {
                create: row.study_program_ids.map((study_program_id) => ({
                  study_program_id
                }))
              }
            },
            include: includeLecturerRelations
          })

          created.push(lecturer)
        }

        return created
      })

      const responseData = {
        default_password: DEFAULT_LECTURER_PASSWORD,
        auto_email_domain: LECTURER_EMAIL_DOMAIN,
        lecturer_role_code: role.code,
        created_count: createdLecturers.length,
        skipped_count: skipped.length,
        created: createdLecturers.map(formatImportedLecturer),
        skipped
      }

      const message =
        skipped.length > 0
          ? 'Lecturer import completed with some skipped rows'
          : 'Lecturer import completed successfully'

      return success(res, message, responseData, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllActive: async (req, res) => {
    try {
      const { study_program_id } = req.query || {}

      const where = {
        ...(study_program_id
          ? {
              study_programs: {
                some: { study_program_id }
              }
            }
          : {})
      }

      const lecturers = await prisma.lecturer.findMany({
        where,
        select: {
          id: true,
          nip: true,
          user: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { user: { name: 'asc' } }
      })

      return success(
        res,
        'success',
        lecturers.map((lecturer) => ({
          id: lecturer.id,
          nip: lecturer.nip,
          name: lecturer.user?.name || null
        }))
      )
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
        status: lecturer.user?.status ?? false,
        nip: lecturer.nip,
        phone_number: lecturer.phone_number,
        study_program: formatStudyProgramsForList(lecturer.study_programs),
        created_at: lecturer.created_at,
        updated_at: lecturer.updated_at
      }))

      const metadata = buildPagination(page, perPage, total)

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
        status: lecturer.user?.status ?? false,
        phone_number: lecturer.phone_number,
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
      const { nip, study_program_ids, user_id, phone_number } = req.body || {}
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
        user_id,
        phone_number
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      if (
        Object.keys(updateData).length === 0 &&
        uniqueStudyProgramIds === undefined
      ) {
        return error(res, 'No valid fields provided for update', 400)
      }

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
  },

  overrideStatus: async (req, res) => {
    try {
      const { status } = req.body
      const lecturerId = req.user.lecturer?.id

      if (!lecturerId) return error(res, 'Lecturer profile not found', 403)
      if (!['AVAILABLE', 'BUSY', 'OFFLINE'].includes(status)) {
        return error(
          res,
          'Invalid status. Use AVAILABLE, BUSY, or OFFLINE',
          400
        )
      }

      const updated = await prisma.lecturer.update({
        where: { id: lecturerId },
        data: {
          status: status,
          is_manual: true,
          overridden_at: new Date()
        }
      })

      try {
        getIO().emit('lecturer-status-updated', {
          id: updated.id,
          status: updated.status,
          is_manual: updated.is_manual
        })
      } catch (e) {
        console.error('Socket Emit Error:', e.message)
      }

      emitActivityLogUpdate(
        addActivityLog({
          category: 'PRESENCE',
          message: `Lecturer status manually set to ${updated.status}.`
        })
      )

      return success(res, `success`, null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getPublicLecturers: async (req, res) => {
    try {
      const { id: room_id } = req.params
      const search = req.query?.q?.trim()
      if (!room_id) {
        return error(res, 'room_id path parameter is required', 400)
      }

      const { currentDay, currentTime } = getJakartaScheduleContext()
      const { start: startOfDay } = getJakartaDayRange()

      const lecturers = await prisma.lecturer.findMany({
        where: {
          AND: [
            {
              user: {
                role: {
                  code: {
                    notIn: ['SA', 'SUPER_ADMIN', 'AD']
                  }
                }
              }
            },
            {
              OR: [
                ...(currentDay
                  ? [
                      {
                        // Dosen yang sedang mengajar di ruangan ini sekarang
                        schedules: {
                          some: {
                            room_id: room_id,
                            day: currentDay,
                            status: true,
                            time_slot: {
                              start_time: { lte: currentTime },
                              end_time: { gte: currentTime }
                            }
                          }
                        }
                      }
                    ]
                  : []),
                {
                  // Dosen yang ruangan aslinya (home room) adalah ruangan ini
                  study_programs: {
                    some: {
                      study_program: {
                        home_room_id: room_id
                      }
                    }
                  }
                }
              ]
            },
            ...(search
              ? [
                  {
                    OR: [
                      {
                        user: {
                          name: {
                            contains: search,
                            mode: 'insensitive'
                          }
                        }
                      },
                      {
                        nip: {
                          contains: search,
                          mode: 'insensitive'
                        }
                      },
                      {
                        status: {
                          contains: search,
                          mode: 'insensitive'
                        }
                      },
                      {
                        schedules: {
                          some: {
                            room_id: room_id,
                            day: currentDay || undefined,
                            status: true,
                            course: {
                              name: {
                                contains: search,
                                mode: 'insensitive'
                              }
                            }
                          }
                        }
                      }
                    ]
                  }
                ]
              : [])
          ]
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              profile_picture: true
            }
          },
          study_programs: {
            include: {
              study_program: {
                select: {
                  id: true,
                  name: true,
                  home_room_id: true
                }
              }
            }
          },
          schedules: {
            where: {
              day: currentDay || undefined,
              status: true
            },
            include: {
              room: {
                include: {
                  building: true,
                  floor: true
                }
              },
              time_slot: true,
              course: true
            }
          },
          attendances: {
            where: {
              room_id: room_id,
              check_in_at: {
                gte: startOfDay
              }
            },
            orderBy: {
              check_in_at: 'desc'
            },
            take: 1
          }
        },
        orderBy: {
          user: {
            name: 'asc'
          }
        }
      })

      const formattedLecturers = lecturers.map((lecturer) => {
        const activeSchedule = lecturer.schedules.find((s) => {
          const { start_time, end_time } = s.time_slot
          return currentTime >= start_time && currentTime <= end_time
        })

        // Tentukan apakah dosen ini "milik" ruangan ini lewat jadwal atau home room
        const isInRoomBySchedule = activeSchedule?.room_id === room_id

        let roomType = 'HOME'
        let courseName = null

        if (isInRoomBySchedule) {
          roomType = 'SCHEDULED'
          courseName = activeSchedule.course.name
        }

        const latestAttendance = lecturer.attendances[0]
        let presentSince = latestAttendance ? latestAttendance.check_in_at : null

        if (!presentSince && ['AVAILABLE', 'BUSY'].includes(lecturer.status) && lecturer.is_manual) {
          presentSince = lecturer.overridden_at
        }

        return {
          id: lecturer.id,
          name: lecturer.user?.name,
          nip: lecturer.nip,
          phone_number: lecturer.phone_number,
          profile_picture: lecturer.user?.profile_picture || null,
          status: lecturer.status, // AVAILABLE, BUSY, OFFLINE
          room_type: roomType,
          course: courseName,
          present_since: presentSince
        }
      })

      const statusPriority = {
        AVAILABLE: 0,
        BUSY: 1,
        OFFLINE: 2
      }

      formattedLecturers.sort((a, b) => {
        const statusDiff =
          (statusPriority[a.status] ?? Number.MAX_SAFE_INTEGER) -
          (statusPriority[b.status] ?? Number.MAX_SAFE_INTEGER)

        if (statusDiff !== 0) return statusDiff
        return (a.name || '').localeCompare(b.name || '', 'id', {
          sensitivity: 'base'
        })
      })

      return success(res, 'success', formattedLecturers)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = lecturerController
