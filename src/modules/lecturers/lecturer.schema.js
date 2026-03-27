const { z } = require('zod')

const createLecturerSchema = z.object({
  nip: z.string().min(1, 'NIP is required'),
  study_program_id: z.string().min(1, 'Study program ID is required'),
  user_id: z.string().min(1, 'User ID is required')
})

const updateLecturerSchema = z.object({
  nip: z.string().min(1, 'NIP cannot be empty').optional(),
  study_program_id: z.string().min(1).optional(),
  user_id: z.string().min(1).optional()
})

module.exports = { createLecturerSchema, updateLecturerSchema }
