const mqtt = require('mqtt')
const prisma = require('./prisma')
const {
  getIO,
  emitEnergyMonitoringUpdate,
  emitDeviceLiveSummaryUpdate,
  emitRoomEnvironmentUpdate,
  emitActivityLogUpdate
} = require('./socket')
const {
  buildDeviceLiveSummary,
  buildEnergyMonitoringSummary
} = require('../modules/dashboard/dashboard.controller')
const {
  mapEnvironmentPayload
} = require('../modules/sensors/sensor.controller')
const { addActivityLog } = require('../common/activity-log')

let client = null
let pingInterval = null
let pingSequence = 0

const PING_INTERVAL_MS = Number(process.env.MQTT_PING_INTERVAL_MS || 15000)
const pingRequests = new Map()

const markDeviceSeen = async (where) => {
  await prisma.device.updateMany({
    where,
    data: { last_seen_at: new Date() }
  })
}

const tryParseJson = (value) => {
  try {
    return JSON.parse(value)
  } catch (err) {
    return null
  }
}

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const inferSensorType = (payload = {}) => {
  if (typeof payload.sensor_type === 'string' && payload.sensor_type.trim()) {
    return payload.sensor_type.trim().toUpperCase()
  }

  if (payload.temperature !== undefined || payload.humidity !== undefined) {
    return 'DHT22'
  }

  if (
    payload.voltage !== undefined ||
    payload.current !== undefined ||
    payload.power !== undefined ||
    payload.energy !== undefined ||
    payload.frequency !== undefined ||
    payload.power_factor !== undefined
  ) {
    return 'PZEM'
  }

  return null
}

const emitDeviceTelemetry = (payload) => {
  try {
    getIO().emit('device-telemetry', payload)
  } catch (ioError) {
    // Silently fail if socket is not initialized
  }
}

const emitLatestDeviceLiveSummary = async () => {
  try {
    const summary = await buildDeviceLiveSummary(null)
    emitDeviceLiveSummaryUpdate(summary)
  } catch (err) {
    console.error('[MQTT] Device live summary emit error:', err.message)
  }
}

const pushActivityLog = (entry) => {
  const item = addActivityLog(entry)
  emitActivityLogUpdate(item)
}

const sendDevicePings = async () => {
  if (!client || !client.connected) return

  try {
    const devices = await prisma.device.findMany({
      where: {
        status: true,
        mqtt_topic: { not: null }
      },
      select: {
        id: true,
        mqtt_topic: true
      }
    })

    const now = Date.now()

    devices.forEach((device) => {
      if (!device.mqtt_topic) return

      const pingId = `${device.id}-${now}-${pingSequence++}`
      const payload = {
        ping_id: pingId,
        sent_at: now
      }

      pingRequests.set(pingId, {
        deviceId: device.id,
        mqttTopic: device.mqtt_topic,
        sentAt: now
      })

      client.publish(`${device.mqtt_topic}/ping`, JSON.stringify(payload), {
        qos: 1
      })
    })

    const cutoff = now - PING_INTERVAL_MS * 3
    for (const [pingId, request] of pingRequests.entries()) {
      if (request.sentAt < cutoff) {
        pingRequests.delete(pingId)
      }
    }
  } catch (err) {
    console.error('[MQTT] Ping scheduler error:', err.message)
  }
}

const ensurePingScheduler = () => {
  if (pingInterval) return

  pingInterval = setInterval(() => {
    sendDevicePings().catch((err) => {
      console.error('[MQTT] Ping interval error:', err.message)
    })
  }, PING_INTERVAL_MS)
}

