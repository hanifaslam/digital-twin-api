const { error, success } = require('../../config/response')
const { chatDashboard } = require('./chatbot.service')

const chatbotController = {
  chatDashboard: async (req, res) => {
    try {
      const result = await chatDashboard(req.body)

      if (!result.ok) {
        return error(res, result.message, result.statusCode)
      }

      return success(
        res,
        result.message,
        {
          session_id: result.session_id,
          ...result.data
        },
        result.statusCode,
        result.metadata
      )
    } catch (err) {
      return error(res, err.message, err.statusCode || 500)
    }
  }
}

module.exports = chatbotController
