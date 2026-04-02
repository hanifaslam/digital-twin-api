const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')

const normalizeTime = (value) => value.replace('.', ':')
const toMinutes = (value) => {
  const [hours, minutes] = normalizeTime(value).split(':').map(Number)
  return hours * 60 + minutes
}
const toDisplayTime = (value) => normalizeTime(value).replace(':', '.')

const formatMasterTimeSlot = (timeSlot) => ({
  id: timeSlot.id,
  name: timeSlot.name,
  start_time: normalizeTime(timeSlot.start_time),
  end_time: normalizeTime(timeSlot.end_time),
  display_time: `${toDisplayTime(timeSlot.start_time)} - ${toDisplayTime(timeSlot.end_time)}`,
  created_at: timeSlot.created_at,
  updated_at: timeSlot.updated_at
})

const validateTimeRange = (startTime, endTime) => {
  return toMinutes(startTime) < toMinutes(endTime)
}

const findTimeSlotConflict = async ({ id, name, start_time, end_time }) => {
  const orConditions = []

  if (name) {
    orConditions.push({
      name: {
        equals: name,
        mode: 'insensitive'
      }
    })
  }

  if (start_time && end_time) {
    orConditions.push({
      start_time,
      end_time
    })
  }

  if (orConditions.length === 0) {
    return null
  }

  return prisma.masterTimeSlot.findFirst({
    where: {
      OR: orConditions,
      ...(id ? { NOT: { id } } : {})
    }
  })
}

const masterTimeSlotController = {
  create: async (req, res) => {
    try {
      const { name, start_time, end_time } = req.body || {}
      const normalizedStartTime = normalizeTime(start_time)
      const normalizedEndTime = normalizeTime(end_time)

      if (!validateTimeRange(normalizedStartTime, normalizedEndTime)) {
        return error(res, 'End time must be later than start time', 400)
      }

      const conflict = await findTimeSlotConflict({
        name,
        start_time: normalizedStartTime,
        end_time: normalizedEndTime
      })

      if (conflict) {
        if (conflict.name.toLowerCase() === name.toLowerCase()) {
          return error(res, 'Time slot name already exists', 400)
        }

        return error(res, 'Time slot range already exists', 400)
      }

      await prisma.masterTimeSlot.create({
        data: {
          name,
          start_time: normalizedStartTime,
          end_time: normalizedEndTime
        }
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllActive: async (req, res) => {
    try {
      const timeSlots = await prisma.masterTimeSlot.findMany({
        orderBy: [{ start_time: 'asc' }, { name: 'asc' }]
      })

      return success(res, 'success', timeSlots.map(formatMasterTimeSlot))
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

      const where = {}

      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { start_time: { contains: q } },
          { end_time: { contains: q } }
        ]
      }

      const [timeSlots, total] = await Promise.all([
        prisma.masterTimeSlot.findMany({
          where,
          skip,
          take: perPage,
          orderBy: [{ start_time: 'asc' }, { name: 'asc' }]
        }),
        prisma.masterTimeSlot.count({ where })
      ])

      return success(
        res,
        'success',
        timeSlots.map(formatMasterTimeSlot),
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
      const timeSlot = await prisma.masterTimeSlot.findUnique({
        where: { id }
      })

      if (!timeSlot) {
        return error(res, 'Time slot not found', 404)
      }

      return success(res, 'success', formatMasterTimeSlot(timeSlot))
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, start_time, end_time } = req.body || {}

      const existingTimeSlot = await prisma.masterTimeSlot.findUnique({
        where: { id }
      })

      if (!existingTimeSlot) {
        return error(res, 'Time slot not found', 404)
      }

      const normalizedStartTime = start_time
        ? normalizeTime(start_time)
        : existingTimeSlot.start_time
      const normalizedEndTime = end_time
        ? normalizeTime(end_time)
        : existingTimeSlot.end_time

      if (!validateTimeRange(normalizedStartTime, normalizedEndTime)) {
        return error(res, 'End time must be later than start time', 400)
      }

      const targetName = name || existingTimeSlot.name
      const conflict = await findTimeSlotConflict({
        id,
        name: targetName,
        start_time: normalizedStartTime,
        end_time: normalizedEndTime
      })

      if (conflict) {
        if (conflict.name.toLowerCase() === targetName.toLowerCase()) {
          return error(res, 'Time slot name already exists', 400)
        }

        return error(res, 'Time slot range already exists', 400)
      }

      const updateData = {
        name,
        start_time: start_time ? normalizedStartTime : undefined,
        end_time: end_time ? normalizedEndTime : undefined
      }

      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      await prisma.masterTimeSlot.update({
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
      const existingTimeSlot = await prisma.masterTimeSlot.findUnique({
        where: { id }
      })

      if (!existingTimeSlot) {
        return error(res, 'Time slot not found', 404)
      }

      await prisma.masterTimeSlot.delete({
        where: { id }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = masterTimeSlotController
