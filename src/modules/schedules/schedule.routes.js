const express = require('express')
const router = express.Router()
const scheduleController = require('./schedule.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const {
  createScheduleSchema,
  updateScheduleSchema
} = require('./schedule.schema')

router.post('/', validate(createScheduleSchema), scheduleController.create)
router.get('/days', scheduleController.getAllDays)
router.get('/all', scheduleController.getAllActive)
router.get('/grouped', scheduleController.getGrouped)
router.get('/', scheduleController.getAll)
router.get('/:id', scheduleController.getById)
router.patch('/:id', validate(updateScheduleSchema), scheduleController.update)
router.patch('/:id/status', scheduleController.toggleStatus)
router.delete('/:id', scheduleController.delete)

module.exports = router
