const crypto = require('crypto')
const prisma = require('../../config/prisma')
const redisClient = require('../../config/redis')
const { buildEnergyMonitoringSummary } = require('../dashboard/dashboard.controller')

const MAX_MEMORY_TURNS = 8
const MEMORY_TTL_SECONDS = 60 * 30
const DEFAULT_PROVIDER_NAME = 'openai-compatible'

const DOMAIN_KEYWORDS = [
  'energi',
  'energy',
  'daya',
  'power',
  'listrik',
  'arus',
  'current',
  'tegangan',
  'voltage',
  'frekuensi',
  'frequency',
  'power factor',
  'pf',
  'sensor',
  'device',
  'perangkat',
  'online',
  'offline',
  'gedung',
  'building',
  'ruang',
  'room',
  'suhu',
  'temperature',
  'kelembapan',
  'humidity',
  'monitoring',
  'dashboard',
  'konsumsi',
  'trend',
  'anomali',
  'status'
]

const FOLLOW_UP_KEYWORDS = [
  'itu',
  'tadi',
  'yang tadi',
  'kenapa',
  'bagaimana',
  'gimana',
  'lanjut',
  'jelasin',
  'detailnya',
  'sekarang'
]

const INTENT_RULES = [
  {
    intent: 'top_consumers',
    keywords: ['paling boros', 'tertinggi', 'top', 'terbesar', 'highest', 'boros']
  },
  {
    intent: 'device_health',
    keywords: ['offline', 'online', 'device', 'perangkat', 'latency', 'sinkron', 'sync']
  },
  {
    intent: 'environment_status',
    keywords: ['suhu', 'temperature', 'kelembapan', 'humidity', 'lingkungan']
  },
  {
    intent: 'trend_analysis',
    keywords: ['trend', 'naik', 'turun', 'perubahan', 'change', 'grafik']
  },
  {
    intent: 'energy_summary',
    keywords: ['energi', 'energy', 'kwh', 'konsumsi', 'pemakaian']
  },
  {
    intent: 'current_status',
    keywords: ['sekarang', 'saat ini', 'current', 'latest', 'daya', 'power', 'arus', 'tegangan', 'status']
  }
]

const ROOM_LOG_SELECT = {
  id: true,
  room_id: true,
  device_id: true,
  sensor_type: true,
  voltage: true,
  current: true,
  power: true,
  energy: true,
  frequency: true,
  power_factor: true,
  temperature: true,
  humidity: true,
  created_at: true
}

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const toNumberOrNull = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null
  }

  return Number(Number(value).toFixed(digits))
}

const buildSessionId = (providedSessionId) => {
  const normalized = String(providedSessionId || '').trim()
  return normalized || crypto.randomUUID()
}

const isRedisReady = () => redisClient && redisClient.isOpen

const getMemoryKey = (sessionId) => `chatbot:dashboard:session:${sessionId}`

const getSessionMemory = async (sessionId) => {
  if (!isRedisReady()) return []

  try {
    const raw = await redisClient.get(getMemoryKey(sessionId))
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_err) {
    return []
  }
}

const saveSessionMemory = async (sessionId, memory) => {
  if (!isRedisReady()) return

  try {
    await redisClient.set(getMemoryKey(sessionId), JSON.stringify(memory), {
      EX: MEMORY_TTL_SECONDS
    })
  } catch (_err) {
    // Ignore Redis write errors so chat requests still succeed.
  }
}

const appendMemoryTurn = (memory, role, content) =>
  [...memory, { role, content, created_at: new Date().toISOString() }].slice(
    -MAX_MEMORY_TURNS
  )

const hasDomainSignal = (message) => {
  const normalizedMessage = normalizeText(message)
  return DOMAIN_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))
}

const isFollowUpPrompt = (message) => {
  const normalizedMessage = normalizeText(message)
  return FOLLOW_UP_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))
}

