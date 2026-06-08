const redisClient = require('../../config/redis')

const MAX_MEMORY_TURNS = 8
const MEMORY_TTL_SECONDS = 60 * 30

const isRedisReady = () => redisClient && redisClient.isOpen

const getMemoryKey = (sessionId) => `chatbot:dashboard:session:${sessionId}`

const getDefaultSessionState = () => ({
  memory: [],
  clarification: null
})

const getSessionState = async (sessionId) => {
  if (!isRedisReady()) return getDefaultSessionState()

  try {
    const raw = await redisClient.get(getMemoryKey(sessionId))
    if (!raw) return getDefaultSessionState()

    const parsed = JSON.parse(raw)

    if (Array.isArray(parsed)) {
      return {
        memory: parsed,
        clarification: null
      }
    }

    return {
      memory: Array.isArray(parsed?.memory) ? parsed.memory : [],
      clarification: parsed?.clarification || null
    }
  } catch (_err) {
    return getDefaultSessionState()
  }
}

const saveSessionState = async (sessionId, state) => {
  if (!isRedisReady()) return

  try {
    await redisClient.set(
      getMemoryKey(sessionId),
      JSON.stringify({
        memory: Array.isArray(state?.memory) ? state.memory : [],
        clarification: state?.clarification || null
      }),
      {
        EX: MEMORY_TTL_SECONDS
      }
    )
  } catch (_err) {
    // Ignore Redis write errors so chat requests still succeed.
  }
}

const appendMemoryTurn = (memory, role, content) =>
  [...memory, { role, content, created_at: new Date().toISOString() }].slice(
    -MAX_MEMORY_TURNS
  )

module.exports = {
  appendMemoryTurn,
  getSessionState,
  saveSessionState
}
