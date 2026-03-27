const { z } = require('zod')

const statusField = z.preprocess(
  (val) => (typeof val === 'string' ? val === 'true' : val),
  z.boolean()
)

module.exports = {
  statusField
}
