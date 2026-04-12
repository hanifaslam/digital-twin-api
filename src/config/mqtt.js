const mqtt = require('mqtt')

let client = null

const initMQTT = () => {
  if (client) return client

  const options = {
    clientId: process.env.MQTT_CLIENT_ID || `digital_twin_api_${Math.random().toString(16).substring(2, 8)}`,
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

        const prisma = require('./prisma') // Lazy load prisma
        
        // Find device by its configured mqtt_topic
        const device = await prisma.device.findFirst({
          where: { mqtt_topic: baseTopic }
        })

        if (device) {
          await prisma.device.update({
            where: { id: device.id },
            data: { is_on: isOn }
          })
          console.log(`[MQTT] Device '${device.name}' state updated to: ${isOn}`)
        }
      }

      // Handler untuk data sensor PZEM (topic berakhiran /data)
      if (topic.endsWith('/data')) {
        const baseTopic = topic.replace('/data', '')
        const prisma = require('./prisma')
        
        // Cari device untuk dapetin room_id
        const device = await prisma.device.findFirst({
          where: { mqtt_topic: baseTopic },
          select: { room_id: true, name: true }
        })

        if (device) {
          const data = JSON.parse(message.toString())
          const { voltage, current, power, energy } = data

          await prisma.sensorLog.create({
            data: {
              room_id: device.room_id,
              voltage: voltage ? parseFloat(voltage) : null,
              current: current ? parseFloat(current) : null,
              power: power ? parseFloat(power) : null,
              energy: energy ? parseFloat(energy) : null
            }
          })
          console.log(`[MQTT] Sensor data saved for room of device '${device.name}'`)
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
