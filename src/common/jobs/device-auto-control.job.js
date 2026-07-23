const cron = require('node-cron')
const prisma = require('../../config/prisma')
const { publish } = require('../../config/mqtt')

let cronOnJob = null;
let cronOffJob = null;

const controlDevicesBySchedule = async (command) => {
  const label = command === 'true' ? 'ON' : 'OFF'
  console.log(`[Cron] Executing scheduled ${label} command for all LIGHT and AC devices...`)
  
  try {
    // Cari semua device yang aktif secara sistem (status: true) dan bertipe LIGHT atau AC
    const devices = await prisma.device.findMany({
      where: {
        status: true,
        type: { in: ['LIGHT', 'AC'] },
        mqtt_topic: { not: null }
      }
    })

    if (devices.length === 0) {
      console.log('[Cron] No eligible devices found for scheduled control.')
      return
    }

    for (const device of devices) {
      publish(device.mqtt_topic, command)
      console.log(`[Cron] Sent ${label} to ${device.name} (${device.mqtt_topic})`)
    }
    
    console.log(`[Cron] Scheduled ${label} operation completed for ${devices.length} devices.`)
  } catch (error) {
    console.error('[Cron Error] Device Auto Control:', error)
  }
}

// Convert "HH:mm" to cron string format "mm HH * * *"
const convertTimeToCron = (timeString) => {
  const [hour, minute] = timeString.split(':');
  return `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
};

const getOrSetSetting = async (key, defaultValue) => {
  let setting = await prisma.setting.findUnique({ where: { key } });
  if (!setting) {
    setting = await prisma.setting.create({
      data: {
        key,
        value: defaultValue
      }
    });
  }
  return setting.value;
};

const initDeviceAutoControlJob = async () => {
  try {
    // 1. Fetch settings or use defaults
    const onTime = await getOrSetSetting('DEVICE_AUTO_ON_TIME', '06:00');
    const offTime = await getOrSetSetting('DEVICE_AUTO_OFF_TIME', '21:00');

    // 2. Stop existing jobs if any
    if (cronOnJob) cronOnJob.stop();
    if (cronOffJob) cronOffJob.stop();

    // 3. Start new jobs
    const cronOnStr = convertTimeToCron(onTime);
    cronOnJob = cron.schedule(cronOnStr, () => controlDevicesBySchedule('true'), {
      timezone: "Asia/Jakarta"
    });

    const cronOffStr = convertTimeToCron(offTime);
    cronOffJob = cron.schedule(cronOffStr, () => controlDevicesBySchedule('false'), {
      timezone: "Asia/Jakarta"
    });

    console.log(`[Cron] Device Auto Control Job initialized (ON: ${onTime}, OFF: ${offTime})`);
  } catch (error) {
    console.error('[Cron Error] Device Auto Control Initialization failed:', error);
  }
}

const restartDeviceAutoControlJob = async () => {
  console.log('[Cron] Restarting Device Auto Control Job...');
  await initDeviceAutoControlJob();
}

module.exports = {
  initDeviceAutoControlJob,
  restartDeviceAutoControlJob
}
