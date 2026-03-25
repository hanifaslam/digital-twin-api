const express = require('express')
const router = express.Router()
const studyProgramController = require('./study-program.controller')

router.post('/', studyProgramController.create)
router.get('/', studyProgramController.getAll)
router.get('/:id', studyProgramController.getById)
router.patch('/:id', studyProgramController.update)
router.patch('/:id/status', studyProgramController.toggleStatus)
router.delete('/:id', studyProgramController.delete)

module.exports = router
