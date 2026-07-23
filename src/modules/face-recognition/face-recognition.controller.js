const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const {
  getEffectiveSchedulesForDate
} = require('../../common/services/schedule.service')
const path = require('path')
const s3 = require('../../config/s3')
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getIO } = require('../../config/socket')
const {
  formatTime,
  getJakartaDayRange,
  getJakartaScheduleContext,
  getJakartaTime
} = require('../../utils/date')
const { addActivityLog } = require('../../common/activity-log')
const { emitActivityLogUpdate } = require('../../config/socket')

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

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3 // metres
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // in metres
}

const getEffectiveSchedulesForLecturerToday = async (lecturerId) => {
  const now = new Date()
  const { currentTime } = getJakartaScheduleContext(now)
  
  const allSchedulesToday = await getEffectiveSchedulesForDate(now, { lecturer_id: lecturerId }, {
    room: { include: { building: true } },
    time_slot: true
  })
  
  const schedulesToday = allSchedulesToday.sort((a, b) => (a.time_slot?.start_time || '').localeCompare(b.time_slot?.start_time || ''))
  
  const activeSchedule = schedulesToday.find(s => s.time_slot?.start_time <= currentTime && s.time_slot?.end_time >= currentTime) || null
  const upcomingSchedule = schedulesToday.find(s => s.time_slot?.start_time > currentTime) || null
  
  return { activeSchedule, upcomingSchedule, schedulesToday }
}

