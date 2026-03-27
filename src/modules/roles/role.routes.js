const express = require('express')
const router = express.Router()
const roleController = require('./role.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const { createRoleSchema, updateRoleSchema } = require('./role.schema')

router.post('/', validate(createRoleSchema), roleController.create)
router.get('/all', roleController.getAllRoles)
router.get('/:id', roleController.showRole)
router.patch('/:id', validate(updateRoleSchema), roleController.update)
router.patch('/:id/status', roleController.toggleStatus)
router.get('/', roleController.getListRole)

module.exports = router
