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
