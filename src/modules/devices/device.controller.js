const { DeviceType } = require('@prisma/client')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')
const { publish, getMQTTClient } = require('../../config/mqtt')

const mapLatestTelemetry = (log) => {
  if (!log) return null

  return {
    sensor_type: log.sensor_type,
    voltage: log.voltage,
    current: log.current,
    power: log.power,
    energy: log.energy,
    frequency: log.frequency,
    power_factor: log.power_factor,
    temperature: log.temperature,
    humidity: log.humidity,
    created_at: log.created_at
  }
}

const deviceController = {
  create: async (req, res) => {
    try {
      const { name, type, room_id, mqtt_topic, stream_url, status } =
        req.body || {}

      if (!name || !type) {
        return error(res, 'Missing required fields', 400)
      }

      if (type.toUpperCase() !== 'CCTV' && !room_id) {
        return error(res, 'Room is required for this device type', 400)
      }

      if (room_id) {
        const roomExists = await prisma.room.findUnique({
          where: { id: room_id }
        })
        if (!roomExists) return error(res, 'Room not found', 404)
      }

      await prisma.device.create({
        data: {
          name,
          type: type.toUpperCase(),
          room_id: room_id || null,
          mqtt_topic: mqtt_topic || null,
          stream_url: stream_url || null,
          status:
            status !== undefined ? status === 'true' || status === true : true
        }
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const { q, type, room_id, building_id, status, exclude_type } =
        req.query || {}
      const statuses = [
        ...new Set(
          status
            ?.split(',')
            .map((item) => item.trim().toLowerCase())
            .filter((item) => item === 'true' || item === 'false')
        )
      ]
      const excludedTypes = [
        ...new Set(
          exclude_type
            ?.split(',')
            .map((item) => item.trim().toUpperCase())
            .filter(Boolean)
        )
      ]
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      let where = {}

      if (q) {
        where.name = { contains: q, mode: 'insensitive' }
      }

      if (type) {
        where.type = type
      }

      if (excludedTypes.length > 0) {
        where.type = {
          notIn: excludedTypes
        }
      }

      if (room_id) {
        where.room_id = room_id
      }

      if (building_id) {
        where.room = {
          building_id: building_id
        }
      }

      if (statuses?.length === 1) {
        where.status = statuses[0] === 'true'
      }

      const [devices, total] = await Promise.all([
        prisma.device.findMany({
          where,
          select: {
            id: true,
            name: true,
            type: true,
            room_id: true,
            room: {
              select: {
                name: true
              }
            },
            status: true,
            is_on: true,
            is_online: true,
            last_seen_at: true,
            last_latency_ms: true,
            sensor_logs: {
              select: {
                sensor_type: true,
                voltage: true,
                current: true,
                power: true,
                energy: true,
                frequency: true,
                power_factor: true,
                temperature: true,
                humidity: true,
                created_at: true
              },
              orderBy: {
                created_at: 'desc'
              },
              take: 1
            },
            created_at: true,
            updated_at: true
          },
          skip,
          take: perPage,
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.device.count({ where })
      ])

      const mqttClient = getMQTTClient()
      const isMqttConnected = mqttClient ? mqttClient.connected : false

      const result = devices.map((device) => ({
        id: device.id,
        name: device.name,
        type: device.type,
        room_id: device.room_id,
        room_name: device.room?.name,
        status: device.status,
        is_on: device.is_on,
        is_online: device.is_online,
        last_seen_at: device.last_seen_at,
        last_latency_ms: device.last_latency_ms,
        latest_telemetry: mapLatestTelemetry(device.sensor_logs?.[0]),
        is_mqtt_connected: isMqttConnected,
        created_at: device.created_at,
        updated_at: device.updated_at
      }))

      const metadata = buildPagination(page, perPage, total)

      return success(res, 'success', result, 200, metadata)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const device = await prisma.device.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          type: true,
          room_id: true,
          mqtt_topic: true,
          stream_url: true,
          status: true,
          is_on: true,
          is_online: true,
          last_seen_at: true,
          last_latency_ms: true,
          created_at: true,
          updated_at: true,
          room: {
            select: {
              name: true
            }
          },
          sensor_logs: {
            select: {
              sensor_type: true,
              voltage: true,
              current: true,
              power: true,
              energy: true,
              frequency: true,
              power_factor: true,
              temperature: true,
              humidity: true,
              created_at: true
            },
            orderBy: {
              created_at: 'desc'
            },
            take: 1
          }
        }
      })

      if (!device) return error(res, 'Device not found', 404)

      const result = {
        id: device.id,
        name: device.name,
        type: device.type,
        room_id: device.room_id,
        room_name: device.room?.name,
        mqtt_topic: device.mqtt_topic,
        stream_url: device.stream_url,
        status: device.status,
        is_on: device.is_on,
        is_online: device.is_online,
        last_seen_at: device.last_seen_at,
        last_latency_ms: device.last_latency_ms,
        latest_telemetry: mapLatestTelemetry(device.sensor_logs?.[0]),
        created_at: device.created_at,
        updated_at: device.updated_at
      }

      return success(res, 'success', result)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, type, room_id, mqtt_topic, stream_url, status } =
        req.body || {}

      const deviceExists = await prisma.device.findUnique({
        where: { id }
      })
      if (!deviceExists) return error(res, 'Device not found', 404)

      if (room_id) {
        const roomExists = await prisma.room.findUnique({
          where: { id: room_id }
        })
        if (!roomExists) return error(res, 'Room not found', 404)
      }

      let updateData = {
        name,
        type: type ? type.toUpperCase() : undefined,
        room_id,
        mqtt_topic: mqtt_topic === '' ? null : mqtt_topic,
        stream_url: stream_url === '' ? null : stream_url,
        status:
          status !== undefined
            ? status === 'true' || status === true
            : undefined
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      const updatedDevice = await prisma.device.update({
        where: { id },
        data: updateData,
        include: {
          room: {
            select: {
              name: true
            }
          }
        }
      })

      // Flatten response and order property: room_name after room_id
      const result = {
        id: updatedDevice.id,
        name: updatedDevice.name,
        type: updatedDevice.type,
        room_id: updatedDevice.room_id,
        room_name: updatedDevice.room?.name,
        mqtt_topic: updatedDevice.mqtt_topic,
        stream_url: updatedDevice.stream_url,
        status: updatedDevice.status,
        is_on: updatedDevice.is_on,
        last_seen_at: updatedDevice.last_seen_at,
        last_latency_ms: updatedDevice.last_latency_ms,
        created_at: updatedDevice.created_at,
        updated_at: updatedDevice.updated_at
      }

      // Publish to MQTT if status was updated and topic exists
      if (status !== undefined && updatedDevice.mqtt_topic) {
        publish(
          updatedDevice.mqtt_topic,
          updatedDevice.status ? 'true' : 'false'
        )
      }

      return success(res, 'success', result)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  delete: async (req, res) => {
    try {
      const { id } = req.params
      const deviceExists = await prisma.device.findUnique({
        where: { id }
      })
      if (!deviceExists) return error(res, 'Device not found', 404)

      await prisma.device.delete({ where: { id } })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const device = await prisma.device.findUnique({
        where: { id }
      })
      if (!device) return error(res, 'Device not found', 404)

      const newStatus = !device.status

      await prisma.device.update({
        where: { id },
        data: { status: newStatus }
      })

      // Publish to MQTT if topic exists
      if (device.mqtt_topic) {
        publish(device.mqtt_topic, newStatus ? 'true' : 'false')
      }

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  deviceControl: async (req, res) => {
    try {
      const { id } = req.params
      const { command } = req.body || {} // expected: true or false (boolean or string)

      const device = await prisma.device.findUnique({
        where: { id }
      })

      if (!device) return error(res, 'Device not found', 404)
      if (!device.mqtt_topic) {
        return error(res, 'Device has no MQTT topic configured', 400)
      }

      if (command === undefined || command === null) {
        return error(res, 'Command is required (true/false)', 400)
      }

      const message = command === true || command === 'true' ? 'true' : 'false'
      publish(device.mqtt_topic, message)

      return success(res, `Device command '${message}' sent`)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getCctvStreams: async (req, res) => {
    try {
      const cctvs = await prisma.device.findMany({
        where: {
          type: 'CCTV'
        },
        select: {
          id: true,
          name: true,
          stream_url: true,
          room: {
            select: {
              name: true
            }
          }
        }
      })

      const result = cctvs.map((cctv) => ({
        id: cctv.id,
        name: cctv.name,
        stream_url: cctv.stream_url,
        room_name: cctv.room?.name || null
      }))

      return success(res, 'success', result)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getTypes: async (req, res) => {
    try {
      const types = Object.values(DeviceType)
      return success(res, 'success', types)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = deviceController
