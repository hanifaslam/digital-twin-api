const { z } = require('zod')
const { DeviceType } = require('@prisma/client')

const { statusField } = require('../../utils/common.schema')

const createDeviceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(DeviceType, { message: 'Invalid device type' }),
  room_id: z.string().min(1, 'Room ID is required'),
  mqtt_topic: z.string().optional(),
  stream_url: z.string().optional(),
  status: statusField
}).strict()

const updateDeviceSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  type: z.enum(DeviceType, { message: 'Invalid device type' }).optional(),
  room_id: z.string().min(1).optional(),
  mqtt_topic: z.string().optional(),
  stream_url: z.string().optional(),
  status: statusField.optional()
}).strict()

module.exports = { createDeviceSchema, updateDeviceSchema }
