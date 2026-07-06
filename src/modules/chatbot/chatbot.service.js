const crypto = require('crypto')
const { appendMemoryTurn, getSessionState, saveSessionState } = require('./chatbot.memory')
const { getSystemPrompt } = require('./chatbot.prompts')
const {
  buildClarificationReminder,
  resolveClarificationChoice
} = require('./chatbot.clarification')
const {
  getBuildingSnapshot,
  getLecturerStatusSnapshot,
  getRoomLecturerStatuses,
  getRoomSnapshot,
  mergeContextScope,
  normalizeText,
  resolveBuildingOrExplain,
  resolveLecturerOrExplain,
  resolveRoomOrExplain,
  getRoomSchedulesForDay,
  getAvailableRoomsSnapshot,
  getEnergyAnomaliesSnapshot
} = require('./chatbot.data')
const { buildTools } = require('./chatbot.tools')

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
  'ruangan',
  'kelas',
  'jadwal',
  'schedule',
  'dosen',
  'pak',
  'bapak',
  'bu',
  'ibu',
  'lecturer',
  'mengajar',
  'available',
  'busy',
  'status',
  'suhu',
  'temperature',
  'kelembapan',
  'humidity',
  'monitoring',
  'dashboard',
  'konsumsi',
  'trend',
  'anomali',
  'rekomendasi',
  'saran',
  'kosong',
  'optimal',
  'efisien',
  'boros',
  'hemat'
]

const FOLLOW_UP_KEYWORDS = [
  'kalo',
  'kalau',
  'itu',
  'tadi',
  'yang tadi',
  'yang ini',
  'yang itu',
  'kenapa',
  'bagaimana',
  'gimana',
  'lanjut',
  'jelasin',
  'detailnya',
  'sekarang',
  'kalau yang',
  'kalo yang',
  'kalau bu',
  'kalo bu',
  'kalau ibu',
  'kalo ibu',
  'kalau pak',
  'kalo pak',
  'kalau bapak',
  'kalo bapak'
]

let langChainCache = null

const buildSessionId = (providedSessionId) => {
  const normalized = String(providedSessionId || '').trim()
  return normalized || crypto.randomUUID()
}

const hasDomainSignal = (message) => {
  const normalizedMessage = normalizeText(message)
  return DOMAIN_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))
}

const isFollowUpPrompt = (message) => {
  const normalizedMessage = normalizeText(message)
  return FOLLOW_UP_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))
}

const runPromptGuard = ({ message, memory, clarification }) => {
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

  if (clarification) {
    return { allowed: true }
  }

  return {
    allowed: false,
    code: 'OUT_OF_SCOPE',
    reason:
      'Chatbot dashboard hanya melayani pertanyaan tentang energi, sensor, device, gedung, ruangan, jadwal ruangan, dan status dosen.'
  }
}

const getProviderConfig = () => ({
  url: process.env.LLAMA_API_URL || '',
  apiKey: process.env.LLAMA_API_KEY || '',
  model: process.env.LLAMA_MODEL || '',
  providerName: process.env.LLAMA_PROVIDER_NAME || DEFAULT_PROVIDER_NAME,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
})

const ensureProviderConfigured = () => {
  const config = getProviderConfig()

  if ((!config.url || !config.apiKey || !config.model) && !config.geminiApiKey) {
    const err = new Error(
      'LLM provider belum dikonfigurasi. Isi LLAMA_API_URL, LLAMA_API_KEY, dan LLAMA_MODEL, atau GEMINI_API_KEY.'
    )
    err.statusCode = 503
    throw err
  }

  return config
}

const normalizeBaseUrl = (url) =>
  String(url || '')
    .trim()
    .replace(/\/chat\/completions\/?$/i, '')

const ensureLangChainDeps = () => {
  if (langChainCache) return langChainCache

  try {
    const { ChatOpenAI } = require('@langchain/openai')
    const { ChatGoogleGenerativeAI } = require('@langchain/google-genai')
    const { DynamicStructuredTool } = require('@langchain/core/tools')
    const {
      AIMessage,
      HumanMessage,
      SystemMessage,
      ToolMessage
    } = require('@langchain/core/messages')
    const { z } = require('zod')

    langChainCache = {
      AIMessage,
      ChatOpenAI,
      ChatGoogleGenerativeAI,
      DynamicStructuredTool,
      HumanMessage,
      SystemMessage,
      ToolMessage,
      z
    }

    return langChainCache
  } catch (_err) {
    const err = new Error(
      'Dependency LangChain belum terpasang. Jalankan npm install untuk dependency chatbot baru.'
    )
    err.statusCode = 503
    throw err
  }
}

const createChatModels = () => {
  const { ChatOpenAI, ChatGoogleGenerativeAI } = ensureLangChainDeps()
  const config = ensureProviderConfigured()

  let primary = null
  let fallback = null

  if (config.apiKey && config.url && config.model) {
    primary = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: {
        baseURL: normalizeBaseUrl(config.url)
      },
      model: config.model,
      temperature: 0.2,
      maxTokens: 400
    })
  }

  if (config.geminiApiKey) {
    fallback = new ChatGoogleGenerativeAI({
      apiKey: config.geminiApiKey,
      modelName: config.geminiModel,
      temperature: 0.2,
      maxOutputTokens: 400
    })
  }

  if (!primary && fallback) {
    primary = fallback
    fallback = null
  }

  return { primary, fallback }
}

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

