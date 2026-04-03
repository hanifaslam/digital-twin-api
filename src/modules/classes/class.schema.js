const { z } = require('zod')

const { statusField } = require('../../utils/common.schema')

const createMasterClassSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    study_program_id: z.string().min(1, 'Study program is required'),
    status: statusField.optional()
  })
  .strict()

const updateMasterClassSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').optional(),
    study_program_id: z
      .string()
      .min(1, 'Study program cannot be empty')
      .optional(),
    status: statusField.optional()
  })
  .strict()

module.exports = {
  createMasterClassSchema,
  updateMasterClassSchema
}
