const express = require('express')
const router = express.Router()
const sensorController = require('./sensor.controller')
const { authMiddleware } = require('../../common/middlewares/auth.middleware')

router.use(authMiddleware)

router.get('/latest/room/:roomId', sensorController.getLatestByRoom)
router.get('/latest/device/:deviceId', sensorController.getLatestByDevice)
router.get('/history', sensorController.getHistory)

module.exports = router
