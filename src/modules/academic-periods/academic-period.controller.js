const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { toUtcFromJakarta } = require('../../utils/date')

const parseJakartaDateString = (value, endOfDay = false) => {
  const [year, month, day] = value.split('-').map(Number)

  return toUtcFromJakarta(
    year,
    month,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0
  )
}

const buildPeriodDates = (startDateInput, endDateInput) => ({
  start_date: startDateInput
    ? parseJakartaDateString(startDateInput)
    : undefined,
  end_date: endDateInput
    ? parseJakartaDateString(endDateInput, true)
    : undefined
})

const academicPeriodController = {
  create: async (req, res) => {
    try {
      const {
        name,
        type,
        start_date: startDateInput,
        end_date: endDateInput,
        status = true
      } = req.body || {}
      const { start_date, end_date } = buildPeriodDates(
        startDateInput,
        endDateInput
      )

      const overlappingActivePeriod = await prisma.academicPeriod.findFirst({
        where: {
          status: true,
          start_date: { lte: end_date },
          end_date: { gte: start_date }
        },
        orderBy: [{ start_date: 'desc' }, { created_at: 'desc' }]
      })

      if (status && overlappingActivePeriod) {
        return error(
          res,
          `Active academic period overlaps with existing period '${overlappingActivePeriod.name}'`,
          400
        )
      }

      const existingName = await prisma.academicPeriod.findFirst({
        where: { name }
      })

      if (existingName) {
        return error(res, 'Academic period name already exists', 400)
      }

      const academicPeriod = await prisma.academicPeriod.create({
        data: {
          name,
          type,
          start_date,
          end_date,
          status
        }
      })

      return success(res, 'success', academicPeriod, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const {
        name,
        type,
        start_date: startDateInput,
        end_date: endDateInput,
        status
      } = req.body || {}

      const existingAcademicPeriod = await prisma.academicPeriod.findUnique({
        where: { id }
      })

      if (!existingAcademicPeriod) {
        return error(res, 'Academic period not found', 404)
      }

      if (name) {
        const existingName = await prisma.academicPeriod.findFirst({
          where: {
            name,
            NOT: { id }
          }
        })

        if (existingName) {
          return error(res, 'Academic period name already exists', 400)
        }
      }

      const parsedDates = buildPeriodDates(startDateInput, endDateInput)
      const nextStartDate =
        parsedDates.start_date || existingAcademicPeriod.start_date
      const nextEndDate = parsedDates.end_date || existingAcademicPeriod.end_date
      const nextStatus =
        status !== undefined ? status : existingAcademicPeriod.status

      if (nextStatus) {
        const overlappingActivePeriod = await prisma.academicPeriod.findFirst({
          where: {
            status: true,
            start_date: { lte: nextEndDate },
            end_date: { gte: nextStartDate },
            NOT: { id }
          },
          orderBy: [{ start_date: 'desc' }, { created_at: 'desc' }]
        })

        if (overlappingActivePeriod) {
          return error(
            res,
            `Active academic period overlaps with existing period '${overlappingActivePeriod.name}'`,
            400
          )
        }
      }

      const updateData = {
        name,
        type,
        status,
        ...parsedDates
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      await prisma.academicPeriod.update({
        where: { id },
        data: updateData
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = academicPeriodController
