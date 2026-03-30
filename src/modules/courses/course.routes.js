const express = require('express')
const router = express.Router()
const courseController = require('./course.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const { createCourseSchema, updateCourseSchema } = require('./course.schema')

router.post('/', validate(createCourseSchema), courseController.create)
router.get('/all', courseController.getAllActive)
router.get('/semesters', courseController.getAllSemesters)
router.get('/', courseController.getAll)
router.get('/:id', courseController.getById)
router.patch('/:id', validate(updateCourseSchema), courseController.update)
router.patch('/:id/status', courseController.toggleStatus)
router.delete('/:id', courseController.delete)

module.exports = router
