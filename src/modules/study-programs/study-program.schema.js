const { z } = require('zod')

const createStudyProgramSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    home_room_id: z.string().optional(),
    status: z.boolean().optional()
  })
  .strict()

const updateStudyProgramSchema = z
  .object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
    code: z.string().min(1, 'Code cannot be empty').optional(),
    home_room_id: z.string().optional(),
    status: z.boolean().optional()
  })
  .strict()

module.exports = { createStudyProgramSchema, updateStudyProgramSchema }
