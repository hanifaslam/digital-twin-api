const { z } = require('zod')

const { statusField } = require('../../utils/common.schema')

const isValidDateString = (value) => {
  const [year, month, day] = value.split('-').map(Number)
  const utcDate = new Date(Date.UTC(year, month - 1, day))

  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  )
}

const createAcademicPeriodSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    type: z.enum(['GANJIL', 'GENAP'], 'Type must be GANJIL or GENAP'),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
      .refine(isValidDateString, 'Start date is invalid'),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
      .refine(isValidDateString, 'End date is invalid'),
    status: statusField.optional().default(true)
  })
  .strict()
  .refine((data) => data.end_date >= data.start_date, {
    message: 'End date must be greater than or equal to start date',
    path: ['end_date']
  })

const updateAcademicPeriodSchema = z
  .object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
    type: z.enum(['GANJIL', 'GENAP'], 'Type must be GANJIL or GENAP').optional(),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
      .refine(isValidDateString, 'Start date is invalid')
      .optional(),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
      .refine(isValidDateString, 'End date is invalid')
      .optional(),
    status: statusField.optional()
  })
  .strict()
  .refine(
    (data) =>
      !data.start_date ||
      !data.end_date ||
      data.end_date >= data.start_date,
    {
      message: 'End date must be greater than or equal to start date',
      path: ['end_date']
    }
  )

module.exports = { createAcademicPeriodSchema, updateAcademicPeriodSchema }
