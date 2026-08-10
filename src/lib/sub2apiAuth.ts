export interface Sub2ApiUser {
  id: number
  username?: string
  email: string
  role?: 'admin' | 'user' | string
  status?: 'active' | 'disabled' | string
  balance?: number
}

export interface Sub2ApiAuthResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  user?: Sub2ApiUser
  requires_2fa?: boolean
  temp_token?: string
}

export interface Sub2ApiLoginInput {
  email: string
  password: string
}

export interface Sub2ApiRegisterInput extends Sub2ApiLoginInput {
  verify_code?: string
  invitation_code?: string
}

export interface Sub2ApiTwoFactorInput {
  temp_token: string
  totp_code: string
}

export interface Sub2ApiSession {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  user: Sub2ApiUser | null
}

export interface Sub2ApiApiKey {
  id: number
  key: string
  name: string
  status: string
}

export interface Sub2ApiPublicSettings {
  registration_enabled: boolean
  email_verify_enabled: boolean
  invitation_code_enabled: boolean
  password_reset_enabled: boolean
}

interface ApiEnvelope<T> {
  code?: number
  message?: string
  data?: T
  error?: { message?: string }
}

const ACCESS_TOKEN_KEY = 'sub2api_access_token'
const REFRESH_TOKEN_KEY = 'sub2api_refresh_token'
const EXPIRES_AT_KEY = 'sub2api_token_expires_at'
const USER_KEY = 'sub2api_user'
const DEFAULT_AUTH_BASE_URL = '/api/v1'

let refreshRequest: Promise<Sub2ApiAuthResponse> | null = null

function getStoragePair() {
  try {
    return { local: window.localStorage, session: window.sessionStorage }
  } catch {
    return { local: null, session: null }
  }
}

function readStoredValue(key: string) {
  const storage = getStoragePair()
  return storage.local?.getItem(key) ?? storage.session?.getItem(key) ?? null
}

function getActiveStorage() {
  const storage = getStoragePair()
  return storage.local?.getItem(ACCESS_TOKEN_KEY) ? storage.local : storage.session
}

function isRememberedSession() {
  return Boolean(getStoragePair().local?.getItem(ACCESS_TOKEN_KEY))
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '') || DEFAULT_AUTH_BASE_URL
}

export function getSub2ApiAuthBaseUrl() {
  return normalizeBaseUrl(import.meta.env.VITE_SUB2API_AUTH_URL ?? '')
}

