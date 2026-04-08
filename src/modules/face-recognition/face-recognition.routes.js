const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const faceRecognitionController = require('./face-recognition.controller')

const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/
    const valid = allowed.test(path.extname(file.originalname).toLowerCase())
    if (valid) cb(null, true)
    else cb(new Error('Only image files are allowed (jpeg, jpg, png, webp)'))
  }
})

router.post(
  '/register',
  upload.single('image'),
  faceRecognitionController.register
)
router.post('/verify', upload.single('image'), faceRecognitionController.verify)
router.get('/status', faceRecognitionController.checkStatus)
router.get('/status/:lecturer_id', faceRecognitionController.checkStatus)

module.exports = router
