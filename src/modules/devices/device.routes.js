const express = require('express')
const router = express.Router()
const deviceController = require('./device.controller')

router.get('/types', deviceController.getTypes)
router.post('/', deviceController.create)

router.get('/', deviceController.getAll)

router.get('/:id', deviceController.getById)

router.patch('/:id', deviceController.update)

router.patch('/:id/status', deviceController.toggleStatus)

router.delete('/:id', deviceController.delete)

module.exports = router
