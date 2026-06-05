const bcrypt = require('bcryptjs')
const { Day } = require('@prisma/client')
const path = require('path')
const XLSX = require('xlsx')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

const SCHEDULE_TEMPLATE_PATH = path.join(process.cwd(), 'format_schedule.xlsx')
const DEFAULT_LECTURER_PASSWORD = 'Password123!'
const LECTURER_ROLE_CODES = ['DSN', 'DOSEN']
const PLACEHOLDER_LECTURER_NAME = 'Tim Prodi'
const DAY_NAME_MAP = {
  MONDAY: Day.MONDAY,
  TUESDAY: Day.TUESDAY,
  WEDNESDAY: Day.WEDNESDAY,
  THURSDAY: Day.THURSDAY,
  FRIDAY: Day.FRIDAY,
  SENIN: Day.MONDAY,
  SELASA: Day.TUESDAY,
  RABU: Day.WEDNESDAY,
  KAMIS: Day.THURSDAY,
  "JUM'AT": Day.FRIDAY,
  JUMAT: Day.FRIDAY,
  JUMATK: Day.FRIDAY
}

const normalizeCellText = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

const normalizeComparableText = (value) => normalizeCellText(value).toLowerCase()

const buildNameSlug = (value) => {
  const normalized = normalizeCellText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')

  return normalized || 'lecturer'
}

const normalizeTimeRange = (value) => {
  const normalized = normalizeCellText(value).replace(/\./g, ':')
  const match = normalized.match(
    /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i
  )

  if (!match) {
    return null
  }

  const formatPart = (part) => {
    const [hours, minutes] = part.split(':').map(Number)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  return {
    start_time: formatPart(match[1]),
    end_time: formatPart(match[2])
  }
}

const normalizeScheduleDay = (value) => {
  const normalized = normalizeCellText(value).toUpperCase()
  return DAY_NAME_MAP[normalized] || null
}

const parseSemesterValue = (value) => {
  const normalized = normalizeCellText(value)
  const match = normalized.match(/semester\s*(\d+)/i)

  if (!match) {
    return null
  }

  const semesterNumber = Number(match[1])

  if (semesterNumber < 1 || semesterNumber > 8) {
    return null
  }

  return `SEMESTER_${semesterNumber}`
}

const isBreakRow = (row = []) => {
  const courseCode = normalizeComparableText(row[3])
  const courseName = normalizeComparableText(row[4])

  return courseCode === 'istirahat' || courseName === 'istirahat'
}

const isHeaderRow = (row = []) =>
  normalizeComparableText(row[0]) === 'hari' &&
  normalizeComparableText(row[1]) === 'jam ke'

const isMeaningfulRow = (row = []) =>
  row.some((value) => normalizeCellText(value).length > 0)

const parseScheduleWorkbook = (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    return null
  }

  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false
  })

  const studyProgramName = normalizeCellText(rows[0]?.[0])
  const className = normalizeCellText(rows[1]?.[0])
  const semester = parseSemesterValue(rows[2]?.[0])
  const scheduleRows = []
  let currentDay = null

  for (let index = 3; index < rows.length; index += 1) {
    const row = rows[index] || []

    if (!isMeaningfulRow(row) || isHeaderRow(row) || isBreakRow(row)) {
      continue
    }

    const rowDay = normalizeScheduleDay(row[0])

    if (rowDay) {
      currentDay = rowDay
    }

    const jamKe = normalizeCellText(row[1])
    const timeRange = normalizeTimeRange(row[2])
    const courseCode = normalizeCellText(row[3])
    const courseName = normalizeCellText(row[4])
    const lecturerName = normalizeCellText(row[5])
    const roomName = normalizeCellText(row[7])

    scheduleRows.push({
      row_number: index + 1,
      day: currentDay,
      jam_ke: jamKe,
      time_range: timeRange,
      course_code: courseCode,
      course_name: courseName,
      lecturer_name: lecturerName,
      room_name: roomName
    })
  }

  return {
    sheet_name: sheetName,
    study_program_name: studyProgramName,
    class_name: className,
    semester,
    rows: scheduleRows
  }
}