const processAttendanceAndLocation = async (
  req,
  res,
  lecturerId,
  isManual = false,
  similarity = null
) => {
  const now = new Date()
  const { currentDay, currentTime } = getJakartaScheduleContext(now)
  const { latitude: userLat, longitude: userLng } = req.body

  const { activeSchedule, upcomingSchedule } = await getEffectiveSchedulesForLecturerToday(lecturerId)

  // 3. Ambil Data Dosen & Home Room (Ruang Dosen)
  const lecturer = await prisma.lecturer.findUnique({
    where: { id: lecturerId },
    include: {
      study_programs: {
        include: {
          study_program: {
            include: { home_room: { include: { building: true } } }
          }
        }
      }
    }
  })

  // 4. Kumpulkan Semua Titik Lokasi Valid
  const validPoints = []
  let matchedRoomId = null

  // 1. Tambahkan Ruang Jadwal Aktif (Prioritas Tertinggi)
  if (activeSchedule) {
    validPoints.push({
      name: `Ruang Kelas Aktif (${activeSchedule.room.name})`,
      room: activeSchedule.room
    })
  }

  // 2. Tambahkan Ruang Jadwal Mendatang (Prioritas Kedua)
  if (upcomingSchedule) {
    const [currH, currM] = currentTime.split(':').map(Number)
    const [startH, startM] = upcomingSchedule.time_slot.start_time
      .split(':')
      .map(Number)
    const diffMinutes = startH * 60 + startM - (currH * 60 + currM)

    if (diffMinutes <= 30) {
      validPoints.push({
        name: `Persiapan Kelas (${upcomingSchedule.room.name})`,
        room: upcomingSchedule.room
      })
    }
  }

  // 3. Tambahkan Ruang Dosen dari tiap Prodi (Prioritas Terakhir)
  lecturer.study_programs.forEach((sp) => {
    if (sp.study_program.home_room) {
      validPoints.push({
        name: `Ruang Dosen (${sp.study_program.name})`,
        room: sp.study_program.home_room
      })
    }
  })

  // 5. Validasi Lokasi User
  if (validPoints.length > 0) {
    if (!userLat || !userLng) {
      return error(
        res,
        'Location coordinates (latitude & longitude) are required for verification',
        400
      )
    }

    let isAtValidLocation = false
    let minDistance = Infinity
    let closestTarget = ''

    for (const point of validPoints) {
      const lat = point.room.building?.latitude
      const lng = point.room.building?.longitude
      const radius = point.room.building?.radius || 100

      if (lat && lng) {
        const distance = calculateDistance(
          parseFloat(userLat),
          parseFloat(userLng),
          lat,
          lng
        )

        if (distance <= radius) {
          isAtValidLocation = true
          matchedRoomId = point.room.id // <--- Ambil ID ruangan ini
          break
        }

        if (distance < minDistance) {
          minDistance = distance
          closestTarget = point.name
        }
      }
    }

    if (!isAtValidLocation) {
      return error(
        res,
        `You are too far from any valid location. Closest to: ${closestTarget} (${Math.round(minDistance)}m)`,
        403
      )
    }
  }

  try {
    await prisma.attendance.create({
      data: {
        lecturer_id: lecturerId,
        room_id: matchedRoomId // <--- Simpan ke database
      }
    })
  } catch (e) {
    console.error('Attendance Logging Error:', e.message)
  }

  // --- UPDATE STATUS DOSEN ---
  // Setelah attendance tercatat:
  // - Jika sedang ada jadwal aktif => BUSY
  // - Selain itu => AVAILABLE
  const nextStatus = activeSchedule ? 'BUSY' : 'AVAILABLE'
  const updated = await prisma.lecturer.update({
    where: { id: lecturerId },
    data: {
      status: nextStatus,
      is_manual: false,
      overridden_at: null,
      last_auto_status: nextStatus
    }
  })

  // Emit socket event so the dashboard Updates for everyone
  try {
    getIO().emit('lecturer-status-updated', {
      id: updated.id,
      status: updated.status,
      is_manual: updated.is_manual
    })
  } catch (e) {
    console.error(
      `Socket Emit Error (${isManual ? 'Manual' : 'Face'} Verification):`,
      e.message
    )
  }

  emitActivityLogUpdate(
    addActivityLog({
      category: 'PRESENCE',
      message: `${updated.status === 'BUSY' ? 'Lecturer check-in confirmed for active class.' : 'Lecturer check-in recorded and marked available.'}`
    })
  )

  const payload = {
    lecturer_id: lecturerId,
    status: updated.status
  }
  if (similarity !== null) {
    payload.similarity = parseFloat(similarity.toFixed(4))
  }

  return success(
    res,
    isManual ? 'Manual verification successful' : 'Face verified',
    payload
  )
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

      console.log(`[FACE-SERVICE] 👤 New face enrolled successfully.`)

      return success(
        res,
        'success',
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
    const startFace = Date.now()
    const file = req.file
    try {
      const user = req.user
      const roleIdentity = user.role?.code?.toUpperCase()

      const lecturerId =
        roleIdentity === 'SUPER_ADMIN' || roleIdentity === 'SA'
          ? req.body?.lecturer_id || user?.lecturer?.id
          : user?.lecturer?.id

      if (!lecturerId) return error(res, 'Lecturer profile not found', 403)
      if (!file) return error(res, 'Image is required', 400)

      console.log(`[FACE-SERVICE] Verification requested | Processing image...`)

      const embedding = await getEmbedding(file.buffer, file.originalname)
      const faceData = await prisma.faceData.findUnique({
        where: { lecturer_id: lecturerId },
        include: {
          lecturer: { select: { id: true, status: true } }
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
        console.log(
          `[FACE-SERVICE] Face Mismatch! (Similarity: ${similarity.toFixed(4)}) | Access Denied`
        )
        return error(res, 'Face not recognized', 401)
      }

      console.log(
        `[FACE-SERVICE] Face Match! (Similarity: ${similarity.toFixed(4)}) | Proceeding to location check...`
      )

      // --- LOGIKA CEK JADWAL & LOKASI ---
      const now = new Date()
      const { currentDay, currentTime } = getJakartaScheduleContext(now)
      const { latitude: userLat, longitude: userLng } = req.body

      const { activeSchedule, upcomingSchedule } = await getEffectiveSchedulesForLecturerToday(lecturerId)

      // 3. Ambil Data Dosen & Home Room (Ruang Dosen)
      const lecturer = await prisma.lecturer.findUnique({
        where: { id: lecturerId },
        include: {
          study_programs: {
            include: {
              study_program: {
                include: { home_room: { include: { building: true } } }
              }
            }
          }
        }
      })

      // 4. Kumpulkan Semua Titik Lokasi Valid
      const validPoints = []
      let matchedRoomId = null

      // Tambahkan Ruang Dosen dari tiap Prodi si Dosen
      lecturer.study_programs.forEach((sp) => {
        if (sp.study_program.home_room) {
          validPoints.push({
            name: `Ruang Dosen (${sp.study_program.name})`,
            room: sp.study_program.home_room
          })
        }
      })

      // Tambahkan Ruang Jadwal Aktif
      if (activeSchedule) {
        validPoints.push({
          name: `Ruang Kelas Aktif (${activeSchedule.room.name})`,
          room: activeSchedule.room
        })
      }

      // Tambahkan Ruang Jadwal Mendatang (Jika dalam 30 menit)
      if (upcomingSchedule) {
        const [currH, currM] = currentTime.split(':').map(Number)
        const [startH, startM] = upcomingSchedule.time_slot.start_time
          .split(':')
          .map(Number)
        const diffMinutes = startH * 60 + startM - (currH * 60 + currM)

        if (diffMinutes <= 30) {
          validPoints.push({
            name: `Persiapan Kelas (${upcomingSchedule.room.name})`,
            room: upcomingSchedule.room
          })
        }
      }

      // 5. Validasi Lokasi User
      if (validPoints.length > 0) {
        if (!userLat || !userLng) {
          return error(
            res,
            'Location coordinates (latitude & longitude) are required for verification',
            400
          )
        }

        let isAtValidLocation = false
        let minDistance = Infinity
        let closestTarget = ''

        for (const point of validPoints) {
          const lat = point.room.building?.latitude
          const lng = point.room.building?.longitude
          const radius = point.room.building?.radius || 100

          if (lat && lng) {
            const distance = calculateDistance(
              parseFloat(userLat),
              parseFloat(userLng),
              lat,
              lng
            )

            if (distance <= radius) {
              isAtValidLocation = true
              matchedRoomId = point.room.id // <--- Ambil ID ruangan ini
              break
            }

            if (distance < minDistance) {
              minDistance = distance
              closestTarget = point.name
            }
          }
        }

        if (!isAtValidLocation) {
          return error(
            res,
            `You are too far from any valid location. Closest to: ${closestTarget} (${Math.round(minDistance)}m)`,
            403
          )
        }
      }

      try {
        await prisma.attendance.create({
          data: {
            lecturer_id: lecturerId,
            room_id: matchedRoomId // <--- Simpan ke database
          }
        })
        console.log(
          `[FACE-SERVICE] Location Validated | Attendance recorded successfully.`
        )
      } catch (e) {
        console.error('Attendance Logging Error:', e.message)
      }

      // --- UPDATE STATUS DOSEN ---
      // Setelah attendance tercatat:
      // - Jika sedang ada jadwal aktif => BUSY
      // - Selain itu => AVAILABLE
      const nextStatus = activeSchedule ? 'BUSY' : 'AVAILABLE'
      const updated = await prisma.lecturer.update({
        where: { id: lecturerId },
        data: {
          status: nextStatus,
          is_manual: false,
          overridden_at: null,
          last_auto_status: nextStatus
        }
      })

      // Emit socket event so the dashboard Updates for everyone
      try {
        getIO().emit('lecturer-status-updated', {
          id: updated.id,
          status: updated.status,
          is_manual: updated.is_manual
        })
      } catch (e) {
        console.error('Socket Emit Error (Face Verification):', e.message)
      }

      emitActivityLogUpdate(
        addActivityLog({
          category: 'PRESENCE',
          message: `${updated.status === 'BUSY' ? 'Lecturer check-in confirmed for active class.' : 'Lecturer check-in recorded and marked available.'}`
        })
      )

      const delayMs = Date.now() - startFace
      console.log(`[FACE-SERVICE] Verification completed in ${delayMs}ms`)
      try {
        getIO().emit('system-delay', { source: 'Face', delay_ms: delayMs })
      } catch (e) {}

      return success(res, 'Face verified', {
        lecturer_id: lecturerId,
        status: updated.status,
        similarity: parseFloat(similarity.toFixed(4))
      })
    } catch (err) {
      if (err.message.includes('Face not detected')) {
        console.log(`[FACE-SERVICE] Face not detected in uploaded image.`)
        return error(res, err.message, 400)
      }
      console.error('Verify Error:', err)
      return error(res, err.message, 500)
    }
  },

  manualVerify: async (req, res) => {
    try {
      const user = req.user
      const roleIdentity = user.role?.code?.toUpperCase()

      const lecturerId =
        roleIdentity === 'SUPER_ADMIN' || roleIdentity === 'SA'
          ? req.body?.lecturer_id || user?.lecturer?.id
          : user?.lecturer?.id

      if (!lecturerId) return error(res, 'Lecturer profile not found', 403)

      return await processAttendanceAndLocation(req, res, lecturerId, true)
    } catch (err) {
      console.error('Manual Verify Error:', err)
      return error(res, err.message, 500)
    }
  },

  checkStatus: async (req, res) => {
    try {
      const lecturerId = req.params.lecturer_id || req.user.lecturer?.id

      if (!lecturerId) return error(res, 'Lecturer ID not found', 400)

      const faceData = await prisma.faceData.findUnique({
        where: { lecturer_id: lecturerId },
        include: {
          lecturer: {
            select: { status: true, is_manual: true, overridden_at: true }
          }
        }
      })

      const now = new Date()
      const { hours: jakartaHour } = getJakartaTime(now)
      const { isWeekend, currentDay } = getJakartaScheduleContext(now)
      const timeAllowed = jakartaHour >= 7

      // Check if already attended today
      const { start: startOfDay, end: endOfDay } = getJakartaDayRange(now)

      const attendance = await prisma.attendance.findFirst({
        where: {
          lecturer_id: lecturerId,
          check_in_at: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        orderBy: {
          check_in_at: 'desc'
        }
      })

      const isAttended = !!attendance
      const attendedAtTime = formatTime(attendance?.check_in_at)

      // Logic for On Time & Late Minutes based on schedule - Timezone Aware (WIB)
      let isOnTime = false
      let lateMinutes = null

      if (attendance) {
        isOnTime = true // Default to on-time if no schedule exists
        lateMinutes = null

        if (currentDay) {
          const { schedulesToday } = await getEffectiveSchedulesForLecturerToday(lecturerId)
          const firstSchedule = schedulesToday?.[0]

          if (firstSchedule && firstSchedule.time_slot) {
            const { hours, minutes } = getJakartaTime(attendance.check_in_at)
            const totalMinutes = hours * 60 + minutes

            const [startHour, startMinute] = firstSchedule.time_slot.start_time
              .split(':')
              .map(Number)
            const startMinutes = startHour * 60 + startMinute

            isOnTime = totalMinutes <= startMinutes
            lateMinutes = Math.max(0, totalMinutes - startMinutes)
          }
        }
      }

      //? For production: Limit verification by time and day
      const canVerify = !!faceData && !isWeekend && timeAllowed

      return success(res, 'success', {
        registered: !!faceData,
        status: faceData?.lecturer?.status || 'OFFLINE',
        is_manual: faceData?.lecturer?.is_manual || false,
        attended_at: attendedAtTime,
        is_on_time: isOnTime,
        late_minutes: lateMinutes,
        overridden_at: formatTime(faceData?.lecturer?.overridden_at),
        can_verify: canVerify,
        can_override: isAttended,
        details: {
          is_weekend: isWeekend,
          time_allowed: timeAllowed,
          is_attended: isAttended
        }
      })
    } catch (err) {
      console.error('Check Status Error:', err)
      return error(res, err.message, 500)
    }
  },

  unregister: async (req, res) => {
    try {
      const user = req.user
      const roleIdentity = user.role?.code?.toUpperCase()

      // Ambil lecturer_id (Bisa kirim manual jika SA, atau ambil dari profile sendiri)
      const lecturerId =
        roleIdentity === 'SUPER_ADMIN' || roleIdentity === 'SA'
          ? req.body.lecturer_id || user.lecturer?.id
          : user.lecturer?.id

      if (!lecturerId) return error(res, 'Lecturer profile not found', 403)

      const faceData = await prisma.faceData.findUnique({
        where: { lecturer_id: lecturerId }
      })

      if (!faceData) return error(res, 'Face ID not registered', 404)

      // 1. Hapus dari S3 jika ada image_url
      if (faceData.image_url) {
        try {
          const urlParts = faceData.image_url.split('/')
          const filename = urlParts.slice(-2).join('/') // Mengambil 'faces/filename.ext'

          await s3.send(
            new DeleteObjectCommand({
              Bucket: S3_BUCKET,
              Key: filename
            })
          )
        } catch (s3Err) {
          console.error('S3 Delete Warning:', s3Err.message)
          // Lanjut saja, s3 cleanup bisa gagal tanpa mematikan proses DB
        }
      }

      // 2. Hapus dari database
      await prisma.faceData.delete({
        where: { lecturer_id: lecturerId }
      })

      return success(res, 'success')
    } catch (err) {
      console.error('Unregister Error:', err)
      return error(res, err.message, 500)
    }
  },

  deleteTodayAttendance: async (req, res) => {
    try {
      const lecturerId = req.user.lecturer?.id
      if (!lecturerId) return error(res, 'Lecturer profile not found', 403)

      const { start: startOfDay, end: endOfDay } = getJakartaDayRange()

      // 1. Hapus record absensi hari ini
      await prisma.attendance.deleteMany({
        where: {
          lecturer_id: lecturerId,
          check_in_at: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      })

      // 2. Reset status dosen
      await prisma.lecturer.update({
        where: { id: lecturerId },
        data: {
          status: 'OFFLINE',
          is_manual: false,
          overridden_at: null
        }
      })

      return success(res, 'success')
    } catch (err) {
      console.error('Reset Attendance Error:', err)
      return error(res, err.message, 500)
    }
  }
}

module.exports = faceRecognitionController
