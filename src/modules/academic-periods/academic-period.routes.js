const express = require('express')
const router = express.Router()
const academicPeriodController = require('./academic-period.controller')
const { validate } = require('../../common/middlewares/validate.middleware')
const {
  createAcademicPeriodSchema,
  updateAcademicPeriodSchema
} = require('./academic-period.schema')

router.post('/', validate(createAcademicPeriodSchema), academicPeriodController.create)
router.patch(
  '/:id',
  validate(updateAcademicPeriodSchema),
  academicPeriodController.update
)

module.exports = router
