const multer = require('multer')
const path = require('path')
const { error } = require('../../config/response')

const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  )
  const mimetype = allowedTypes.test(file.mimetype)

  if (extname && mimetype) {
    return cb(null, true)
  }
  cb(new Error('Only image formats are allowed (jpeg, jpg, png, webp)'))
}

const uploadImage = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: fileFilter
})

const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return error(res, `Upload error: ${err.message}`, 400)
  } else if (err) {
    return error(res, err.message, 400)
  }
  next()
}

module.exports = {
  uploadImage,
  handleUploadError
}
