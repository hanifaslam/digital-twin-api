const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')

const sensorController = {
  getLatestByRoom: async (req, res) => {
    try {
      const { roomId } = req.params
      
      const latestLog = await prisma.sensorLog.findFirst({
        where: { room_id: roomId },
        orderBy: { created_at: 'desc' },
        include: {
          room: {
            select: {
              name: true,
              building: {
                select: { name: true }
              }
            }
          }
        }
      })

      if (!latestLog) {
        return error(res, 'No sensor data found for this room', 404)
      }

      return success(res, 'success', latestLog)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getLatestByDevice: async (req, res) => {
    try {
      const { deviceId } = req.params
      
      // Cari device untuk dapetin room_id nya
      const device = await prisma.device.findUnique({
        where: { id: deviceId },
        select: { room_id: true, name: true }
      })

      if (!device) {
        return error(res, 'Device not found', 404)
      }

      const latestLog = await prisma.sensorLog.findFirst({
        where: { room_id: device.room_id },
        orderBy: { created_at: 'desc' }
      })

      if (!latestLog) {
        return error(res, 'No sensor data found for the room of this device', 404)
      }

      return success(res, 'success', {
        device_name: device.name,
        ...latestLog
      })
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getHistory: async (req, res) => {
    try {
      const { roomId } = req.query
      const limit = parseInt(req.query.limit) || 50

      if (!roomId) {
        return error(res, 'room_id is required', 400)
      }

      const logs = await prisma.sensorLog.findMany({
        where: { room_id: roomId },
        orderBy: { created_at: 'desc' },
        take: limit
      })

      return success(res, 'success', logs.reverse()) // Balikin berurutan waktu (lama ke baru) buat chart
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = sensorController
