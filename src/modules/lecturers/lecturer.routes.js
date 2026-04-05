const express = require('express')
const router = express.Router()
const lecturerController = require('./lecturer.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const {
  createLecturerSchema,
  updateLecturerSchema
} = require('./lecturer.schema')

router.post('/', validate(createLecturerSchema), lecturerController.create)
router.get('/all', lecturerController.getAllActive)
router.get('/', lecturerController.getAll)
router.get('/:id', lecturerController.getById)
router.patch('/:id', validate(updateLecturerSchema), lecturerController.update)
router.delete('/:id', lecturerController.delete)

module.exports = router
