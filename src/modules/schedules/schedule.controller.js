const { Day } = require('@prisma/client')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

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

  const ranges = timeSlots.map(
    (slot) => `${slot.start_time || '-'}-${slot.end_time || '-'}`
  )

  const isContiguous = timeSlots.every((slot, index) => {
    if (index === 0) {
      return true
    }

    return timeSlots[index - 1].end_time === slot.start_time
  })

  if (isContiguous) {
    return `${timeSlots[0].start_time}-${timeSlots[timeSlots.length - 1].end_time}`
  }

  return ranges.join(', ')
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

const findScheduleConflict = async ({
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
    prisma.schedule.findFirst({
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
    prisma.schedule.findFirst({
      where: { room_id, time_slot_id, day, ...excludeFilter }
    }),
    prisma.schedule.findFirst({
      where: { lecturer_id, time_slot_id, day, ...excludeFilter }
    })
  ])

  if (duplicate) return { type: 'duplicate' }
  if (roomConflict) return { type: 'room' }
  if (lecturerConflict) return { type: 'lecturer' }
  return null
}

const validateScheduleRelations = async ({
  study_program_id,
  class_id,
  room_id,
  lecturer_id,
  course_id,
  time_slot_id
}) => {
  const [studyProgram, classData, room, lecturer, course, timeSlot] =
    await Promise.all([
      prisma.studyProgram.findUnique({
        where: { id: study_program_id },
        select: { id: true, status: true }
      }),
      prisma.class.findUnique({
        where: { id: class_id },
        select: { id: true, status: true, study_program_id: true }
      }),
      prisma.room.findUnique({
        where: { id: room_id },
        select: { id: true, status: true }
      }),
      prisma.lecturer.findUnique({
        where: { id: lecturer_id },
        select: {
          id: true,
          study_programs: {
            where: { study_program_id },
            select: { study_program_id: true }
          }
        }
      }),
      prisma.course.findUnique({
        where: { id: course_id },
        select: { id: true, status: true, study_program_id: true }
      }),
      prisma.timeSlot.findUnique({
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

      const schedules = await prisma.schedule.findMany({
        where: {
          study_program_id: schedule.study_program_id,
          class_id: schedule.class_id,
          room_id: schedule.room_id,
          lecturer_id: schedule.lecturer_id,
          course_id: schedule.course_id,
          status: schedule.status
        },
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

      const scheduleGroup = await prisma.schedule.findMany({
        where: {
          study_program_id: existingSchedule.study_program_id,
          class_id: existingSchedule.class_id,
          room_id: existingSchedule.room_id,
          lecturer_id: existingSchedule.lecturer_id,
          course_id: existingSchedule.course_id,
          day: existingSchedule.day
        },
        select: {
          id: true,
          time_slot_id: true
        }
      })
      const scheduleGroupIds = scheduleGroup.map((item) => item.id)
      const targetTimeSlotIds =
        time_slot_id !== undefined
          ? normalizeTimeSlotIds(time_slot_id)
          : [...new Set(scheduleGroup.map((item) => item.time_slot_id))]

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

      await prisma.$transaction(async (tx) => {
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

      await prisma.schedule.delete({
        where: { id }
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

      await prisma.schedule.update({
        where: { id },
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