const scheduleInclude = {
  study_program: {
    select: {
      id: true,
      name: true,
      code: true
    }
  },
  class: {
    select: {
      id: true,
      name: true,
      study_program_id: true
    }
  },
  room: {
    select: {
      id: true,
      name: true,
      building: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  lecturer: {
    select: {
      id: true,
      nip: true,
      user: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  course: {
    select: {
      id: true,
      code: true,
      name: true,
      semester: true,
      study_program_id: true
    }
  },
  time_slot: {
    select: {
      id: true,
      name: true,
      start_time: true,
      end_time: true
    }
  }
}

const formatSchedule = (item) => ({
  id: item.id,
  study_program_id: item.study_program_id,
  study_program_name: item.study_program?.name || null,
  class_id: item.class_id,
  class_name: item.class?.name || null,
  room_id: item.room_id,
  room_name: item.room?.name || null,
  building_id: item.room?.building?.id || null,
  building_name: item.room?.building?.name || null,
  lecturer_id: item.lecturer_id,
  lecturer_name: item.lecturer?.user?.name || null,
  lecturer_nip: item.lecturer?.nip || null,
  course_id: item.course_id,
  course_code: item.course?.code || null,
  course_name: item.course?.name || null,
  time_slot_id: item.time_slot_id,
  time_slot_name: item.time_slot?.name || null,
  start_time: item.time_slot?.start_time || null,
  end_time: item.time_slot?.end_time || null,
  day: item.day,
  status: item.status,
  created_at: item.created_at,
  updated_at: item.updated_at
})

const formatScheduleDetail = (schedules = []) => {
  if (schedules.length === 0) {
    return null
  }

  const sortedSchedules = [...schedules].sort(
    (a, b) =>
      toMinutes(a.time_slot?.start_time || '00:00') -
      toMinutes(b.time_slot?.start_time || '00:00')
  )
  const firstItem = sortedSchedules[0]
  const timeSlots = sortedSchedules.map((item) => ({
    id: item.time_slot_id,
    name: item.time_slot?.name || null
  }))

  return {
    id: firstItem.id,
    study_program_id: firstItem.study_program_id,
    study_program_name: firstItem.study_program?.name || null,
    class_id: firstItem.class_id,
    class_name: firstItem.class?.name || null,
    room_id: firstItem.room_id,
    room_name: firstItem.room?.name || null,
    lecturer_id: firstItem.lecturer_id,
    lecturer_name: firstItem.lecturer?.user?.name || null,
    course_id: firstItem.course_id,
    course_name: firstItem.course?.name || null,
    time_slots: timeSlots,
    day: firstItem.day,
    status: firstItem.status,
    created_at: sortedSchedules.reduce(
      (earliest, item) =>
        new Date(item.created_at) < new Date(earliest)
          ? item.created_at
          : earliest,
      firstItem.created_at
    ),
    updated_at: sortedSchedules.reduce(
      (latest, item) =>
        new Date(item.updated_at) > new Date(latest) ? item.updated_at : latest,
      firstItem.updated_at
    )
  }
}

const buildPlaceholderLecturerIdentity = (studyProgramName) => {
  const baseSlug = buildNameSlug(
    `${PLACEHOLDER_LECTURER_NAME}.${studyProgramName || 'study-program'}`
  )

  return {
    username: baseSlug,
    email: `${baseSlug}@polines.ac.id`,
    nip: `TPL-${baseSlug.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`
  }
}

const normalizeTimeSlotIds = (timeSlotId) => [
  ...new Set(
    (Array.isArray(timeSlotId) ? timeSlotId : [timeSlotId])
      .map((item) => item?.trim())
      .filter(Boolean)
  )
]

const toMinutes = (value) => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

const buildScheduleWhere = (query = {}) => {
  const {
    q,
    status,
    study_program_id,
    class_id,
    room_id,
    lecturer_id,
    course_id,
    time_slot_id,
    day
  } = query
  const statuses = [
    ...new Set(
      status
        ?.split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item === 'true' || item === 'false')
    )
  ]
  const where = {}

  if (q) {
    where.OR = [
      { study_program: { name: { contains: q, mode: 'insensitive' } } },
      { class: { name: { contains: q, mode: 'insensitive' } } },
      { room: { name: { contains: q, mode: 'insensitive' } } },
      {
        lecturer: { user: { name: { contains: q, mode: 'insensitive' } } }
      },
      { lecturer: { nip: { contains: q, mode: 'insensitive' } } },
      { course: { name: { contains: q, mode: 'insensitive' } } },
      { course: { code: { contains: q, mode: 'insensitive' } } },
      { time_slot: { name: { contains: q, mode: 'insensitive' } } }
    ]
  }

  if (statuses.length === 1) {
    where.status = statuses[0] === 'true'
  }

  if (study_program_id) {
    where.study_program_id = study_program_id
  }

  if (class_id) {
    where.class_id = class_id
  }

  if (room_id) {
    where.room_id = room_id
  }

  if (lecturer_id) {
    where.lecturer_id = lecturer_id
  }

  if (course_id) {
    where.course_id = course_id
  }

  if (time_slot_id) {
    where.time_slot_id = time_slot_id
  }

  if (day) {
    where.day = day
  }

  return where
}

const buildGroupedTimeLabel = (timeSlots = []) => {
  if (timeSlots.length === 0) {
    return null
  }

  const mergedRanges = []
  let currentRange = {
    start_time: timeSlots[0].start_time || '-',
    end_time: timeSlots[0].end_time || '-'
  }

  timeSlots.slice(1).forEach((slot) => {
    if (currentRange.end_time === (slot.start_time || '-')) {
      currentRange.end_time = slot.end_time || currentRange.end_time
      return
    }

    mergedRanges.push(
      `${currentRange.start_time || '-'}-${currentRange.end_time || '-'}`
    )

    currentRange = {
      start_time: slot.start_time || '-',
      end_time: slot.end_time || '-'
    }
  })

  mergedRanges.push(
    `${currentRange.start_time || '-'}-${currentRange.end_time || '-'}`
  )

  return mergedRanges.join(', ')
}

const DAY_ORDER = Object.values(Day)

const toTitleCase = (str) => str.charAt(0) + str.slice(1).toLowerCase()

const allDays = DAY_ORDER.map((day) => ({
  value: day,
  label: toTitleCase(day)
}))

const groupSchedules = (schedules = []) => {
  const grouped = new Map()

  schedules.forEach((item) => {
    const key = [
      item.study_program_id,
      item.class_id,
      item.room_id,
      item.lecturer_id,
      item.course_id,
      item.day,
      item.status
    ].join(':')

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: item.id,
        study_program_name: item.study_program?.name || null,
        class_name: item.class?.name || null,
        room_name: item.room?.name || null,
        building_name: item.room?.building?.name || null,
        lecturer_name: item.lecturer?.user?.name || null,
        course_name: item.course?.name || null,
        day: item.day,
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at,
        time_slots: []
      })
    }

    const currentGroup = grouped.get(key)

    currentGroup.time_slots.push({
      start_time: item.time_slot?.start_time || null,
      end_time: item.time_slot?.end_time || null
    })

    if (new Date(item.created_at) < new Date(currentGroup.created_at)) {
      currentGroup.created_at = item.created_at
    }

    if (new Date(item.updated_at) > new Date(currentGroup.updated_at)) {
      currentGroup.updated_at = item.updated_at
    }
  })

  return Array.from(grouped.values())
    .map((group) => {
      const sortedTimeSlots = group.time_slots.sort(
        (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)
      )

      return {
        ...group,
        sort_start_minutes: toMinutes(
          sortedTimeSlots[0]?.start_time || '00:00'
        ),
        time_label: buildGroupedTimeLabel(sortedTimeSlots)
      }
    })
    .sort((a, b) => {
      if (a.study_program_name !== b.study_program_name) {
        return (a.study_program_name || '').localeCompare(
          b.study_program_name || ''
        )
      }

      if (a.class_name !== b.class_name) {
        return (a.class_name || '').localeCompare(b.class_name || '')
      }

      return a.sort_start_minutes - b.sort_start_minutes
    })
    .map(({ time_slots, sort_start_minutes, ...group }) => group)
}

