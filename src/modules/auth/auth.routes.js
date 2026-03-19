const express = require('express')
const router = express.Router()
const authController = require('./auth.controller')

const { authMiddleware } = require('../../common/middlewares/auth.middleware')

// Public endpoints
router.post('/login', authController.login)
router.post('/refresh', authController.refreshToken)
router.post('/forgot-password', authController.forgotPassword)
router.post('/reset-password/:token', authController.resetPassword)

// Protected endpoints
router.get('/me', authMiddleware, authController.getMe)
router.post('/change-password', authMiddleware, authController.changePassword)
router.post('/logout', authController.logout)

module.exports = router
