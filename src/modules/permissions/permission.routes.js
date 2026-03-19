const express = require('express')
const router = express.Router()
const permissionController = require('./permission.controller')
const { authMiddleware } = require('../../common/middlewares/auth.middleware')

router.get('/', authMiddleware, permissionController.getAll)

module.exports = router
