const prisma = require('../../config/prisma');
const { success, error } = require('../../config/response');
const { restartDeviceAutoControlJob } = require('../../common/jobs/device-auto-control.job');

const getDeviceSchedule = async (req, res) => {
  try {
    const onTimeSetting = await prisma.setting.findUnique({
      where: { key: 'DEVICE_AUTO_ON_TIME' }
    });
    const offTimeSetting = await prisma.setting.findUnique({
      where: { key: 'DEVICE_AUTO_OFF_TIME' }
    });

    return success(res, 'Device schedule fetched successfully', {
      onTime: onTimeSetting ? onTimeSetting.value : '06:00',
      offTime: offTimeSetting ? offTimeSetting.value : '21:00'
    });
  } catch (err) {
    console.error('[Settings] getDeviceSchedule Error:', err);
    return error(res, 'Failed to fetch device schedule', 500);
  }
};

const updateDeviceSchedule = async (req, res) => {
  try {
    const { onTime, offTime } = req.body;
    
    // Validate time format HH:mm
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    
    if (onTime && !timeRegex.test(onTime)) {
      return error(res, 'Invalid onTime format. Use HH:mm', 400);
    }
    
    if (offTime && !timeRegex.test(offTime)) {
      return error(res, 'Invalid offTime format. Use HH:mm', 400);
    }

    if (onTime) {
      await prisma.setting.upsert({
        where: { key: 'DEVICE_AUTO_ON_TIME' },
        update: { value: onTime },
        create: { key: 'DEVICE_AUTO_ON_TIME', value: onTime }
      });
    }

    if (offTime) {
      await prisma.setting.upsert({
        where: { key: 'DEVICE_AUTO_OFF_TIME' },
        update: { value: offTime },
        create: { key: 'DEVICE_AUTO_OFF_TIME', value: offTime }
      });
    }

    // Restart the cron job with new settings
    if (onTime || offTime) {
      await restartDeviceAutoControlJob();
    }

    return success(res, 'Device schedule updated successfully');
  } catch (err) {
    console.error('[Settings] updateDeviceSchedule Error:', err);
    return error(res, 'Failed to update device schedule', 500);
  }
};

module.exports = {
  getDeviceSchedule,
  updateDeviceSchedule
};
