const { z } = require('zod')

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/
const passwordErrorMessage =
  'Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)'

const loginSchema = z.object({
  login: z.string().min(1, 'Username is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex, passwordErrorMessage),
  remember_me: z.boolean().optional()
})

const forgotPasswordSchema = z.object({
  email: z.email('Invalid email format')
})

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(passwordRegex, passwordErrorMessage),
    confirm_password: z.string().min(1, 'Confirm password is required')
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password']
  })

const changePasswordSchema = z
  .object({
    old_password: z.string().min(1, 'Old password is required'),
    new_password: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .regex(passwordRegex, passwordErrorMessage),
    confirm_password: z.string().min(1, 'Confirm password is required')
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password']
  })

module.exports = {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema
}
