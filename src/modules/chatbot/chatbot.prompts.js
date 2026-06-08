const fs = require('fs')
const path = require('path')

let systemPromptCache = null

const getSystemPrompt = () => {
  if (systemPromptCache) return systemPromptCache

  const promptPath = path.join(__dirname, 'chatbot.system.md')
  systemPromptCache = fs.readFileSync(promptPath, 'utf8').trim()

  return systemPromptCache
}

module.exports = {
  getSystemPrompt
}