const runPromptGuard = ({ message, memory }) => {
  const normalizedMessage = normalizeText(message)

  if (!normalizedMessage) {
    return {
      allowed: false,
      code: 'EMPTY_MESSAGE',
      reason: 'Pesan tidak boleh kosong.'
    }
  }

  if (normalizedMessage.length > 1000) {
    return {
      allowed: false,
      code: 'MESSAGE_TOO_LONG',
      reason: 'Pertanyaan terlalu panjang. Coba ringkas jadi satu topik.'
    }
  }

  if (hasDomainSignal(normalizedMessage)) {
    return { allowed: true }
  }

  if (memory.length > 0 && isFollowUpPrompt(normalizedMessage)) {
    return { allowed: true }
  }

  return {
    allowed: false,
    code: 'OUT_OF_SCOPE',
    reason:
      'Chatbot dashboard hanya melayani pertanyaan tentang energi, sensor, device, gedung, dan ruangan.'
  }
}

const detectIntent = (message) => {
  const normalizedMessage = normalizeText(message)
  const matchedRule = INTENT_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalizedMessage.includes(keyword))
  )

  return matchedRule?.intent || 'unknown'
}

const runIntentGuard = ({ message }) => {
  const intent = detectIntent(message)

  if (intent === 'unknown') {
    return {
      allowed: false,
      intent,
      code: 'UNSUPPORTED_INTENT',
      reason:
        'Pertanyaan belum cocok dengan fitur chatbot dashboard. Coba tanya status daya, konsumsi energi, device offline, suhu, atau tren terbaru.'
    }
  }

  return {
    allowed: true,
    intent
  }
}

const formatMemoryForModel = (memory) =>
  memory.map((item) => ({
    role: item.role,
    content: item.content
  }))

const getLatestRoomPower = async (roomId) => {
  const log = await prisma.sensorLog.findFirst({
    where: {
      room_id: roomId,
      power: { not: null }
    },
    orderBy: { created_at: 'desc' },
    select: ROOM_LOG_SELECT
  })

  return log
    ? {
        room_id: log.room_id,
        power_watts: toNumberOrNull(log.power, 1),
        energy_kwh: toNumberOrNull(log.energy, 3),
        voltage: toNumberOrNull(log.voltage, 1),
        current: toNumberOrNull(log.current, 2),
        frequency: toNumberOrNull(log.frequency, 1),
        power_factor: toNumberOrNull(log.power_factor, 2),
        updated_at: log.created_at
      }
    : null
}

const getTopRoomsByPower = async (buildingId, limit = 3) => {
  const rooms = await prisma.room.findMany({
    where: {
      building_id: buildingId,
      status: true
    },
    select: {
      id: true,
      name: true
    },
    orderBy: { name: 'asc' }
  })

  const latestLogs = await Promise.all(
    rooms.map(async (room) => ({
      room_id: room.id,
      room_name: room.name,
      latest_power: await getLatestRoomPower(room.id)
    }))
  )

  return latestLogs
    .filter((item) => item.latest_power?.power_watts !== null)
    .sort(
      (a, b) =>
        Number(b.latest_power?.power_watts || 0) -
        Number(a.latest_power?.power_watts || 0)
    )
    .slice(0, limit)
}

const getBuildingDeviceHealth = async (buildingId) => {
  const devices = await prisma.device.findMany({
    where: {
      status: true,
      room: {
        building_id: buildingId
      }
    },
    select: {
      id: true,
      name: true,
      is_online: true,
      last_seen_at: true,
      last_latency_ms: true,
      room: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ room: { name: 'asc' } }, { name: 'asc' }]
  })

  const counts = devices.reduce(
    (acc, device) => {
      if (device.is_online) acc.online += 1
      else acc.offline += 1
      return acc
    },
    { online: 0, offline: 0 }
  )

  return {
    counts,
    offline_devices: devices
      .filter((device) => !device.is_online)
      .slice(0, 5)
      .map((device) => ({
        id: device.id,
        name: device.name,
        room_name: device.room?.name || null,
        last_seen_at: device.last_seen_at,
        last_latency_ms: device.last_latency_ms
      }))
  }
}

