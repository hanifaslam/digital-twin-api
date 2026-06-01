const { z } = require('zod')

const chatDashboardSchema = z
  .object({
    message: z
      .string()
      .min(2, 'Message must be at least 2 characters')
      .max(1000, 'Message is too long'),
    session_id: z.string().min(4).max(120).optional(),
    building_id: z.string().min(1).optional(),
    room_id: z.string().min(1).optional()
  })
  .strict()

module.exports = {
  chatDashboardSchema
}
