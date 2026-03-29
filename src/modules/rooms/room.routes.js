const express = require('express')
const router = express.Router()
const roomController = require('./room.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const { createRoomSchema, updateRoomSchema } = require('./room.schema')

router.post('/', validate(createRoomSchema), roomController.create)
router.get('/all', roomController.getAllRooms)
router.get('/', roomController.getAll)
router.get('/:id', roomController.getById)
router.patch('/:id', validate(updateRoomSchema), roomController.update)
router.patch('/:id/status', roomController.toggleStatus)
router.delete('/:id', roomController.delete)

module.exports = router