const initMQTT = () => {
  if (client) return client

  const options = {
    clientId: `${process.env.MQTT_CLIENT_ID || 'digital_twin_api'}_${Math.random().toString(16).substring(2, 8)}`,
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clean: true,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000
  }

  const brokerUrl = process.env.MQTT_URL || 'mqtt://localhost:1883'

  client = mqtt.connect(brokerUrl, options)

  client.on('connect', () => {
    console.log('--- MQTT Connected ---')
    // Subscribe to all topics to catch status updates from any custom topic structure
    client.subscribe('#', { qos: 1 }, (err) => {
      if (!err) console.log('MQTT Subscribed to all topics (#)')
    })
    ensurePingScheduler()
    sendDevicePings().catch((err) => {
      console.error('[MQTT] Initial ping error:', err.message)
    })
  })

  client.on('message', async (topic, message, packet) => {
    try {
      const rawMessage = message.toString()
      const payload = rawMessage.toLowerCase()
      const now = new Date()
      const isRetainedMessage = Boolean(packet?.retain)

      // Expected pattern: any/custom/topic/status
      if (topic.endsWith('/status')) {
        const baseTopic = topic.replace('/status', '')
        const isOn = payload === 'true' || payload === '1' || payload === 'on'

        // Find device by its configured mqtt_topic
        const device = await prisma.device.findFirst({
          where: { mqtt_topic: baseTopic },
          select: { id: true, name: true, is_on: true }
        })

        if (device) {
          await prisma.device.update({
            where: { id: device.id },
            data: { is_on: isOn, last_seen_at: now }
          })
          await emitLatestDeviceLiveSummary()
          if (!isRetainedMessage) {
            pushActivityLog({
              category: 'DEVICE',
              message: `${device.name} switched ${isOn ? 'ON' : 'OFF'}.`
            })
          }

          // Emit selalu dilakukan agar semua tab (Web 1, Web 2) tersinkronisasi
          try {
            getIO().emit('device-status', {
              device_id: device.id,
              name: device.name,
              is_on: isOn
            })
          } catch (ioError) {
            // Silently fail if socket is not initialized
          }

          console.log(
            `[MQTT] Device '${device.name}' state updated to: ${isOn}`
          )
        }
      }

      // Handler untuk data sensor (PZEM / DHT22) pada topic berakhiran /data
      if (topic.endsWith('/data')) {
        const baseTopic = topic.replace('/data', '')

        // Cari device untuk dapetin room_id dan device_id
        const device = await prisma.device.findFirst({
          where: { mqtt_topic: baseTopic },
          select: { id: true, room_id: true, name: true, type: true }
        })

        if (device) {
          const data = tryParseJson(rawMessage)
          if (!data) {
            console.error(`[MQTT] Invalid JSON payload received on ${topic}`)
            return
          }

          const sensorType = inferSensorType(data)
          const sensorData = {
            room_id: device.room_id,
            device_id: device.id,
            sensor_type: sensorType,
            voltage: toNullableNumber(data.voltage),
            current: toNullableNumber(data.current),
            power: toNullableNumber(data.power),
            energy: toNullableNumber(data.energy),
            frequency: toNullableNumber(data.frequency),
            power_factor: toNullableNumber(data.power_factor),
            temperature: toNullableNumber(data.temperature),
            humidity: toNullableNumber(data.humidity)
          }

          const hasElectricalMetrics = [
            sensorData.voltage,
            sensorData.current,
            sensorData.power,
            sensorData.energy,
            sensorData.frequency,
            sensorData.power_factor
          ].some((value) => value !== null)

          const hasEnvironmentalMetrics = [
            sensorData.temperature,
            sensorData.humidity
          ].some((value) => value !== null)

          if (!hasElectricalMetrics && !hasEnvironmentalMetrics) {
            console.log(
              `[MQTT] Ignored telemetry without supported metrics on ${topic}`
            )
            return
          }

          await prisma.device.update({
            where: { id: device.id },
            data: {
              is_online: true,
              last_seen_at: now
            }
          })

          await prisma.sensorLog.create({
            data: sensorData
          })

          const room = await prisma.room.findUnique({
            where: { id: device.room_id },
            select: { id: true, name: true, building_id: true }
          })

          await emitLatestDeviceLiveSummary()

          if (room?.building_id) {
            const summary = await buildEnergyMonitoringSummary(room.building_id)
            emitEnergyMonitoringUpdate(room.building_id, summary)
          }

          if (hasElectricalMetrics) {
            pushActivityLog({
              category: 'TELEMETRY',
              message: `Power load updated to ${Math.round(Number(sensorData.power || 0))}W from ${device.name}.`
            })
          } else if (hasEnvironmentalMetrics) {
            const tempLabel =
              sensorData.temperature === null
                ? '--'
                : `${sensorData.temperature.toFixed(1)}C`
            const humidityLabel =
              sensorData.humidity === null
                ? '--'
                : `${sensorData.humidity.toFixed(1)}%`

            pushActivityLog({
              category: 'TELEMETRY',
              message: `Environment updated from ${device.name} (${tempLabel}, ${humidityLabel}).`
            })
          }

          // Emit real-time update via Socket.io
          try {
            getIO().emit('sensor-data', {
              ...sensorData,
              device_id: device.id,
              device_name: device.name,
              device_type: device.type,
              timestamp: new Date()
            })
          } catch (ioError) {
            // Silently fail if socket is not initialized
          }

          if (hasEnvironmentalMetrics) {
            emitRoomEnvironmentUpdate(
              device.room_id,
              mapEnvironmentPayload({
                ...sensorData,
                created_at: now,
                room: {
                  id: device.room_id,
                  name: room?.name || null
                },
                device: {
                  id: device.id,
                  name: device.name,
                  type: device.type,
                  mqtt_topic: baseTopic,
                  is_online: true,
                  last_seen_at: now
                }
              })
            )
          }

          console.log(
            `[MQTT] ${sensorType || 'SENSOR'} data saved for device '${device.name}'`
          )
        }
      }

      // Handler untuk availability (online/offline)
      if (topic.endsWith('/availability')) {
        const availabilityTopic = topic.replace('/availability', '')
        const isOnline = payload === 'online'

        // Cari semua device yang mqtt_topic-nya diawali dengan baseTopic ini
        // Contoh: topic dosen_trk/availability -> update semua device yang mqtt_topic nya mengandung dosen_trk
        const devices = await prisma.device.findMany({
          where: {
            mqtt_topic: {
              startsWith: availabilityTopic
            }
          }
        })

        if (devices.length > 0) {
          await prisma.device.updateMany({
            where: {
              id: { in: devices.map((d) => d.id) }
            },
            data: { is_online: isOnline, last_seen_at: now }
          })
          await emitLatestDeviceLiveSummary()
          if (!isRetainedMessage) {
            pushActivityLog({
              category: 'GATEWAY',
              message: `${availabilityTopic} gateway ${isOnline ? 'connected' : 'disconnected'}.`
            })
          }

          devices.forEach((device) => {
            try {
              getIO().emit('device-status', {
                device_id: device.id,
                name: device.name,
                is_online: isOnline
              })
            } catch (ioError) {}
          })

          console.log(
            `[MQTT] ${devices.length} devices marked as ${isOnline ? 'ONLINE' : 'OFFLINE'} via ${topic}`
          )
        }
      }

      if (topic.endsWith('/heartbeat')) {
        const baseTopic = topic.replace('/heartbeat', '')

        const devices = await prisma.device.findMany({
          where: { mqtt_topic: baseTopic },
          select: { id: true, name: true }
        })

        if (devices.length > 0) {
          await prisma.device.updateMany({
            where: {
              id: { in: devices.map((device) => device.id) }
            },
            data: {
              is_online: true,
              last_seen_at: now
            }
          })
          await emitLatestDeviceLiveSummary()

          devices.forEach((device) => {
            emitDeviceTelemetry({
              device_id: device.id,
              name: device.name,
              last_seen_at: now,
              source: 'heartbeat'
            })
          })

          console.log(
            `[MQTT] Heartbeat received for ${devices.length} devices via ${topic}`
          )
        }
      }

      if (topic.endsWith('/pong')) {
        const baseTopic = topic.replace('/pong', '')
        const data = tryParseJson(rawMessage)

        if (!data?.ping_id || typeof data.sent_at !== 'number') {
          return
        }

        const request = pingRequests.get(data.ping_id)
        const latencyMs = Math.max(Date.now() - data.sent_at, 0)

        let where = { mqtt_topic: baseTopic }

        if (request?.deviceId) {
          where = { id: request.deviceId }
        }

        const devices = await prisma.device.findMany({
          where,
          select: { id: true, name: true }
        })

        if (devices.length > 0) {
          await prisma.device.updateMany({
            where: {
              id: { in: devices.map((device) => device.id) }
            },
            data: {
              is_online: true,
              last_seen_at: now,
              last_latency_ms: latencyMs
            }
          })
          await emitLatestDeviceLiveSummary()
          pushActivityLog({
            category: 'DEVICE',
            message: `Latency refreshed at ${latencyMs} ms for ${devices[0]?.name || 'device network'}.`
          })

          devices.forEach((device) => {
            emitDeviceTelemetry({
              device_id: device.id,
              name: device.name,
              last_seen_at: now,
              latency_ms: latencyMs,
              source: 'pong'
            })
          })

          pingRequests.delete(data.ping_id)
          console.log(
            `[MQTT] Pong received from ${topic} with latency ${latencyMs}ms`
          )
        }
      }
    } catch (error) {
      console.error('[MQTT] Message Handler Error:', error.message)
    }
  })

  client.on('error', (err) => {
    console.error('MQTT Connection Error:', err.message)
  })

  client.on('reconnect', () => {
    console.log('MQTT Reconnecting...')
  })

  return client
}

const getMQTTClient = () => {
  if (!client) {
    return initMQTT()
  }
  return client
}

/**
 * Helper function to publish to a topic
 * @param {string} topic
 * @param {object|string} message
 */
const publish = (topic, message) => {
  const mqttClient = getMQTTClient()
  if (!topic) return

  const payload =
    typeof message === 'object' ? JSON.stringify(message) : message

  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error(`MQTT Publish Error to ${topic}:`, err.message)
    } else {
      console.log(`MQTT Published to ${topic}:`, payload)
    }
  })
}

module.exports = { initMQTT, getMQTTClient, publish }
