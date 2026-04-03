const { z } = require('zod')

const timeField = z
  .string()
  .trim()
  .regex(
    /^([01]\d|2[0-3])[:.]([0-5]\d)$/,
    'Time must use HH:mm or HH.mm format'
  )

const createMasterTimeSlotSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    start_time: timeField,
    end_time: timeField
  })
  .strict()

const updateMasterTimeSlotSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').optional(),
    start_time: timeField.optional(),
    end_time: timeField.optional()
  })
  .strict()

module.exports = {
  createMasterTimeSlotSchema,
  updateMasterTimeSlotSchema
}
