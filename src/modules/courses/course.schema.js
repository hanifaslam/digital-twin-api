const { z } = require('zod')

const semesterField = z
  .number()
  .int()
  .min(1, 'Semester must be between 1 and 8')
  .max(8, 'Semester must be between 1 and 8')

const createCourseSchema = z
  .object({
    code: z.string().min(1, 'Code is required'),
    name: z.string().min(1, 'Name is required'),
    semester: semesterField,
    study_program_id: z.string().min(1, 'Study program is required'),
    status: z.boolean().optional()
  })
  .strict()

const updateCourseSchema = z
  .object({
    code: z.string().min(1, 'Code cannot be empty').optional(),
    name: z.string().min(1, 'Name cannot be empty').optional(),
    semester: semesterField.optional(),
    study_program_id: z
      .string()
      .min(1, 'Study program cannot be empty')
      .optional(),
    status: z.boolean().optional()
  })
  .strict()

module.exports = { createCourseSchema, updateCourseSchema }
