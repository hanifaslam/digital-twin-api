const { z } = require('zod')

const accessChildSchema = z.object({
  id: z.string(),
  is_checked: z.boolean().optional()
})

const accessItemSchema = z.looseObject({
  id: z.string(),
  is_checked: z.boolean().optional(),
  children: z.array(accessChildSchema).optional()
})

const createRoleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional(),
  status: z.boolean().optional(),
  access: z.array(accessItemSchema).optional()
})

const updateRoleSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  code: z.string().optional(),
  status: z.boolean().optional(),
  access: z.array(accessItemSchema).optional()
})

module.exports = { createRoleSchema, updateRoleSchema }
