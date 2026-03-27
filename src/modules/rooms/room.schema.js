const { z } = require('zod')

const { statusField } = require('../../utils/common.schema')
const floorField = z.union([
  z.number().int('Floor must be an integer'),
  z.string().regex(/^\d+$/, 'Floor must be a number')
])

const createRoomSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  building_id: z.string().min(1, 'Building ID is required'),
  floor: floorField,
  status: statusField
})

const updateRoomSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  building_id: z.string().min(1).optional(),
  floor: floorField.optional(),
  status: statusField
})

module.exports = { createRoomSchema, updateRoomSchema }
