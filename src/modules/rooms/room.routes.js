const express = require('express')
const router = express.Router()
const roomController = require('./room.controller')

router.post('/', roomController.create)
router.get('/', roomController.getAll)
router.get('/:id', roomController.getById)
router.patch('/:id', roomController.update)
router.patch('/:id/status', roomController.toggleStatus)
router.delete('/:id', roomController.delete)

module.exports = router
