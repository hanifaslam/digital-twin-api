const { z } = require('zod')

const createLecturerSchema = z
  .object({
    nip: z.string().min(1, 'NIP is required'),
    study_program_ids: z
      .array(z.string().min(1, 'Study program ID is required'))
      .min(1, 'At least one study program ID is required'),
    user_id: z.string().min(1, 'User ID is required')
  })
  .strict()

const updateLecturerSchema = z
  .object({
    nip: z.string().min(1, 'NIP cannot be empty').optional(),
    study_program_ids: z.array(z.string().min(1)).min(1).optional(),
    user_id: z.string().min(1).optional()
  })
  .strict()

module.exports = { createLecturerSchema, updateLecturerSchema }
