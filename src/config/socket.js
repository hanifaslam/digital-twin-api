const { Server } = require('socket.io')

let io
const energyRoomPrefix = 'energy-monitoring:'
const roomEnvironmentPrefix = 'room-environment:'

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!process.env.FRONTEND_URL) {
          return callback(null, 'http://localhost:3000')
        }
        const allowedOrigins = process.env.FRONTEND_URL.split(',').map((url) =>
          url.trim().replace(/\/$/, '')
        )
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      },
      credentials: true
    }
  })

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    socket.on('energy-monitoring:subscribe', ({ building_id } = {}) => {
      if (!building_id) return

      socket.join(`${energyRoomPrefix}${building_id}`)
    })

    socket.on('energy-monitoring:unsubscribe', ({ building_id } = {}) => {
      if (!building_id) return

      socket.leave(`${energyRoomPrefix}${building_id}`)
    })

    socket.on('room-environment:subscribe', ({ room_id } = {}) => {
      if (!room_id) return

      socket.join(`${roomEnvironmentPrefix}${room_id}`)
    })

    socket.on('room-environment:unsubscribe', ({ room_id } = {}) => {
      if (!room_id) return

      socket.leave(`${roomEnvironmentPrefix}${room_id}`)
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  return io
}

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!')
  }
  return io
}

const emitEnergyMonitoringUpdate = (buildingId, payload) => {
  if (!io || !buildingId) return

  io.to(`${energyRoomPrefix}${buildingId}`).emit(
    'energy-monitoring:update',
    payload
  )
}

const emitDeviceLiveSummaryUpdate = (payload) => {
  if (!io) return

  io.emit('device-live-summary:update', payload)
}

const emitRoomEnvironmentUpdate = (roomId, payload) => {
  if (!io || !roomId) return

  io.to(`${roomEnvironmentPrefix}${roomId}`).emit(
    'room-environment:update',
    payload
  )
}

const emitActivityLogUpdate = (payload) => {
  if (!io) return

  io.emit('activity-log:update', payload)
}

module.exports = {
  initSocket,
  getIO,
  emitEnergyMonitoringUpdate,
  emitDeviceLiveSummaryUpdate,
  emitRoomEnvironmentUpdate,
  emitActivityLogUpdate
}
