const { z } = require('zod')

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  username: z.string().min(1, 'Username is required'),
  email: z.email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string().min(1, 'Confirm password is required'),
  role_id: z.string().min(1, 'Role ID is required'),
  status: z.boolean().optional()
}).strict()

const updateUserSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  username: z.string().min(1, 'Username cannot be empty').optional(),
  email: z.email('Invalid email format').optional(),
  role_id: z.string().min(1).optional(),
  status: z.boolean().optional()
}).strict()

const resetPasswordSchema = z.object({
  new_password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string().min(1, 'Confirm password is required')
}).strict()

module.exports = { createUserSchema, updateUserSchema, resetPasswordSchema }
