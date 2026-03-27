const express = require('express')
const router = express.Router()
const buildingController = require('./building.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const { createBuildingSchema, updateBuildingSchema } = require('./building.schema')

router.post('/', validate(createBuildingSchema), buildingController.create)
router.get('/', buildingController.getAll)
router.get('/:id', buildingController.getById)
router.patch('/:id', validate(updateBuildingSchema), buildingController.update)
router.patch('/:id/status', buildingController.toggleStatus)
router.delete('/:id', buildingController.delete)

module.exports = router
