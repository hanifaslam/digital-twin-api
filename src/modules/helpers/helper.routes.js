const express = require('express')
const router = express.Router()
const helperController = require('./helper.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const { createHelperSchema, updateHelperSchema } = require('./helper.schema')

router.post('/', validate(createHelperSchema), helperController.create)
router.get('/all', helperController.getAllActive)
router.get('/', helperController.getAll)
router.get('/:id', helperController.getById)
router.patch('/:id', validate(updateHelperSchema), helperController.update)
router.patch('/:id/status', helperController.toggleStatus)
router.delete('/:id', helperController.delete)

module.exports = router
