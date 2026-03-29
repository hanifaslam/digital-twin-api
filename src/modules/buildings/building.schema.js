const { z } = require('zod')

const { statusField } = require('../../utils/common.schema')

const createBuildingSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  status: statusField
}).strict()

const updateBuildingSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  code: z.string().min(1, 'Code cannot be empty').optional(),
  status: statusField.optional()
}).strict()

module.exports = { createBuildingSchema, updateBuildingSchema }
