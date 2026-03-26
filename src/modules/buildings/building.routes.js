const express = require('express')
const router = express.Router()
const buildingController = require('./building.controller')

router.post('/', buildingController.create)
router.get('/', buildingController.getAll)
router.get('/:id', buildingController.getById)
router.patch('/:id', buildingController.update)
router.patch('/:id/status', buildingController.toggleStatus)
router.delete('/:id', buildingController.delete)

module.exports = router
