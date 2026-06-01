const express = require('express')
const chatbotController = require('./chatbot.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const { chatDashboardSchema } = require('./chatbot.schema')

const router = express.Router()

router.post('/', validate(chatDashboardSchema), chatbotController.chatDashboard)

module.exports = router
