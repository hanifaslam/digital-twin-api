const { z } = require('zod')

const { statusField } = require('../../utils/common.schema')

const createScheduleSchema = z
  .object({
    study_program_id: z.string().min(1, 'Study program is required'),
    class_id: z.string().min(1, 'Class is required'),
    room_id: z.string().min(1, 'Room is required'),
    lecturer_id: z.string().min(1, 'Lecturer is required'),
    course_id: z.string().min(1, 'Course is required'),
    time_slot_id: z.string().min(1, 'Time slot is required'),
    status: statusField.optional()
  })
  .strict()

const updateScheduleSchema = z
  .object({
    study_program_id: z
      .string()
      .min(1, 'Study program cannot be empty')
      .optional(),
    class_id: z.string().min(1, 'Class cannot be empty').optional(),
    room_id: z.string().min(1, 'Room cannot be empty').optional(),
    lecturer_id: z.string().min(1, 'Lecturer cannot be empty').optional(),
    course_id: z.string().min(1, 'Course cannot be empty').optional(),
    time_slot_id: z.string().min(1, 'Time slot cannot be empty').optional(),
    status: statusField.optional()
  })
  .strict()

module.exports = {
  createScheduleSchema,
  updateScheduleSchema
}
