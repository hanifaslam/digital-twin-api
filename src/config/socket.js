const { Server } = require('socket.io')

let io

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

module.exports = { initSocket, getIO }
