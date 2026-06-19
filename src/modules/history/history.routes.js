const express = require('express');
const router = express.Router();
const historyController = require('./history.controller');

router.get('/device/export', historyController.exportDeviceHistory);
router.get('/device', historyController.getDeviceHistory);

router.get('/lecturer/export', historyController.exportLecturerHistory);
router.get('/lecturer', historyController.getLecturerHistory);
router.get('/lecturer/:id/activity-log', historyController.getActivityLog);

module.exports = router;
