const express = require('express')
const router = express.Router()
const masterTimeSlotController = require('./time-slot.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const {
  createMasterTimeSlotSchema,
  updateMasterTimeSlotSchema
} = require('./time-slot.schema')

router.post(
  '/',
  validate(createMasterTimeSlotSchema),
  masterTimeSlotController.create
)
router.get('/all', masterTimeSlotController.getAllActive)
router.get('/', masterTimeSlotController.getAll)
router.get('/:id', masterTimeSlotController.getById)
router.patch(
  '/:id',
  validate(updateMasterTimeSlotSchema),
  masterTimeSlotController.update
)
router.delete('/:id', masterTimeSlotController.delete)

module.exports = router
