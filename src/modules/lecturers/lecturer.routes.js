const express = require('express')
const router = express.Router()
const lecturerController = require('./lecturer.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const {
  uploadExcel,
  handleUploadError
} = require('../../common/middlewares/upload.middleware')
const {
  createLecturerSchema,
  updateLecturerSchema
} = require('./lecturer.schema')

router.post('/', validate(createLecturerSchema), lecturerController.create)
router.get('/template', lecturerController.downloadTemplate)
router.post(
  '/upload',
  uploadExcel.single('file'),
  handleUploadError,
  lecturerController.uploadExcel
)
router.get('/all', lecturerController.getAllActive)
router.get('/attendance-history', lecturerController.getAttendanceHistory)
router.get('/', lecturerController.getAll)
router.get('/:id/activity-log', lecturerController.getActivityLog)
router.get('/:id', lecturerController.getById)
router.patch('/:id', validate(updateLecturerSchema), lecturerController.update)
router.patch('/status/override', lecturerController.overrideStatus)
router.delete('/:id', lecturerController.delete)

module.exports = router
