const { z } = require('zod')

const createHelperSchema = z
  .object({
    phone_number: z.string().optional(),
    user_id: z.string().min(1, 'User ID is required'),
    building_ids: z
      .array(z.string().min(1, 'Building ID is required'))
      .min(1, 'At least one building ID is required'),
    status: z.boolean().optional()
  })
  .strict()

const updateHelperSchema = z
  .object({
    phone_number: z.string().optional(),
    user_id: z.string().min(1, 'User ID cannot be empty').optional(),
    building_ids: z
      .array(z.string().min(1, 'Building ID cannot be empty'))
      .optional(),
    status: z.boolean().optional()
  })
  .strict()

module.exports = { createHelperSchema, updateHelperSchema }
