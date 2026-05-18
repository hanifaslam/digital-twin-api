const express = require('express')
const dashboardController = require('./dashboard.controller')

const router = express.Router()

router.get('/summary-cards', dashboardController.getSummaryCards)
router.get('/weekly-attendance', dashboardController.getWeeklyAttendanceOverview)
router.get('/live-ongoing-classes', dashboardController.getLiveOngoingClasses)
router.get('/upcoming-classes', dashboardController.getUpcomingClasses)
router.get(
  '/device-monitoring-status',
  dashboardController.getDeviceMonitoringStatus
)
router.get('/my-teaching-schedule', dashboardController.getMyTeachingSchedule)
router.get('/semester-summary', dashboardController.getSemesterSummary)

module.exports = router
