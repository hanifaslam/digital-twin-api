const { z } = require('zod')

const { statusField } = require('../../utils/common.schema')

const createRoomSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  building_id: z.string().min(1, 'Building ID is required'),
  floor_id: z.string().min(1, 'Floor ID is required'),
  status: statusField
})

const updateRoomSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  building_id: z.string().min(1).optional(),
  floor_id: z.string().min(1).optional(),
  status: statusField
})

module.exports = { createRoomSchema, updateRoomSchema }
