const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');

router.get('/device-schedule', settingsController.getDeviceSchedule);
router.put('/device-schedule', settingsController.updateDeviceSchedule);

module.exports = router;
