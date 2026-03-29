const express = require('express')
const router = express.Router()
const masterFloorController = require('./floor.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const {
  createMasterFloorSchema,
  updateMasterFloorSchema
} = require('./floor.schema')

router.post(
  '/',
  validate(createMasterFloorSchema),
  masterFloorController.create
)
router.get('/all', masterFloorController.getAllFloor)
router.get('/', masterFloorController.getAll)
router.get('/:id', masterFloorController.getById)
router.patch(
  '/:id',
  validate(updateMasterFloorSchema),
  masterFloorController.update
)
router.patch('/:id/status', masterFloorController.toggleStatus)
router.delete('/:id', masterFloorController.delete)

module.exports = router
