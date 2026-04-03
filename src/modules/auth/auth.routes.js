const express = require('express')
const router = express.Router()
const authController = require('./auth.controller')
const { authMiddleware } = require('../../common/middlewares/auth.middleware')
const { validate } = require('../../common/middlewares/validate.middleware')
const {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema
} = require('./auth.schema')

// Public endpoints
router.post('/login', validate(loginSchema), authController.login)
router.post('/refresh', authController.refreshToken)
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  authController.forgotPassword
)
router.post(
  '/reset-password/:token',
  validate(resetPasswordSchema),
  authController.resetPassword
)

// Protected endpoints
router.get('/me', authMiddleware, authController.getMe)
router.post(
  '/change-password',
  authMiddleware,
  validate(changePasswordSchema),
  authController.changePassword
)
router.post('/logout', authController.logout)

module.exports = router