const getRoomEnvironment = async (roomId) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      building: {
        select: {
          id: true,
          name: true
        }
      }
    }
  })

  if (!room) return null

  const latestLog = await prisma.sensorLog.findFirst({
    where: {
      room_id: roomId,
      OR: [{ temperature: { not: null } }, { humidity: { not: null } }]
    },
    orderBy: { created_at: 'desc' },
    select: ROOM_LOG_SELECT
  })

  return {
    room_id: room.id,
    room_name: room.name,
    building_id: room.building?.id || null,
    building_name: room.building?.name || null,
    temperature_c: toNumberOrNull(latestLog?.temperature, 1),
    humidity_percent: toNumberOrNull(latestLog?.humidity, 1),
    updated_at: latestLog?.created_at || null
  }
}

const getRoomSnapshot = async (roomId) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      building: {
        select: {
          id: true,
          name: true
        }
      }
    }
  })

  if (!room) return null

  const [latestPower, latestEnvironment, devices] = await Promise.all([
    getLatestRoomPower(roomId),
    getRoomEnvironment(roomId),
    prisma.device.findMany({
      where: {
        room_id: roomId,
        status: true
      },
      select: {
        id: true,
        name: true,
        type: true,
        is_online: true,
        is_on: true,
        last_seen_at: true
      },
      orderBy: { name: 'asc' }
    })
  ])

  return {
    room_id: room.id,
    room_name: room.name,
    building_id: room.building?.id || null,
    building_name: room.building?.name || null,
    latest_power: latestPower,
    latest_environment: latestEnvironment,
    devices
  }
}

const getBuildingSnapshot = async (buildingId) => {
  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: {
      id: true,
      name: true,
      status: true,
      rooms: {
        where: { status: true },
        select: {
          id: true,
          name: true
        },
        orderBy: { name: 'asc' }
      }
    }
  })

  if (!building || !building.status) return null

  const [energySummary, deviceHealth, topRooms] = await Promise.all([
    buildEnergyMonitoringSummary(building.id),
    getBuildingDeviceHealth(building.id),
    getTopRoomsByPower(building.id)
  ])

  return {
    building_id: building.id,
    building_name: building.name,
    room_count: building.rooms.length,
    rooms: building.rooms.slice(0, 10),
    energy_summary: energySummary,
    device_health: deviceHealth,
    top_rooms_by_power: topRooms.map((item) => ({
      room_id: item.room_id,
      room_name: item.room_name,
      power_watts: item.latest_power?.power_watts ?? null,
      energy_kwh: item.latest_power?.energy_kwh ?? null,
      updated_at: item.latest_power?.updated_at ?? null
    }))
  }
}

const buildLiveContext = async ({ buildingId, roomId, intent }) => {
  const roomSnapshot = roomId ? await getRoomSnapshot(roomId) : null
  const effectiveBuildingId = buildingId || roomSnapshot?.building_id || null
  const buildingSnapshot = effectiveBuildingId
    ? await getBuildingSnapshot(effectiveBuildingId)
    : null

  if (!roomSnapshot && roomId) {
    return {
      not_found: true,
      message: 'Room not found'
    }
  }

  if (!buildingSnapshot && effectiveBuildingId) {
    return {
      not_found: true,
      message: 'Building not found'
    }
  }

  const context = {
    intent,
    room: roomSnapshot,
    building: buildingSnapshot
  }

  return context
}

const getProviderConfig = () => ({
  url: process.env.LLAMA_API_URL || '',
  apiKey: process.env.LLAMA_API_KEY || '',
  model: process.env.LLAMA_MODEL || '',
  providerName: process.env.LLAMA_PROVIDER_NAME || DEFAULT_PROVIDER_NAME
})

const ensureProviderConfigured = () => {
  const config = getProviderConfig()

  if (!config.url || !config.apiKey || !config.model) {
    const error = new Error(
      'LLM provider belum dikonfigurasi. Isi LLAMA_API_URL, LLAMA_API_KEY, dan LLAMA_MODEL.'
    )
    error.statusCode = 503
    throw error
  }

  return config
}

const extractTextContent = (content) => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'text') return item.text || ''
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

