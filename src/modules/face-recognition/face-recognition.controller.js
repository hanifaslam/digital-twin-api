const { Day } = require('@prisma/client')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const path = require('path')
const s3 = require('../../config/s3')
const { PutObjectCommand } = require('@aws-sdk/client-s3')

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL || 'http://localhost:8000'
const SIMILARITY_THRESHOLD = parseFloat(
  process.env.FACE_SIMILARITY_THRESHOLD || '0.6'
)
const S3_BUCKET = process.env.S3_BUCKET
const S3_ENDPOINT = process.env.S3_ENDPOINT

const getEmbedding = async (buffer, filename) => {
  const blob = new Blob([buffer])
  const formData = new FormData()
  formData.append('file', blob, filename)

  const response = await fetch(`${FACE_SERVICE_URL}/embed`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ detail: 'Unknown error' }))
    const msg =
      typeof data.detail === 'string' ? data.detail : JSON.stringify(data)
    throw new Error(msg)
  }

  const data = await response.json()
  return data.embedding
}

const cosineSimilarity = (a, b) => {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  return dot / (normA * normB)
}

const faceRecognitionController = {
  register: async (req, res) => {
    const file = req.file
    try {
      const user = req.user
      const roleIdentity = user.role?.code?.toUpperCase()

      const lecturerId =
        roleIdentity === 'SUPER_ADMIN' || roleIdentity === 'SA'
          ? req.body.lecturer_id || user.lecturer?.id
          : user.lecturer?.id

      if (!lecturerId) return error(res, 'Lecturer ID/Profile not found', 400)
      if (!file) return error(res, 'Image is required', 400)

      // 1. Get Embedding (dari Buffer)
      const embedding = await getEmbedding(file.buffer, file.originalname)

      // 2. Upload ke MinIO (S3)
      const ext = path.extname(file.originalname)
      const filename = `faces/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`

      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: filename,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'public-read'
        })
      )

      const imageUrl = `${S3_ENDPOINT}/${S3_BUCKET}/${filename}`

      // 3. Simpan ke database
      await prisma.faceData.upsert({
        where: { lecturer_id: lecturerId },
        create: { lecturer_id: lecturerId, embedding, image_url: imageUrl },
        update: { embedding, image_url: imageUrl }
      })

      return success(
        res,
        'Face registered successfully',
        { lecturer_id: lecturerId, image_url: imageUrl },
        201
      )
    } catch (err) {
      if (err.message.includes('Face not detected'))
        return error(res, err.message, 400)
      console.error('Register Error:', err)
      return error(res, err.message, 500)
    }
  },

  verify: async (req, res) => {
    const file = req.file
    try {
      const user = req.user
      const roleIdentity = user.role?.code?.toUpperCase()

      const lecturerId =
        roleIdentity === 'SUPER_ADMIN' || roleIdentity === 'SA'
          ? req.body.lecturer_id || user.lecturer?.id
          : user.lecturer?.id

      if (!lecturerId) return error(res, 'Lecturer profile not found', 403)
      if (!file) return error(res, 'Image is required', 400)
      const embedding = await getEmbedding(file.buffer, file.originalname)
      const faceData = await prisma.faceData.findUnique({
        where: { lecturer_id: lecturerId },
        include: {
          lecturer: { select: { id: true, is_available: true } }
        }
      })

      if (!faceData)
        return error(
          res,
          'You have no registered face. Please register first',
          404
        )

      const storedEmbedding = Array.isArray(faceData.embedding)
        ? faceData.embedding
        : Object.values(faceData.embedding)

      const similarity = cosineSimilarity(embedding, storedEmbedding)

      if (similarity < SIMILARITY_THRESHOLD) {
        return error(res, 'Face not recognized', 401)
      }

      // --- LOGIKA CEK JADWAL ---
      const now = new Date()
      const dayIndex = now.getDay()
      const dayMap = {
        1: Day.MONDAY,
        2: Day.TUESDAY,
        3: Day.WEDNESDAY,
        4: Day.THURSDAY,
        5: Day.FRIDAY
      }
      const currentDay = dayMap[dayIndex]
      const currentTime =
        now.getHours().toString().padStart(2, '0') +
        ':' +
        now.getMinutes().toString().padStart(2, '0')

      let activeSchedule = null
      if (currentDay) {
        // Cari jadwal dosen di hari ini
        activeSchedule = await prisma.schedule.findFirst({
          where: {
            lecturer_id: lecturerId,
            day: currentDay,
            status: true // Hanya jadwal yang aktif
          },
          include: {
            time_slot: true
          }
        })
      }

      const isWeekend = dayIndex === 0 || dayIndex === 6
      let availableStatus = !isWeekend

      if (activeSchedule) {
        const { start_time, end_time } = activeSchedule.time_slot

        if (currentTime >= start_time && currentTime <= end_time) {
          availableStatus = false
        }
      }

      const updated = await prisma.lecturer.update({
        where: { id: lecturerId },
        data: {
          status: availableStatus ? 'AVAILABLE' : 'BUSY',
          is_manual: false,
          last_auto_status: availableStatus ? 'AVAILABLE' : 'BUSY'
        }
      })

      return success(res, 'Face verified', {
        lecturer_id: lecturerId,
        status: updated.status,
        status_note: availableStatus
          ? 'Available for consultation'
          : 'Busy teaching',
        similarity: parseFloat(similarity.toFixed(4)),
        method: '1:1 Self Verification'
      })
    } catch (err) {
      if (err.message.includes('Face not detected'))
        return error(res, err.message, 400)
      console.error('Verify Error:', err)
      return error(res, err.message, 500)
    }
  },

  checkStatus: async (req, res) => {
    try {
      const lecturerId = req.params.lecturer_id || req.user.lecturer?.id

      if (!lecturerId) return error(res, 'Lecturer ID not found', 400)

      const faceData = await prisma.faceData.findUnique({
        where: { lecturer_id: lecturerId },
        select: {
          image_url: true,
          created_at: true
        }
      })

      return success(res, 'Face status retrieved', {
        registered: !!faceData,
        status: faceData?.lecturer?.status || 'OFFLINE',
        is_manual: faceData?.lecturer?.is_manual || false,
        image_url: faceData?.image_url || null,
        registered_at: faceData?.created_at || null
      })
    } catch (err) {
      console.error('Check Status Error:', err)
      return error(res, err.message, 500)
    }
  }
}

module.exports = faceRecognitionController