const buildScheduleGroupWhere = (schedule, options = {}) => {
  const { includeStatus = false } = options

  if (!schedule) {
    return null
  }

  const where = {
    study_program_id: schedule.study_program_id,
    class_id: schedule.class_id,
    room_id: schedule.room_id,
    lecturer_id: schedule.lecturer_id,
    course_id: schedule.course_id,
    day: schedule.day
  }

  if (includeStatus) {
    where.status = schedule.status
  }

  return where
}

const findScheduleGroup = async (db, schedule, options = {}) => {
  const { include, select, orderBy, includeStatus = false } = options
  const where = buildScheduleGroupWhere(schedule, { includeStatus })

  if (!where) {
    return []
  }

  return db.schedule.findMany({
    where,
    ...(include ? { include } : {}),
    ...(select ? { select } : {}),
    ...(orderBy ? { orderBy } : {})
  })
}

const areTimeSlotSetsEqual = (currentTimeSlotIds = [], targetTimeSlotIds = []) => {
  if (currentTimeSlotIds.length !== targetTimeSlotIds.length) {
    return false
  }

  const currentSorted = [...new Set(currentTimeSlotIds)].sort()
  const targetSorted = [...new Set(targetTimeSlotIds)].sort()

  if (currentSorted.length !== targetSorted.length) {
    return false
  }

  return currentSorted.every((timeSlotId, index) => timeSlotId === targetSorted[index])
}

