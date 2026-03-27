const express = require('express')
const router = express.Router()
const userController = require('./user.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const { createUserSchema, updateUserSchema, resetPasswordSchema } = require('./user.schema')

router.post('/', validate(createUserSchema), userController.create)
router.get('/', userController.getAll)
router.get('/:id', userController.getById)
router.patch('/:id', validate(updateUserSchema), userController.update)
router.patch('/:id/status', userController.toggleStatus)
router.patch('/:id/reset-password', validate(resetPasswordSchema), userController.resetPassword)

module.exports = router
