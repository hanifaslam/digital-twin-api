const cron = require('node-cron')
const prisma = require('../../config/prisma')

const initSensorCleanupJob = () => {
  // Jalankan setiap jam 00:01 tengah malam
  cron.schedule('1 0 * * *', async () => {
    console.log('--- Starting Sensor Data Aggregation & Cleanup ---')
    
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // 1. Ambil semua room yang punya sensor logs kemarin
      const rooms = await prisma.room.findMany({
        where: {
          sensor_logs: {
            some: {
              created_at: {
                gte: yesterday,
                lt: today
              }
            }
          }
        }
      })

      for (const room of rooms) {
        // 2. Hitung rata-rata untuk setiap room
        const aggregation = await prisma.sensorLog.aggregate({
          where: {
            room_id: room.id,
            created_at: {
              gte: yesterday,
              lt: today
            }
          },
          _avg: {
            voltage: true,
            current: true,
            power: true
          },
          _max: {
            energy: true // Energy biasanya akumulatif, jadi kita ambil nilai terakhir (max) di hari itu
          }
        })

        // 3. Simpan ke DailySensorSummary
        if (aggregation._avg.power !== null) {
          await prisma.dailySensorSummary.upsert({
            where: {
              room_id_date: {
                room_id: room.id,
                date: yesterday
              }
            },
            update: {
              avg_voltage: aggregation._avg.voltage,
              avg_current: aggregation._avg.current,
              avg_power: aggregation._avg.power,
              total_energy: aggregation._max.energy
            },
            create: {
              room_id: room.id,
              date: yesterday,
              avg_voltage: aggregation._avg.voltage,
              avg_current: aggregation._avg.current,
              avg_power: aggregation._avg.power,
              total_energy: aggregation._max.energy
            }
          })
          console.log(`[Job] Summary created for room: ${room.name}`)
        }
      }

      // 4. Hapus data SensorLog yang lebih lama dari 30 hari
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const deleted = await prisma.sensorLog.deleteMany({
        where: {
          created_at: {
            lt: thirtyDaysAgo
          }
        }
      })

      console.log(`[Job] Cleanup complete. Deleted ${deleted.count} old sensor logs.`)
      console.log('--- Sensor Data Aggregation & Cleanup Finished ---')
    } catch (error) {
      console.error('[Job] Error in cleanup job:', error.message)
    }
  })
}

module.exports = { initSensorCleanupJob }
