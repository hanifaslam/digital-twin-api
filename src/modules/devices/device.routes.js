const express = require('express')
const router = express.Router()
const deviceController = require('./device.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const { createDeviceSchema, updateDeviceSchema } = require('./device.schema')

router.get('/types', deviceController.getTypes)
router.post('/', validate(createDeviceSchema), deviceController.create)
router.get('/', deviceController.getAll)
router.get('/:id', deviceController.getById)
router.patch('/:id', validate(updateDeviceSchema), deviceController.update)
router.patch('/:id/status', deviceController.toggleStatus)
router.delete('/:id', deviceController.delete)

module.exports = router
