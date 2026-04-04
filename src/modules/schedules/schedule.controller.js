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
  status: item.status,
  created_at: item.created_at,
  updated_at: item.updated_at
})

const findScheduleConflict = async ({
  id,
  study_program_id,
  class_id,
  room_id,
  lecturer_id,
  course_id,
  time_slot_id
}) => {
  if (
    !study_program_id ||
    !class_id ||
    !room_id ||
    !lecturer_id ||
    !course_id ||
    !time_slot_id
  ) {
    return null
  }

  return prisma.schedule.findFirst({
    where: {
      study_program_id,
      class_id,
      room_id,
      lecturer_id,
      course_id,
      time_slot_id,
      ...(id ? { NOT: { id } } : {})
    }
  })
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
        status
      } = req.body || {}

      const relationError = await validateScheduleRelations({
        study_program_id,
        class_id,
        room_id,
        lecturer_id,
        course_id,
        time_slot_id
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
        time_slot_id
      })

      if (conflict) {
        return error(res, 'Schedule already exists', 400)
      }

      await prisma.schedule.create({
        data: {
          study_program_id,
          class_id,
          room_id,
          lecturer_id,
          course_id,
          time_slot_id,
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
      const {
        q,
        status,
        study_program_id,
        class_id,
        room_id,
        lecturer_id,
        course_id,
        time_slot_id
      } = req.query || {}
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

      return success(res, 'success', formatSchedule(schedule))
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
        status
      } = req.body || {}

      const existingSchedule = await prisma.schedule.findUnique({
        where: { id }
      })

      if (!existingSchedule) {
        return error(res, 'Schedule not found', 404)
      }

      const targetData = {
        study_program_id: study_program_id || existingSchedule.study_program_id,
        class_id: class_id || existingSchedule.class_id,
        room_id: room_id || existingSchedule.room_id,
        lecturer_id: lecturer_id || existingSchedule.lecturer_id,
        course_id: course_id || existingSchedule.course_id,
        time_slot_id: time_slot_id || existingSchedule.time_slot_id
      }

      const relationError = await validateScheduleRelations(targetData)

      if (relationError) {
        return error(res, relationError, 400)
      }

      const conflict = await findScheduleConflict({
        id,
        ...targetData
      })

      if (conflict) {
        return error(res, 'Schedule already exists', 400)
      }

      const updateData = {
        study_program_id,
        class_id,
        room_id,
        lecturer_id,
        course_id,
        time_slot_id,
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

      await prisma.schedule.update({
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