const findScheduleConflict = async ({
  db = prisma,
  id,
  exclude_ids,
  study_program_id,
  class_id,
  room_id,
  lecturer_id,
  course_id,
  time_slot_id,
  day
}) => {
  if (
    !study_program_id ||
    !class_id ||
    !room_id ||
    !lecturer_id ||
    !course_id ||
    !time_slot_id ||
    !day
  ) {
    return null
  }

  const excludeFilter = exclude_ids?.length
    ? { id: { notIn: exclude_ids } }
    : id
      ? { NOT: { id } }
      : {}

  const [duplicate, roomConflict, lecturerConflict] = await Promise.all([
    db.schedule.findFirst({
      where: {
        study_program_id,
        class_id,
        room_id,
        lecturer_id,
        course_id,
        time_slot_id,
        day,
        ...excludeFilter
      }
    }),
    db.schedule.findFirst({
      where: { room_id, time_slot_id, day, ...excludeFilter }
    }),
    db.schedule.findFirst({
      where: { lecturer_id, time_slot_id, day, ...excludeFilter }
    })
  ])

  if (duplicate) return { type: 'duplicate' }
  if (roomConflict) return { type: 'room' }
  if (lecturerConflict) return { type: 'lecturer' }
  return null
}

const validateScheduleRelations = async ({
  db = prisma,
  study_program_id,
  class_id,
  room_id,
  lecturer_id,
  course_id,
  time_slot_id
}) => {
  const [studyProgram, classData, room, lecturer, course, timeSlot] =
    await Promise.all([
      db.studyProgram.findUnique({
        where: { id: study_program_id },
        select: { id: true, status: true }
      }),
      db.class.findUnique({
        where: { id: class_id },
        select: { id: true, status: true, study_program_id: true }
      }),
      db.room.findUnique({
        where: { id: room_id },
        select: { id: true, status: true }
      }),
      db.lecturer.findUnique({
        where: { id: lecturer_id },
        select: {
          id: true,
          study_programs: {
            where: { study_program_id },
            select: { study_program_id: true }
          }
        }
      }),
      db.course.findUnique({
        where: { id: course_id },
        select: { id: true, status: true, study_program_id: true }
      }),
      db.timeSlot.findUnique({
        where: { id: time_slot_id },
        select: { id: true }
      })
    ])

  if (!studyProgram) {
    return 'Study program not found'
  }

  if (!classData) {
    return 'Class not found'
  }

  if (classData.study_program_id !== study_program_id) {
    return 'Class does not belong to the selected study program'
  }

  if (!room) {
    return 'Room not found'
  }

  if (!lecturer) {
    return 'Lecturer not found'
  }

  if (lecturer.study_programs.length === 0) {
    return 'Lecturer is not assigned to the selected study program'
  }

  if (!course) {
    return 'Course not found'
  }

  if (course.study_program_id !== study_program_id) {
    return 'Course does not belong to the selected study program'
  }

  if (!timeSlot) {
    return 'Time slot not found'
  }

  return null
}

