const { error } = require('../../config/response')

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    const issues = result.error.issues || result.error.errors || []
    const message = issues[0]?.message || 'Validation error'
    return error(res, message, 400)
  }
  req.body = result.data
  next()
}

module.exports = { validate }
