const APP_HEADER_NAME = 'x-client-app'
const DEFAULT_AUTH_APP = 'default'
const COOKIE_NAME_FALLBACKS = {
  accessToken: ['accessToken'],
  refreshToken: ['refreshToken']
}

const normalizeAuthApp = (value) => {
  if (!value || typeof value !== 'string') return DEFAULT_AUTH_APP

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  const collapsed = normalized.replace(/-+/g, '-').replace(/^-|-$/g, '')

  return collapsed || DEFAULT_AUTH_APP
}

const getAuthApp = (req) => {
  const headerValue = req.get(APP_HEADER_NAME)
  return normalizeAuthApp(headerValue)
}

const buildCookieName = (type, authApp = DEFAULT_AUTH_APP) => {
  const normalizedApp = normalizeAuthApp(authApp)
  return `${normalizedApp}_${type}`
}

const getCookieNameCandidates = (type, req) => {
  const cookieNames = [buildCookieName(type, getAuthApp(req))]
  const fallbacks = COOKIE_NAME_FALLBACKS[type] || []

  fallbacks.forEach((name) => {
    if (!cookieNames.includes(name)) {
      cookieNames.push(name)
    }
  })

  return cookieNames
}

const readCookieByCandidates = (req, type) => {
  const candidates = getCookieNameCandidates(type, req)

  for (const name of candidates) {
    if (req.cookies?.[name]) {
      return req.cookies[name]
    }
  }

  return null
}

module.exports = {
  APP_HEADER_NAME,
  DEFAULT_AUTH_APP,
  buildCookieName,
  getAuthApp,
  getCookieNameCandidates,
  readCookieByCandidates
}
