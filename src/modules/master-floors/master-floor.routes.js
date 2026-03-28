const express = require('express')
const router = express.Router()
const masterFloorController = require('./master-floor.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const {
  createMasterFloorSchema,
  updateMasterFloorSchema
} = require('./master-floor.schema')

router.post(
  '/',
  validate(createMasterFloorSchema),
  masterFloorController.create
)
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
