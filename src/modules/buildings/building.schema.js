const { z } = require('zod')

const { statusField } = require('../../utils/common.schema')

const createBuildingSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    latitude: z.number({ required_error: 'Latitude is required' }),
    longitude: z.number({ required_error: 'Longitude is required' }),
    radius: z.number().optional().default(100),
    status: statusField
  })
  .strict()

const updateBuildingSchema = z
  .object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
    code: z.string().min(1, 'Code cannot be empty').optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    radius: z.number().optional(),
    status: statusField.optional()
  })
  .strict()

module.exports = { createBuildingSchema, updateBuildingSchema }
