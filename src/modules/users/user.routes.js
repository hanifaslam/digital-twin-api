const express = require('express')
const router = express.Router()
const userController = require('./user.controller')

router.post('/', userController.create)
router.get('/', userController.getAll)
router.get('/:id', userController.getById)
router.patch('/:id', userController.update)
router.patch('/:id/status', userController.toggleStatus)
router.patch('/:id/reset-password', userController.resetPassword)

module.exports = router