const callLlamaChat = async ({ messages, temperature = 0.2, maxTokens = 400 }) => {
  const config = ensureProviderConfigured()

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  })

  if (!response.ok) {
    const payload = await response.text()
    const error = new Error(`LLM request failed with status ${response.status}: ${payload}`)
    error.statusCode = 502
    throw error
  }

  const payload = await response.json()
  const content = extractTextContent(payload?.choices?.[0]?.message?.content)

  return {
    text: content,
    model: payload?.model || config.model,
    provider: config.providerName
  }
}

const buildSystemPrompt = () => `
Kamu adalah asisten dashboard digital twin untuk monitoring energi IoT.
Jawab hanya berdasarkan konteks yang diberikan sistem.
Fokus hanya pada energi, sensor, device, gedung, dan ruangan.
Jangan mengarang angka, nama ruangan, tren, atau status.
Kalau data tidak cukup, bilang data tidak tersedia.
Kalau pertanyaan ambigu, jawab singkat dan minta klarifikasi seperlunya.
Gunakan Bahasa Indonesia yang ringkas, jelas, dan profesional.
Sebutkan angka utama bila tersedia.
`.trim()

const buildUserPrompt = ({ message, intent, liveContext, memory }) =>
  [
    'Pertanyaan user:',
    message,
    '',
    `Intent yang diizinkan: ${intent}`,
    '',
    'Konteks dashboard live:',
    JSON.stringify(liveContext, null, 2),
    '',
    'Riwayat singkat percakapan:',
    JSON.stringify(formatMemoryForModel(memory), null, 2),
    '',
    'Tugas:',
    '- Jawab hanya dari konteks di atas.',
    '- Jika tidak ada data, katakan tidak tersedia.',
    '- Jangan menambahkan asumsi atau prediksi.',
    '- Maksimal 5 kalimat.'
  ].join('\n')

const rejectPrompt = ({ sessionId, reason, code, statusCode = 400 }) => ({
  ok: false,
  statusCode,
  session_id: sessionId,
  message: reason,
  metadata: {
    rejected: true,
    rejection_code: code
  }
})

const chatDashboard = async ({ message, building_id: buildingId, room_id: roomId, session_id: sessionIdInput }) => {
  const sessionId = buildSessionId(sessionIdInput)
  const memory = await getSessionMemory(sessionId)

  const promptGuard = runPromptGuard({ message, memory })
  if (!promptGuard.allowed) {
    return rejectPrompt({
      sessionId,
      reason: promptGuard.reason,
      code: promptGuard.code
    })
  }

  const intentGuard = runIntentGuard({ message })
  if (!intentGuard.allowed) {
    return rejectPrompt({
      sessionId,
      reason: intentGuard.reason,
      code: intentGuard.code
    })
  }

  const liveContext = await buildLiveContext({
    buildingId,
    roomId,
    intent: intentGuard.intent
  })

  if (liveContext?.not_found) {
    return rejectPrompt({
      sessionId,
      reason:
        liveContext.message === 'Room not found'
          ? 'Ruangan tidak ditemukan.'
          : 'Gedung tidak ditemukan.',
      code: 'CONTEXT_NOT_FOUND',
      statusCode: 404
    })
  }

  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt()
    },
    {
      role: 'user',
      content: buildUserPrompt({
        message,
        intent: intentGuard.intent,
        liveContext,
        memory
      })
    }
  ]

  const llmResponse = await callLlamaChat({
    messages
  })

  const nextMemory = appendMemoryTurn(
    appendMemoryTurn(memory, 'user', message),
    'assistant',
    llmResponse.text
  )
  await saveSessionMemory(sessionId, nextMemory)

  return {
    ok: true,
    statusCode: 200,
    session_id: sessionId,
    message: 'success',
    data: {
      reply: llmResponse.text,
      intent: intentGuard.intent,
      context_scope: {
        building_id: liveContext?.building?.building_id || liveContext?.room?.building_id || null,
        room_id: liveContext?.room?.room_id || null
      }
    },
    metadata: {
      rejected: false,
      model: llmResponse.model,
      provider: llmResponse.provider,
      used_memory: memory.length > 0
    }
  }
}

module.exports = {
  chatDashboard
}
