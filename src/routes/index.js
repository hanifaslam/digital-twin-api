const express = require('express')
const router = express.Router()
const userRoutes = require('../modules/users/user.routes')
const lecturerRoutes = require('../modules/lecturers/lecturer.routes')
const authRoutes = require('../modules/auth/auth.routes')
const { authMiddleware } = require('../common/middlewares/auth.middleware')
const roleRoutes = require('../modules/roles/role.routes')
const permissionRoutes = require('../modules/permissions/permission.routes')
const studyProgramRoutes = require('../modules/study-programs/study-program.routes')

router.use('/auth', authRoutes)

router.use('/users', authMiddleware, userRoutes)
router.use('/lecturers', authMiddleware, lecturerRoutes)
router.use('/roles', authMiddleware, roleRoutes)
router.use('/permissions', permissionRoutes)
router.use('/study-programs', authMiddleware, studyProgramRoutes)

module.exports = router
