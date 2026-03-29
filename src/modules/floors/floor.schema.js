const { z } = require('zod')

const { statusField } = require('../../utils/common.schema')

const createMasterFloorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  status: statusField.optional()
}).strict()

const updateMasterFloorSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  status: statusField.optional()
}).strict()

module.exports = { createMasterFloorSchema, updateMasterFloorSchema }
