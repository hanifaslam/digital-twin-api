const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')

const normalizeSensorType = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  return value.trim().toUpperCase()
}

const buildEnvironmentLogWhere = (roomId, sensorType) => ({
  room_id: roomId,
  ...(sensorType ? { sensor_type: sensorType } : {}),
  OR: [{ temperature: { not: null } }, { humidity: { not: null } }]
})

const environmentLogInclude = {
  room: {
    select: {
      id: true,
      name: true
    }
  },
  device: {
    select: {
      id: true,
      name: true,
      type: true,
      mqtt_topic: true,
      is_online: true,
      last_seen_at: true
    }
  }
}

const mapEnvironmentPayload = (log) => {
  if (!log) return null

  return {
    room_id: log.room_id,
    room_name: log.room?.name || null,
    device_id: log.device_id || log.device?.id || null,
    device_name: log.device?.name || null,
    device_type: log.device?.type || null,
    mqtt_topic: log.device?.mqtt_topic || null,
    is_online: log.device?.is_online ?? null,
    last_seen_at: log.device?.last_seen_at || null,
    sensor_type: log.sensor_type || 'DHT22',
    temperature: log.temperature,
    humidity: log.humidity,
    updated_at: log.created_at
  }
}

const sensorController = {
  getLatestByRoom: async (req, res) => {
    try {
      const { roomId } = req.params
      const sensorType = normalizeSensorType(req.query?.sensor_type)
      const where = {
        room_id: roomId,
        ...(sensorType ? { sensor_type: sensorType } : {})
      }

      const latestLog = await prisma.sensorLog.findFirst({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          room: {
            select: {
              name: true,
              building: {
                select: { name: true }
              }
            }
          },
          device: {
            select: {
              id: true,
              name: true,
              type: true,
              mqtt_topic: true
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
      const sensorType = normalizeSensorType(req.query?.sensor_type)

      const latestLog = await prisma.sensorLog.findFirst({
        where: {
          device_id: deviceId,
          ...(sensorType ? { sensor_type: sensorType } : {})
        },
        orderBy: { created_at: 'desc' },
        include: {
          room: {
            select: {
              id: true,
              name: true
            }
          },
          device: {
            select: {
              id: true,
              name: true,
              type: true,
              mqtt_topic: true
            }
          }
        }
      })

      if (!latestLog) {
        return error(res, 'No sensor data found for this device', 404)
      }

      return success(res, 'success', latestLog)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getHistory: async (req, res) => {
    try {
      const { roomId } = req.query
      const { deviceId } = req.query
      const limit = parseInt(req.query.limit) || 50
      const sensorType = normalizeSensorType(req.query.sensor_type)

      if (!roomId && !deviceId) {
        return error(res, 'roomId or deviceId is required', 400)
      }

      const where = {
        ...(roomId ? { room_id: roomId } : {}),
        ...(deviceId ? { device_id: deviceId } : {}),
        ...(sensorType ? { sensor_type: sensorType } : {})
      }

      const logs = await prisma.sensorLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        include: {
          device: {
            select: {
              id: true,
              name: true,
              type: true
            }
          }
        }
      })

      return success(res, 'success', logs.reverse()) // Balikin berurutan waktu (lama ke baru) buat chart
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getRoomEnvironment: async (req, res) => {
    try {
      const { roomId } = req.params
      const sensorType = normalizeSensorType(req.query?.sensor_type) || 'DHT22'

      const latestLog = await prisma.sensorLog.findFirst({
        where: buildEnvironmentLogWhere(roomId, sensorType),
        orderBy: { created_at: 'desc' },
        include: environmentLogInclude
      })

      if (!latestLog) {
        return error(res, 'No environment data found for this room', 404)
      }

      return success(res, 'success', mapEnvironmentPayload(latestLog))
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = {
  ...sensorController,
  mapEnvironmentPayload,
  buildEnvironmentLogWhere
}