const formatMemoryMessages = (memory) => {
  const { AIMessage, HumanMessage } = ensureLangChainDeps()

  return memory.flatMap((item) => {
    if (item.role === 'user') {
      return [new HumanMessage(item.content)]
    }

    if (item.role === 'assistant') {
      return [new AIMessage(item.content)]
    }

    return []
  })
}

const runToolCallingConversation = async ({
  message,
  memory,
  defaultBuildingId,
  defaultRoomId,
  defaultLecturerId,
  pendingClarification
}) => {
  const { HumanMessage, SystemMessage, ToolMessage, DynamicStructuredTool, z } =
    ensureLangChainDeps()

  const { primary, fallback } = createChatModels()
  const { executors, tools } = buildTools({
    DynamicStructuredTool,
    z,
    defaultBuildingId,
    defaultRoomId,
    defaultLecturerId,
    helpers: {
      getBuildingSnapshot,
      getLecturerStatusSnapshot,
      getRoomLecturerStatuses,
      getRoomSchedulesForDay,
      getRoomSnapshot,
      resolveBuildingOrExplain,
      resolveLecturerOrExplain,
      resolveRoomOrExplain,
      getAvailableRoomsSnapshot,
      getEnergyAnomaliesSnapshot
    }
  })
  let modelWithTools = primary.bindTools(tools)
  if (fallback) {
    modelWithTools = modelWithTools.withFallbacks({
      fallbacks: [fallback.bindTools(tools)]
    })
  }

  const messages = [
    new SystemMessage(getSystemPrompt()),
    ...formatMemoryMessages(memory),
    new HumanMessage(message)
  ]

  const usedTools = []
  let contextScope = {
    building_id: defaultBuildingId || null,
    room_id: defaultRoomId || null,
    lecturer_id: defaultLecturerId || null
  }
  let finalResponse = null
  let nextClarification = pendingClarification || null

  for (let index = 0; index < 5; index += 1) {
    const response = await modelWithTools.invoke(messages)
    messages.push(response)

    if (!response.tool_calls?.length) {
      finalResponse = response
      break
    }

    for (const toolCall of response.tool_calls) {
      const executor = executors[toolCall.name]

      if (!executor) {
        messages.push(
          new ToolMessage({
            content: JSON.stringify({
              ok: false,
              message: `Tool ${toolCall.name} tidak tersedia.`,
              data: null,
              clarification: null,
              context_scope: contextScope
            }),
            tool_call_id: toolCall.id
          })
        )
        continue
      }

      const toolResult = await executor(toolCall.args || {})
      usedTools.push(toolCall.name)
      contextScope = mergeContextScope(contextScope, toolResult.context_scope)
      nextClarification = toolResult.clarification || null

      messages.push(
        new ToolMessage({
          content: JSON.stringify(toolResult),
          tool_call_id: toolCall.id
        })
      )
    }
  }

  if (!finalResponse) {
    const err = new Error('Chatbot gagal menyelesaikan percakapan dengan tool.')
    err.statusCode = 502
    throw err
  }

  return {
    text: Array.isArray(finalResponse.content)
      ? finalResponse.content
          .map((item) => item?.text || '')
          .join('\n')
          .trim()
      : String(finalResponse.content || '').trim(),
    usedTools,
    contextScope,
    pendingClarification: nextClarification,
    model: finalResponse.response_metadata?.model_name || finalResponse.response_metadata?.model || 'unknown',
    provider: getProviderConfig().providerName
  }
}

const chatDashboard = async ({
  message,
  building_id: buildingId,
  room_id: roomId,
  session_id: sessionIdInput
}) => {
  const sessionId = buildSessionId(sessionIdInput)
  const sessionState = await getSessionState(sessionId)
  const memory = sessionState.memory || []
  const pendingClarification = sessionState.clarification || null
  const clarificationResolution = resolveClarificationChoice({
    clarification: pendingClarification,
    message
  })
  const clarifiedOption = clarificationResolution.matchedOption

  const promptGuard = runPromptGuard({
    message,
    memory,
    clarification: pendingClarification
  })
  if (!promptGuard.allowed) {
    return rejectPrompt({
      sessionId,
      reason: promptGuard.reason,
      code: promptGuard.code
    })
  }

  const llmResponse = await runToolCallingConversation({
    message: clarifiedOption
      ? clarificationResolution.clarifiedMessage
      : pendingClarification
        ? `${message}\n\nKlarifikasi yang masih menunggu: ${buildClarificationReminder(
            pendingClarification
          )}`
        : message,
    memory,
    defaultBuildingId:
      buildingId ||
      (pendingClarification?.entity_type === 'building'
        ? clarifiedOption?.id || null
        : pendingClarification?.entity_type === 'room'
          ? clarifiedOption?.building_id || null
          : null),
    defaultRoomId:
      roomId ||
      (pendingClarification?.entity_type === 'room'
        ? clarifiedOption?.id || null
        : null),
    defaultLecturerId:
      pendingClarification?.entity_type === 'lecturer'
        ? clarifiedOption?.lecturer_id || clarifiedOption?.id || null
        : null,
    pendingClarification: clarifiedOption ? null : pendingClarification
  })

  const nextMemory = appendMemoryTurn(
    appendMemoryTurn(memory, 'user', message),
    'assistant',
    llmResponse.text
  )
  await saveSessionState(sessionId, {
    memory: nextMemory,
    clarification: llmResponse.pendingClarification || null
  })

  return {
    ok: true,
    statusCode: 200,
    session_id: sessionId,
    message: 'success',
    data: {
      reply: llmResponse.text,
      intent: llmResponse.usedTools[0] || 'general_dashboard',
      context_scope: llmResponse.contextScope,
      tools_used: llmResponse.usedTools
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
