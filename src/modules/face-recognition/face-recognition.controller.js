const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const path = require('path')
const s3 = require('../../config/s3')
const { PutObjectCommand } = require('@aws-sdk/client-s3')

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL || 'http://localhost:8000'
const SIMILARITY_THRESHOLD = parseFloat(process.env.FACE_SIMILARITY_THRESHOLD || '0.6')
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
    const data = await response.json().catch(() => ({ detail: 'Unknown error' }))
    const msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data)
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
  // POST /face-recognition/register
  // Body: { lecturer_id }
  // File: image (multipart/form-data, field name: "image")
  register: async (req, res) => {
    const file = req.file
    try {
      const { lecturer_id } = req.body

      if (!lecturer_id || !file) {
        return error(res, 'lecturer_id and image are required', 400)
      }

      const lecturer = await prisma.lecturer.findUnique({ where: { id: lecturer_id } })
      if (!lecturer) return error(res, 'Lecturer not found', 404)

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
          ACL: 'public-read' // Paksa supaya bisa diakses publik lewat browser
        })
      )

      // Konstruksi URL (Endpoint + Bucket + Key) sesuai saran kamu
      const imageUrl = `${S3_ENDPOINT}/${S3_BUCKET}/${filename}`

      // 3. Simpan ke database (Model Baru: FaceData)
      await prisma.faceData.upsert({
        where: { lecturer_id },
        create: { lecturer_id, embedding, image_url: imageUrl },
        update: { embedding, image_url: imageUrl }
      })

      return success(res, 'Face registered successfully', { lecturer_id, image_url: imageUrl }, 201)
    } catch (err) {
      // Jika errornya dari Face Service (422), tidak usah tampilkan log panjang
      if (err.message.includes('Face not detected') || err.message.includes('not identified')) {
        return error(res, err.message, 400)
      }
      console.error('Register Error:', err)
      return error(res, err.message, 500)
    }
  },

  // POST /face-recognition/verify
  // File: image (multipart/form-data, field name: "image")
  // Body: { lecturer_id } (opsional, untuk 1:1 verification yang lebih cepat)
  verify: async (req, res) => {
    // ... rest of verify logic (buffer handling etc)
    const file = req.file
    const { lecturer_id } = req.body

    try {
      if (!file) return error(res, 'Image is required', 400)

      // Get embedding dari buffer (tidak simpan file)
      const embedding = await getEmbedding(file.buffer, file.originalname)

      let targetFaces = []

      if (lecturer_id) {
        // 1:1 Verification - Lebih cepat & akurat
        const faceData = await prisma.faceData.findUnique({
          where: { lecturer_id },
          include: {
            lecturer: { select: { id: true, is_available: true } }
          }
        })
        if (!faceData) return error(res, 'Lecturer has no registered face', 404)
        targetFaces = [faceData]
      } else {
        // 1:N Identification - Mencari ke semua data
        targetFaces = await prisma.faceData.findMany({
          include: {
            lecturer: { select: { id: true, is_available: true } }
          }
        })
      }

      if (targetFaces.length === 0) {
        return error(res, 'No registered faces found', 404)
      }

      let bestMatch = null
      let bestSimilarity = -1

      for (const faceData of targetFaces) {
        const storedEmbedding = Array.isArray(faceData.embedding)
          ? faceData.embedding
          : Object.values(faceData.embedding)

        const similarity = cosineSimilarity(embedding, storedEmbedding)
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity
          bestMatch = faceData
        }
      }

      if (!bestMatch || bestSimilarity < SIMILARITY_THRESHOLD) {
        return error(res, 'Face not recognized', 404)
      }

      const updated = await prisma.lecturer.update({
        where: { id: bestMatch.lecturer_id },
        data: { is_available: !bestMatch.lecturer.is_available }
      })

      return success(res, 'Face verified', {
        lecturer_id: bestMatch.lecturer_id,
        is_available: updated.is_available,
        similarity: parseFloat(bestSimilarity.toFixed(4)),
        method: lecturer_id ? '1:1 Verification' : '1:N Identification'
      })
    } catch (err) {
      // Jika error wajah kategory logic, kirim 400/404 dan jangan penuhi log terminal
      if (err.message.includes('Face not detected') || err.message.includes('not recognized')) {
        return error(res, err.message, 400)
      }
      console.error('Verify Error:', err)
      return error(res, err.message, 500)
    }
  }
}

module.exports = faceRecognitionController