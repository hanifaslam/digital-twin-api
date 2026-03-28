const express = require('express')
const router = express.Router()
const studyProgramController = require('./study-program.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const { createStudyProgramSchema, updateStudyProgramSchema } = require('./study-program.schema')

router.post('/', validate(createStudyProgramSchema), studyProgramController.create)
router.get('/all', studyProgramController.getAllStudyPrograms)
router.get('/', studyProgramController.getAll)
router.get('/:id', studyProgramController.getById)
router.patch('/:id', validate(updateStudyProgramSchema), studyProgramController.update)
router.patch('/:id/status', studyProgramController.toggleStatus)
router.delete('/:id', studyProgramController.delete)

module.exports = router
