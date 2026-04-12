const cron = require('node-cron')
const prisma = require('../../config/prisma')
const { publish } = require('../../config/mqtt')

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

const initDeviceAutoControlJob = () => {
  // Jam 06:00 Pagi: Nyalakan semua (True)
  cron.schedule('0 6 * * *', () => controlDevicesBySchedule('true'), {
    timezone: "Asia/Jakarta"
  })

  // Jam 21:00 Malam: Matikan semua (False)
  cron.schedule('0 21 * * *', () => controlDevicesBySchedule('false'), {
    timezone: "Asia/Jakarta"
  })

  console.log('[Cron] Device Auto Control Job initialized (06:00 & 21:00)')
}

module.exports = initDeviceAutoControlJob