const scheduleController = {
  downloadTemplate: async (req, res) => {
    try {
      return res.download(SCHEDULE_TEMPLATE_PATH, 'format_schedule.xlsx')
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  uploadExcel: async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return error(res, 'Excel file is required', 400)
      }

      let parsedWorkbook = null

      try {
        parsedWorkbook = parseScheduleWorkbook(req.file.buffer)
      } catch (parseError) {
        return error(
          res,
          `Failed to read Excel file: ${parseError.message}`,
          400
        )
      }

      if (!parsedWorkbook) {
        return error(res, 'Excel file does not contain a readable sheet', 400)
      }

      const {
        study_program_name,
        class_name,
        semester,
        rows: parsedRows,
        sheet_name
      } = parsedWorkbook

      if (!study_program_name) {
        return error(res, 'Study program name is missing in row 1', 400)
      }

      if (!class_name) {
        return error(res, 'Class name is missing in row 2', 400)
      }

      if (!semester) {
        return error(
          res,
          'Semester header is missing or invalid in row 3',
          400
        )
      }

      if (parsedRows.length === 0) {
        return error(res, 'Excel file has no schedule rows to import', 400)
      }

      const studyProgram = await prisma.studyProgram.findFirst({
        where: {
          name: {
            equals: study_program_name,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          name: true,
          code: true
        }
      })

      if (!studyProgram) {
        return error(
          res,
          `Study program "${study_program_name}" was not found`,
          400
        )
      }

      const lecturerRole = await prisma.role.findFirst({
        where: {
          code: { in: LECTURER_ROLE_CODES }
        },
        select: { id: true, code: true }
      })

      if (!lecturerRole) {
        return error(res, 'Lecturer role not found', 400)
      }

      const passwordHash = await bcrypt.hash(DEFAULT_LECTURER_PASSWORD, 10)
      const skipped = []

      const createdSchedules = await prisma.$transaction(async (tx) => {
        let classData =
          (await tx.class.findFirst({
            where: {
              study_program_id: studyProgram.id,
              name: {
                equals: class_name,
                mode: 'insensitive'
              }
            }
          })) ||
          (await tx.class.create({
            data: {
              name: class_name,
              study_program_id: studyProgram.id,
              status: true
            }
          }))

        const seenScheduleKeys = new Set()
        const created = []

        for (const row of parsedRows) {
          const rowErrors = []

          if (!row.day) {
            rowErrors.push('Day is missing or invalid')
          }

          if (!row.time_range) {
            rowErrors.push('Time range is missing or invalid')
          }

          if (!row.course_code) {
            rowErrors.push('Course code is required')
          }

          if (!row.course_name) {
            rowErrors.push('Course name is required')
          }

          if (!row.lecturer_name) {
            rowErrors.push('Lecturer name is required')
          }

          if (!row.room_name) {
            rowErrors.push('Room name is required')
          }

          if (rowErrors.length > 0) {
            skipped.push({
              row_number: row.row_number,
              day: row.day || null,
              course_code: row.course_code || null,
              course_name: row.course_name || null,
              lecturer_name: row.lecturer_name || null,
              room_name: row.room_name || null,
              reason: rowErrors.join('; ')
            })
            continue
          }

          const room = await tx.room.findFirst({
            where: {
              name: {
                equals: row.room_name,
                mode: 'insensitive'
              }
            },
            select: {
              id: true,
              name: true
            }
          })

          if (!room) {
            skipped.push({
              row_number: row.row_number,
              day: row.day,
              course_code: row.course_code,
              course_name: row.course_name,
              lecturer_name: row.lecturer_name,
              room_name: row.room_name,
              reason: `Room "${row.room_name}" was not found`
            })
            continue
          }

          const existingCourse =
            (await tx.course.findFirst({
              where: {
                study_program_id: studyProgram.id,
                code: row.course_code
              }
            })) ||
            (await tx.course.findFirst({
              where: {
                study_program_id: studyProgram.id,
                name: {
                  equals: row.course_name,
                  mode: 'insensitive'
                }
              }
            }))

          const course =
            existingCourse ||
            (await tx.course.create({
              data: {
                study_program_id: studyProgram.id,
                code: row.course_code,
                name: row.course_name,
                semester
              }
            }))

          let lecturer = null

          if (
            normalizeComparableText(row.lecturer_name) ===
            normalizeComparableText(PLACEHOLDER_LECTURER_NAME)
          ) {
            lecturer = await tx.lecturer.findFirst({
              where: {
                user: {
                  name: {
                    equals: PLACEHOLDER_LECTURER_NAME,
                    mode: 'insensitive'
                  }
                },
                study_programs: {
                  some: {
                    study_program_id: studyProgram.id
                  }
                }
              },
              select: { id: true }
            })

            if (!lecturer) {
              const identity = buildPlaceholderLecturerIdentity(
                studyProgram.name
              )
              const existingUser = await tx.user.findFirst({
                where: {
                  OR: [
                    { username: identity.username },
                    { email: identity.email }
                  ]
                },
                select: { id: true }
              })

              const user =
                existingUser ||
                (await tx.user.create({
                  data: {
                    name: PLACEHOLDER_LECTURER_NAME,
                    username: identity.username,
                    email: identity.email,
                    password: passwordHash,
                    role_id: lecturerRole.id
                  }
                }))

              lecturer = await tx.lecturer.findFirst({
                where: { user_id: user.id },
                select: { id: true }
              })

              if (!lecturer) {
                lecturer = await tx.lecturer.create({
                  data: {
                    nip: identity.nip,
                    user_id: user.id,
                    study_programs: {
                      create: [{ study_program_id: studyProgram.id }]
                    }
                  },
                  select: { id: true }
                })
              } else {
                const existingAssignment =
                  await tx.lecturerStudyProgram.findFirst({
                    where: {
                      lecturer_id: lecturer.id,
                      study_program_id: studyProgram.id
                    }
                  })

                if (!existingAssignment) {
                  await tx.lecturerStudyProgram.create({
                    data: {
                      lecturer_id: lecturer.id,
                      study_program_id: studyProgram.id
                    }
                  })
                }
              }
            }
          } else {
            lecturer = await tx.lecturer.findFirst({
              where: {
                user: {
                  name: {
                    equals: row.lecturer_name,
                    mode: 'insensitive'
                  }
                },
                study_programs: {
                  some: {
                    study_program_id: studyProgram.id
                  }
                }
              },
              select: { id: true }
            })
          }

          if (!lecturer) {
            skipped.push({
              row_number: row.row_number,
              day: row.day,
              course_code: row.course_code,
              course_name: row.course_name,
              lecturer_name: row.lecturer_name,
              room_name: row.room_name,
              reason: `Lecturer "${row.lecturer_name}" was not found`
            })
            continue
          }

          let timeSlot = await tx.timeSlot.findFirst({
            where: {
              start_time: row.time_range.start_time,
              end_time: row.time_range.end_time
            },
            select: {
              id: true
            }
          })

          if (!timeSlot) {
            const baseTimeSlotName = row.jam_ke
              ? `Jam ke ${row.jam_ke}`
              : `${row.time_range.start_time}-${row.time_range.end_time}`
            const nameConflict = await tx.timeSlot.findFirst({
              where: { name: baseTimeSlotName },
              select: { id: true }
            })
            const timeSlotName = nameConflict
              ? `${baseTimeSlotName} (${row.time_range.start_time}-${row.time_range.end_time})`
              : baseTimeSlotName

            timeSlot = await tx.timeSlot.create({
              data: {
                name: timeSlotName,
                start_time: row.time_range.start_time,
                end_time: row.time_range.end_time
              },
              select: {
                id: true
              }
            })
          }

          const scheduleKey = [
            studyProgram.id,
            classData.id,
            room.id,
            lecturer.id,
            course.id,
            timeSlot.id,
            row.day
          ].join(':')

          if (seenScheduleKeys.has(scheduleKey)) {
            skipped.push({
              row_number: row.row_number,
              day: row.day,
              course_code: row.course_code,
              course_name: row.course_name,
              lecturer_name: row.lecturer_name,
              room_name: row.room_name,
              reason: 'Duplicate schedule found in the uploaded file'
            })
            continue
          }

          const relationError = await validateScheduleRelations({
            db: tx,
            study_program_id: studyProgram.id,
            class_id: classData.id,
            room_id: room.id,
            lecturer_id: lecturer.id,
            course_id: course.id,
            time_slot_id: timeSlot.id
          })

          if (relationError) {
            skipped.push({
              row_number: row.row_number,
              day: row.day,
              course_code: row.course_code,
              course_name: row.course_name,
              lecturer_name: row.lecturer_name,
              room_name: row.room_name,
              reason: relationError
            })
            continue
          }

          const conflict = await findScheduleConflict({
            db: tx,
            study_program_id: studyProgram.id,
            class_id: classData.id,
            room_id: room.id,
            lecturer_id: lecturer.id,
            course_id: course.id,
            time_slot_id: timeSlot.id,
            day: row.day
          })

          if (conflict) {
            const reason =
              conflict.type === 'room'
                ? `Room "${row.room_name}" is already booked at ${row.time_range.start_time}-${row.time_range.end_time}`
                : conflict.type === 'lecturer'
                  ? `Lecturer "${row.lecturer_name}" already has a schedule at ${row.time_range.start_time}-${row.time_range.end_time}`
                  : 'Schedule already exists'

            skipped.push({
              row_number: row.row_number,
              day: row.day,
              course_code: row.course_code,
              course_name: row.course_name,
              lecturer_name: row.lecturer_name,
              room_name: row.room_name,
              reason
            })
            continue
          }

          const createdSchedule = await tx.schedule.create({
            data: {
              study_program_id: studyProgram.id,
              class_id: classData.id,
              room_id: room.id,
              lecturer_id: lecturer.id,
              course_id: course.id,
              time_slot_id: timeSlot.id,
              day: row.day,
              status: true
            },
            include: scheduleInclude
          })

          seenScheduleKeys.add(scheduleKey)
          created.push(createdSchedule)
        }

        return created
      })

      return success(
        res,
        skipped.length > 0
          ? 'Schedule import completed with some skipped rows'
          : 'Schedule import completed successfully',
        {
          sheet_name,
          study_program_name,
          class_name,
          semester,
          created_count: createdSchedules.length,
          skipped_count: skipped.length,
          created: createdSchedules.map(formatSchedule),
          skipped
        },
        201
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  create: async (req, res) => {
    try {
      const {
        study_program_id,
        class_id,
        room_id,
        lecturer_id,
        course_id,
        time_slot_id,
        day,
        status
      } = req.body || {}
      const timeSlotIds = normalizeTimeSlotIds(time_slot_id)

      if (timeSlotIds.length === 0) {
        return error(res, 'Time slot is required', 400)
      }

      for (const currentTimeSlotId of timeSlotIds) {
        const relationError = await validateScheduleRelations({
          study_program_id,
          class_id,
          room_id,
          lecturer_id,
          course_id,
          time_slot_id: currentTimeSlotId
        })

        if (relationError) {
          return error(res, relationError, 400)
        }

        const conflict = await findScheduleConflict({
          study_program_id,
          class_id,
          room_id,
          lecturer_id,
          course_id,
          time_slot_id: currentTimeSlotId,
          day
        })

        if (conflict) {
          if (conflict.type === 'room') {
            return error(res, `Room is already booked on ${day} for time slot ${currentTimeSlotId}`, 400)
          }
          if (conflict.type === 'lecturer') {
            return error(res, `Lecturer already has a schedule on ${day} for time slot ${currentTimeSlotId}`, 400)
          }
          return error(res, `Schedule already exists for time slot ${currentTimeSlotId}`, 400)
        }
      }

      await prisma.schedule.createMany({
        data: timeSlotIds.map((currentTimeSlotId) => ({
          study_program_id,
          class_id,
          room_id,
          lecturer_id,
          course_id,
          time_slot_id: currentTimeSlotId,
          day,
          status: status !== undefined ? status : true
        }))
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllActive: async (req, res) => {
    try {
      const {
        study_program_id,
        class_id,
        room_id,
        lecturer_id,
        course_id,
        time_slot_id
      } = req.query || {}

      const schedules = await prisma.schedule.findMany({
        where: {
          status: true,
          ...(study_program_id ? { study_program_id } : {}),
          ...(class_id ? { class_id } : {}),
          ...(room_id ? { room_id } : {}),
          ...(lecturer_id ? { lecturer_id } : {}),
          ...(course_id ? { course_id } : {}),
          ...(time_slot_id ? { time_slot_id } : {})
        },
        include: scheduleInclude,
        orderBy: [
          { study_program: { name: 'asc' } },
          { class: { name: 'asc' } },
          { time_slot: { start_time: 'asc' } }
        ]
      })

      return success(res, 'success', schedules.map(formatSchedule))
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      const where = buildScheduleWhere(req.query || {})

      const [schedules, total] = await Promise.all([
        prisma.schedule.findMany({
          where,
          skip,
          take: perPage,
          include: scheduleInclude,
          orderBy: [
            { study_program: { name: 'asc' } },
            { class: { name: 'asc' } },
            { time_slot: { start_time: 'asc' } },
            { created_at: 'desc' }
          ]
        }),
        prisma.schedule.count({ where })
      ])

      return success(
        res,
        'success',
        schedules.map(formatSchedule),
        200,
        buildPagination(page, perPage, total)
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getGrouped: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const where = buildScheduleWhere(req.query || {})

      const schedules = await prisma.schedule.findMany({
        where,
        include: scheduleInclude,
        orderBy: [
          { study_program: { name: 'asc' } },
          { class: { name: 'asc' } },
          { time_slot: { start_time: 'asc' } },
          { created_at: 'desc' }
        ]
      })

      const groupedSchedules = groupSchedules(schedules)
      const total = groupedSchedules.length
      const paginatedSchedules = groupedSchedules.slice(
        (page - 1) * perPage,
        page * perPage
      )

      return success(
        res,
        'success',
        paginatedSchedules,
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
      const schedule = await prisma.schedule.findUnique({
        where: { id },
        include: scheduleInclude
      })

      if (!schedule) {
        return error(res, 'Schedule not found', 404)
      }

      const schedules = await findScheduleGroup(prisma, schedule, {
        include: scheduleInclude,
        orderBy: [{ time_slot: { start_time: 'asc' } }, { created_at: 'asc' }]
      })

      return success(res, 'success', formatScheduleDetail(schedules))
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const {
        study_program_id,
        class_id,
        room_id,
        lecturer_id,
        course_id,
        time_slot_id,
        day,
        status
      } = req.body || {}

      const existingSchedule = await prisma.schedule.findUnique({
        where: { id }
      })

      if (!existingSchedule) {
        return error(res, 'Schedule not found', 404)
      }

      const scheduleGroup = await findScheduleGroup(prisma, existingSchedule, {
        select: {
          id: true,
          time_slot_id: true
        }
      })
      const scheduleGroupIds = scheduleGroup.map((item) => item.id)
      const currentTimeSlotIds = [...new Set(scheduleGroup.map((item) => item.time_slot_id))]
      const targetTimeSlotIds =
        time_slot_id !== undefined
          ? normalizeTimeSlotIds(time_slot_id)
          : currentTimeSlotIds

      const targetData = {
        study_program_id: study_program_id || existingSchedule.study_program_id,
        class_id: class_id || existingSchedule.class_id,
        room_id: room_id || existingSchedule.room_id,
        lecturer_id: lecturer_id || existingSchedule.lecturer_id,
        course_id: course_id || existingSchedule.course_id,
        day: day || existingSchedule.day,
        status: status !== undefined ? status : existingSchedule.status
      }

      if (targetTimeSlotIds.length === 0) {
        return error(res, 'Time slot is required', 400)
      }

      for (const currentTimeSlotId of targetTimeSlotIds) {
        const relationError = await validateScheduleRelations({
          ...targetData,
          time_slot_id: currentTimeSlotId
        })

        if (relationError) {
          return error(res, relationError, 400)
        }

        const conflict = await findScheduleConflict({
          exclude_ids: scheduleGroupIds,
          ...targetData,
          time_slot_id: currentTimeSlotId,
          day: targetData.day
        })

        if (conflict) {
          if (conflict.type === 'room') {
            return error(res, `Room is already booked on ${targetData.day} for time slot ${currentTimeSlotId}`, 400)
          }
          if (conflict.type === 'lecturer') {
            return error(res, `Lecturer already has a schedule on ${targetData.day} for time slot ${currentTimeSlotId}`, 400)
          }
          return error(res, `Schedule already exists for time slot ${currentTimeSlotId}`, 400)
        }
      }

      const updateData = {
        study_program_id,
        class_id,
        room_id,
        lecturer_id,
        course_id,
        time_slot_id,
        day,
        status
      }

      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      if (Object.keys(updateData).length === 0 && time_slot_id === undefined) {
        return error(res, 'No valid fields provided for update', 400)
      }

      const isTimeSlotChanged = !areTimeSlotSetsEqual(
        currentTimeSlotIds,
        targetTimeSlotIds
      )

      await prisma.$transaction(async (tx) => {
        if (!isTimeSlotChanged) {
          await tx.schedule.updateMany({
            where: {
              id: { in: scheduleGroupIds }
            },
            data: {
              study_program_id: targetData.study_program_id,
              class_id: targetData.class_id,
              room_id: targetData.room_id,
              lecturer_id: targetData.lecturer_id,
              course_id: targetData.course_id,
              day: targetData.day,
              status: targetData.status
            }
          })

          return
        }

        await tx.schedule.deleteMany({
          where: {
            id: { in: scheduleGroupIds }
          }
        })

        await tx.schedule.createMany({
          data: targetTimeSlotIds.map((currentTimeSlotId) => ({
            study_program_id: targetData.study_program_id,
            class_id: targetData.class_id,
            room_id: targetData.room_id,
            lecturer_id: targetData.lecturer_id,
            course_id: targetData.course_id,
            time_slot_id: currentTimeSlotId,
            day: targetData.day,
            status: targetData.status
          }))
        })
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  delete: async (req, res) => {
    try {
      const { id } = req.params
      const existingSchedule = await prisma.schedule.findUnique({
        where: { id }
      })

      if (!existingSchedule) {
        return error(res, 'Schedule not found', 404)
      }

      const scheduleGroup = await findScheduleGroup(prisma, existingSchedule, {
        select: { id: true }
      })

      await prisma.schedule.deleteMany({
        where: {
          id: { in: scheduleGroup.map((item) => item.id) }
        }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllDays: async (_req, res) => {
    return success(res, 'success', allDays)
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const existingSchedule = await prisma.schedule.findUnique({
        where: { id }
      })

      if (!existingSchedule) {
        return error(res, 'Schedule not found', 404)
      }

      const scheduleGroup = await findScheduleGroup(prisma, existingSchedule, {
        select: { id: true }
      })

      await prisma.schedule.updateMany({
        where: {
          id: { in: scheduleGroup.map((item) => item.id) }
        },
        data: {
          status: !existingSchedule.status
        }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = scheduleController
