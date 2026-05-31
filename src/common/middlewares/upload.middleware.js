const multer = require('multer')
const path = require('path')
const { error } = require('../../config/response')

const storage = multer.memoryStorage()

const imageFileFilter = (req, file, cb) => {
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

const excelFileFilter = (req, file, cb) => {
  const allowedExtensions = ['.xlsx', '.xls']
  const allowedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream'
  ]
  const extname = path.extname(file.originalname).toLowerCase()
  const isAllowedExtension = allowedExtensions.includes(extname)
  const isAllowedMimeType = allowedMimeTypes.includes(file.mimetype)

  if (isAllowedExtension && isAllowedMimeType) {
    return cb(null, true)
  }

  cb(new Error('Only Excel files are allowed (.xlsx, .xls)'))
}

const uploadImage = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: imageFileFilter
})

const uploadExcel = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: excelFileFilter
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
  uploadExcel,
  handleUploadError
}
