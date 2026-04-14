const mqtt = require('mqtt')
const prisma = require('./prisma')
const { getIO } = require('./socket')

let client = null

const initMQTT = () => {
  if (client) return client

  const options = {
    clientId: `${process.env.MQTT_CLIENT_ID || 'digital_twin_api'}_${Math.random().toString(16).substring(2, 8)}`,
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clean: true,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
  }

  const brokerUrl = process.env.MQTT_URL || 'mqtt://localhost:1883'

  client = mqtt.connect(brokerUrl, options)

  client.on('connect', () => {
    console.log('--- MQTT Connected ---')
    // Subscribe to all topics to catch status updates from any custom topic structure
    client.subscribe('#', { qos: 1 }, (err) => {
      if (!err) console.log('MQTT Subscribed to all topics (#)')
    })
  })

  client.on('message', async (topic, message) => {
    try {
      const payload = message.toString().toLowerCase()
      
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
            data: { is_on: isOn }
          })
          
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

          console.log(`[MQTT] Device '${device.name}' state updated to: ${isOn}`)
        }
      }

      // Handler untuk data sensor PZEM (topic berakhiran /data)
      if (topic.endsWith('/data')) {
        const baseTopic = topic.replace('/data', '')
        
        // Cari device untuk dapetin room_id
        const device = await prisma.device.findFirst({
          where: { mqtt_topic: baseTopic },
          select: { room_id: true, name: true }
        })

        if (device) {
          const data = JSON.parse(message.toString())
          const { voltage, current, power, energy, frequency, power_factor } = data

          const sensorData = {
            room_id: device.room_id,
            voltage: voltage ? parseFloat(voltage) : null,
            current: current ? parseFloat(current) : null,
            power: power ? parseFloat(power) : null,
            energy: energy ? parseFloat(energy) : null,
            frequency: frequency ? parseFloat(frequency) : null,
            power_factor: power_factor ? parseFloat(power_factor) : null
          }

          await prisma.sensorLog.create({
            data: sensorData
          })

          // Emit real-time update via Socket.io
          try {
            getIO().emit('sensor-data', {
              ...sensorData,
              device_name: device.name,
              timestamp: new Date()
            })
          } catch (ioError) {
            // Silently fail if socket is not initialized
          }

          console.log(`[MQTT] Sensor data saved for room of device '${device.name}'`)
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
              id: { in: devices.map(d => d.id) }
            },
            data: { is_online: isOnline }
          })

          devices.forEach(device => {
            try {
              getIO().emit('device-status', {
                device_id: device.id,
                name: device.name,
                is_online: isOnline
              })
            } catch (ioError) {}
          })

          console.log(`[MQTT] ${devices.length} devices marked as ${isOnline ? 'ONLINE' : 'OFFLINE'} via ${topic}`)
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

  const payload = typeof message === 'object' ? JSON.stringify(message) : message
  
  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error(`MQTT Publish Error to ${topic}:`, err.message)
    } else {
      console.log(`MQTT Published to ${topic}:`, payload)
    }
  })
}

module.exports = { initMQTT, getMQTTClient, publish }

