const express = require('express')
const router = express.Router()
const masterClassController = require('./class.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const {
  createMasterClassSchema,
  updateMasterClassSchema
} = require('./class.schema')

router.post(
  '/',
  validate(createMasterClassSchema),
  masterClassController.create
)
router.get('/all', masterClassController.getAllClass)
router.get('/', masterClassController.getAll)
router.get('/:id', masterClassController.getById)
router.patch(
  '/:id',
  validate(updateMasterClassSchema),
  masterClassController.update
)
router.patch('/:id/status', masterClassController.toggleStatus)
router.delete('/:id', masterClassController.delete)

module.exports = router