export function getSub2ApiConsoleUrl() {
  const configured = import.meta.env.VITE_SUB2API_CONSOLE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')

  const authBaseUrl = getSub2ApiAuthBaseUrl()
  if (!/^https?:\/\//i.test(authBaseUrl)) return null
  return authBaseUrl.replace(/\/api\/v1$/i, '')
}

export function getSub2ApiGatewayBaseUrl() {
  const configured = import.meta.env.VITE_DEFAULT_API_URL?.trim()
  if (configured) return normalizeBaseUrl(configured)

  const authBaseUrl = getSub2ApiAuthBaseUrl()
  return authBaseUrl.replace(/\/api\/v1$/, '/v1')
}

function buildRequestUrl(path: string) {
  const baseUrl = getSub2ApiAuthBaseUrl()
  if (import.meta.env.VITE_SUB2API_AUTH_PROXY !== 'true') return `${baseUrl}${path}`

  return `/sub2api-auth${path}`
}

export function getSub2ApiAccessToken() {
  return readStoredValue(ACCESS_TOKEN_KEY)
}

export function getSub2ApiRefreshToken() {
  return readStoredValue(REFRESH_TOKEN_KEY)
}

function parseJson<T>(value: string) {
  if (!value.trim()) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback

  const record = payload as ApiEnvelope<unknown>
  return record.message || record.error?.message || fallback
}

function createApiError(message: string, status: number, code?: number) {
  const error = new Error(message) as Error & { status?: number; code?: number }
  error.status = status
  error.code = code
  return error
}

async function requestRaw<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const accessToken = getSub2ApiAccessToken()
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  let response: Response
  try {
    response = await fetch(buildRequestUrl(path), {
      ...init,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new Error('无法连接 Sub2API 后台，请检查服务地址和网络连接。')
  }

  const rawBody = await response.text()
  const payload = parseJson<ApiEnvelope<T> | T>(rawBody)
  const envelope = payload && typeof payload === 'object' && 'code' in payload
    ? payload as ApiEnvelope<T>
    : null

  if (!response.ok || (envelope && envelope.code !== undefined && envelope.code !== 0)) {
    throw createApiError(
      getErrorMessage(payload, `后台请求失败（${response.status}）`),
      response.status,
      envelope?.code,
    )
  }

  return envelope ? envelope.data as T : payload as T
}

function saveSession(response: Sub2ApiAuthResponse, previousUser: Sub2ApiUser | null = null, remember = true) {
  const storagePair = getStoragePair()
  const storage = remember ? storagePair.local : storagePair.session
  const otherStorage = remember ? storagePair.session : storagePair.local
  if (!storage || !response.access_token) return

  otherStorage?.removeItem(ACCESS_TOKEN_KEY)
  otherStorage?.removeItem(REFRESH_TOKEN_KEY)
  otherStorage?.removeItem(EXPIRES_AT_KEY)
  otherStorage?.removeItem(USER_KEY)

  storage.setItem(ACCESS_TOKEN_KEY, response.access_token)
  if (response.refresh_token) storage.setItem(REFRESH_TOKEN_KEY, response.refresh_token)
  else storage.removeItem(REFRESH_TOKEN_KEY)
  if (response.expires_in) storage.setItem(EXPIRES_AT_KEY, String(Date.now() + response.expires_in * 1000))
  else storage.removeItem(EXPIRES_AT_KEY)
  if (response.user) storage.setItem(USER_KEY, JSON.stringify(response.user))
  else if (previousUser) storage.setItem(USER_KEY, JSON.stringify(previousUser))
  else storage.removeItem(USER_KEY)
}

export function clearSub2ApiSession() {
  const storagePair = getStoragePair()
  for (const storage of [storagePair.local, storagePair.session]) {
    storage?.removeItem(ACCESS_TOKEN_KEY)
    storage?.removeItem(REFRESH_TOKEN_KEY)
    storage?.removeItem(EXPIRES_AT_KEY)
    storage?.removeItem(USER_KEY)
  }
}

export function getSub2ApiSession(): Sub2ApiSession | null {
  const accessToken = readStoredValue(ACCESS_TOKEN_KEY)
  if (!accessToken) return null

  const rawUser = readStoredValue(USER_KEY)
  const user = rawUser ? parseJson<Sub2ApiUser>(rawUser) : null
  const expiresAtValue = readStoredValue(EXPIRES_AT_KEY)
  const expiresAt = expiresAtValue ? Number(expiresAtValue) : null

  return {
    accessToken,
    refreshToken: readStoredValue(REFRESH_TOKEN_KEY),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    user,
  }
}

export async function loginSub2Api(input: Sub2ApiLoginInput, options: { remember?: boolean } = {}) {
  const response = await requestRaw<Sub2ApiAuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (!response.requires_2fa) saveSession(response, null, options.remember !== false)
  return response
}

export async function loginSub2ApiTwoFactor(input: Sub2ApiTwoFactorInput, options: { remember?: boolean } = {}) {
  const response = await requestRaw<Sub2ApiAuthResponse>('/auth/login/2fa', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  saveSession(response, null, options.remember !== false)
  return response
}

export async function registerSub2Api(input: Sub2ApiRegisterInput, options: { remember?: boolean } = {}) {
  const response = await requestRaw<Sub2ApiAuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  saveSession(response, null, options.remember !== false)
  return response
}

export async function refreshSub2ApiSession() {
  const refreshToken = getSub2ApiRefreshToken()
  if (!refreshToken) throw new Error('登录状态已失效，请重新登录。')
  if (refreshRequest) return refreshRequest

  const previousUser = getSub2ApiSession()?.user ?? null
  const remember = isRememberedSession()
  refreshRequest = requestRaw<Sub2ApiAuthResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).then((response) => {
    saveSession(response, previousUser, remember)
    return response
  }).finally(() => {
    refreshRequest = null
  })

  return refreshRequest
}

export async function getCurrentSub2ApiUser() {
  try {
    const response = await requestRaw<Sub2ApiUser>('/auth/me')
    const storage = getActiveStorage()
    if (storage) storage.setItem(USER_KEY, JSON.stringify(response))
    return response
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status !== 401 || !getSub2ApiRefreshToken()) throw error

    await refreshSub2ApiSession()
    const response = await requestRaw<Sub2ApiUser>('/auth/me')
    const storage = getActiveStorage()
    if (storage) storage.setItem(USER_KEY, JSON.stringify(response))
    return response
  }
}

export async function logoutSub2Api() {
  const refreshToken = getSub2ApiRefreshToken()
  try {
    if (refreshToken) {
      await requestRaw('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
    }
  } finally {
    clearSub2ApiSession()
  }
}

export async function requestSub2ApiPasswordReset(email: string) {
  return requestRaw<{ message?: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function sendSub2ApiVerifyCode(email: string) {
  return requestRaw<{ message?: string; countdown?: number }>('/auth/send-verify-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function getSub2ApiPublicSettings() {
  return requestRaw<Sub2ApiPublicSettings>('/settings/public')
}

export async function listSub2ApiKeys() {
  return requestRaw<{ items?: Sub2ApiApiKey[] }>('/keys?page=1&page_size=20')
}

export async function createSub2ApiKey(name = 'GPT Image 2 For TJH') {
  return requestRaw<Sub2ApiApiKey>('/keys', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function ensureSub2ApiImageKey() {
  const result = await listSub2ApiKeys()
  const existing = result.items?.find((item) => item.status === 'active' && item.key.trim())
  if (existing) return existing.key

  const created = await createSub2ApiKey()
  if (!created.key?.trim()) throw new Error('后台没有返回可用的 API Key。')
  return created.key
}
