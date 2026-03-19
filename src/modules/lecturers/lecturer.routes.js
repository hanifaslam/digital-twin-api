const express = require('express')
const router = express.Router()
const lecturerController = require('./lecturer.controller')

router.post('/', lecturerController.create)
router.get('/', lecturerController.getAll)
router.get('/:id', lecturerController.getById)

module.exports = router
