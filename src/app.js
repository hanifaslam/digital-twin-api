require('dotenv').config()
const express = require('express')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const routes = require('./routes')
const { error } = require('./config/response')
const prisma = require('./config/prisma')
const redisClient = require('./config/redis')

const app = express()
app.set('trust proxy', 1)

app.use(
  cors({
    origin: (origin, callback) => {
      // Jika FRONTEND_URL tidak ada, default ke localhost
      if (!process.env.FRONTEND_URL) {
        return callback(null, 'http://localhost:3000')
      }

      // Split dengan koma dan trim setiap origin, hapus trailing slash jika ada
      const allowedOrigins = process.env.FRONTEND_URL.split(',').map((url) =>
        url.trim().replace(/\/$/, '')
      )

      // Izinkan jika origin request ada di daftar yang diizinkan
      // origin bisa undefined jika request bukan dari browser (misalnya mobile app atau curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        console.error(
          `CORS Error: Origin ${origin} not allowed. Allowed: ${allowedOrigins.join(', ')}`
        )
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser()) // PENTING: Untuk baca refresh token

// Health check for CD with Dokploy
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Main Routes
app.use('/api', routes)

// 404 Handler
app.use((req, res) => {
  return error(res, `Route ${req.method} ${req.originalUrl} not found`, 404)
})

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack)
  return error(
    res,
    process.env.NODE_ENV === 'development'
      ? err.message
      : 'Something went wrong!',
    500
  )
})

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

module.exports = app

let isShuttingDown = false

const shutdown = async (signal) => {
  if (isShuttingDown) return
  isShuttingDown = true

  server.close(async () => {
    try {
      await prisma.$disconnect().catch(() => {})

      if (prisma.pool) {
        await prisma.pool.end().catch(() => {})
      }

      if (redisClient.isOpen) {
        await redisClient.quit().catch(() => {})
      }
    } finally {
      if (signal === 'SIGUSR2') {
        process.kill(process.pid, 'SIGUSR2')
      } else {
        process.exit(0)
      }
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGUSR2', () => shutdown('SIGUSR2'))
