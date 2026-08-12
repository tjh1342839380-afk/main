import { APP_SHORT_NAME } from './brand'

export type Sub2ApiAuthProvider = 'email' | 'linuxdo' | 'oidc' | 'wechat' | 'github' | 'google' | 'dingtalk'

export interface Sub2ApiUserAuthBindingStatus {
  bound?: boolean
  bound_count?: number
  provider?: Sub2ApiAuthProvider | string
  provider_key?: string | null
  provider_subject?: string | null
  issuer?: string | null
  label?: string | null
  provider_label?: string | null
  display_name?: string | null
  subject_hint?: string | null
  verified_at?: string | null
  bind_start_path?: string | null
  can_bind?: boolean
  can_unbind?: boolean
  note_key?: string | null
  note?: string | null
  metadata?: Record<string, unknown>
}

export interface Sub2ApiUserProfileSourceContext {
  provider?: Sub2ApiAuthProvider | string
  source?: string | null
  label?: string | null
  provider_label?: string | null
}

export interface Sub2ApiNotifyEmailEntry {
  email: string
  disabled: boolean
  verified: boolean
}

export interface Sub2ApiUser {
  id: number
  username?: string
  email: string
  avatar_url?: string | null
  avatar_source?: string | Sub2ApiUserProfileSourceContext | null
  username_source?: string | Sub2ApiUserProfileSourceContext | null
  display_name_source?: string | Sub2ApiUserProfileSourceContext | null
  nickname_source?: string | Sub2ApiUserProfileSourceContext | null
  profile_sources?: {
    avatar?: string | Sub2ApiUserProfileSourceContext | null
    username?: string | Sub2ApiUserProfileSourceContext | null
    display_name?: string | Sub2ApiUserProfileSourceContext | null
    nickname?: string | Sub2ApiUserProfileSourceContext | null
  }
  identities?: Partial<Record<Sub2ApiAuthProvider, Sub2ApiUserAuthBindingStatus>>
  auth_bindings?: Partial<Record<Sub2ApiAuthProvider, boolean | Sub2ApiUserAuthBindingStatus>>
  identity_bindings?: Partial<Record<Sub2ApiAuthProvider, boolean | Sub2ApiUserAuthBindingStatus>>
  email_bound?: boolean
  linuxdo_bound?: boolean
  oidc_bound?: boolean
  wechat_bound?: boolean
  dingtalk_bound?: boolean
  role?: 'admin' | 'user' | string
  status?: 'active' | 'disabled' | string
  balance?: number
  frozen_balance?: number
  concurrency?: number
  rpm_limit?: number
  allowed_groups?: number[] | null
  balance_notify_enabled?: boolean
  balance_notify_threshold_type?: string
  balance_notify_threshold?: number | null
  balance_notify_extra_emails?: Sub2ApiNotifyEmailEntry[]
  total_recharged?: number
  last_active_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
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

export interface Sub2ApiProfileUpdateInput {
  username?: string
  avatar_url?: string | null
}

export interface Sub2ApiPasswordChangeInput {
  old_password: string
  new_password: string
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
  user_id?: number
  group_id?: number | null
  group?: Sub2ApiGroup
  current_concurrency?: number
  quota?: number
  quota_used?: number
  expires_at?: string | null
  created_at?: string
  updated_at?: string
  last_used_at?: string | null
  last_used_ip?: string | null
  ip_whitelist?: string[]
  ip_blacklist?: string[]
  rate_limit_5h?: number
  rate_limit_1d?: number
  rate_limit_7d?: number
  usage_5h?: number
  usage_1d?: number
  usage_7d?: number
  reset_5h_at?: string | null
  reset_1d_at?: string | null
  reset_7d_at?: string | null
}

export interface Sub2ApiGroup {
  id: number
  name: string
  description?: string | null
  platform?: string
  rate_multiplier?: number
  status?: string
  subscription_type?: string
}

export interface Sub2ApiCustomEndpoint {
  name: string
  endpoint: string
  description?: string
}

export interface Sub2ApiApiKeyCreateInput {
  name: string
  group_id?: number | null
  quota?: number
  expires_in_days?: number
  ip_whitelist?: string[]
  ip_blacklist?: string[]
  rate_limit_5h?: number
  rate_limit_1d?: number
  rate_limit_7d?: number
}

export interface Sub2ApiApiKeyUpdateInput {
  name?: string
  group_id?: number | null
  status?: 'active' | 'inactive'
  quota?: number
  expires_at?: string | null
  ip_whitelist?: string[]
  ip_blacklist?: string[]
  rate_limit_5h?: number
  rate_limit_1d?: number
  rate_limit_7d?: number
  reset_quota?: boolean
  reset_rate_limit_usage?: boolean
}

export interface Sub2ApiApiKeyListOptions {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  groupId?: number
  sortBy?: 'created_at' | 'name' | 'current_concurrency' | 'expires_at'
  sortOrder?: 'asc' | 'desc'
}

export interface Sub2ApiApiKeyListResult {
  items?: Sub2ApiApiKey[]
  total?: number
  page?: number
  page_size?: number
  pages?: number
}

export interface Sub2ApiDashboardStats {
  total_api_keys: number
  active_api_keys: number
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  today_requests: number
  today_input_tokens: number
  today_output_tokens: number
  today_cache_creation_tokens: number
  today_cache_read_tokens: number
  today_tokens: number
  today_cost: number
  today_actual_cost: number
  average_duration_ms: number
  rpm: number
  tpm: number
  by_platform?: Array<{
    platform: string
    total_requests: number
    total_tokens: number
    total_actual_cost: number
    today_requests: number
    today_tokens: number
    today_actual_cost: number
  }>
}

export interface Sub2ApiTrendPoint {
  date: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface Sub2ApiModelStat {
  model: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface Sub2ApiUsageLog {
  id: number
  user_id: number
  api_key_id: number
  account_id: number | null
  request_id: string
  model: string
  service_tier?: string | null
  reasoning_effort?: string | null
  inbound_endpoint?: string | null
  upstream_endpoint?: string | null
  group_id: number | null
  subscription_id: number | null
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  cache_creation_5m_tokens: number
  cache_creation_1h_tokens: number
  input_cost: number
  output_cost: number
  cache_creation_cost: number
  cache_read_cost: number
  total_cost: number
  actual_cost: number
  rate_multiplier: number
  long_context_billing_applied: boolean
  billing_type: number
  request_type?: 'unknown' | 'sync' | 'stream' | 'ws_v2' | 'cyber' | 'live'
  stream: boolean
  openai_ws_mode?: boolean
  duration_ms: number | null
  first_token_ms: number | null
  image_count: number
  image_size: string | null
  image_input_size: string | null
  image_output_size: string | null
  image_size_source: 'output' | 'input' | 'default' | 'legacy' | null
  image_size_breakdown: Record<string, number> | null
  image_input_tokens: number
  image_input_cost: number
  image_output_tokens: number
  image_output_cost: number
  media_type?: string | null
  user_agent: string | null
  ip_address?: string | null
  session_id?: string | null
  cache_ttl_overridden: boolean
  billing_mode?: string | null
  created_at: string
  user?: Sub2ApiUser
  api_key?: Sub2ApiApiKey
  group?: {
    id: number
    name: string
    platform: string
  }
}

export interface Sub2ApiDashboardQuery {
  start_date?: string
  end_date?: string
  granularity?: 'day' | 'hour'
  timezone?: string
}

export interface Sub2ApiDashboardTrendResponse {
  trend: Sub2ApiTrendPoint[]
  start_date: string
  end_date: string
  granularity: string
}

export interface Sub2ApiDashboardModelsResponse {
  models: Sub2ApiModelStat[]
  start_date: string
  end_date: string
}

export interface Sub2ApiUsagePage {
  items: Sub2ApiUsageLog[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface Sub2ApiPublicSettings {
  registration_enabled: boolean
  email_verify_enabled: boolean
  invitation_code_enabled: boolean
  password_reset_enabled: boolean
  api_base_url?: string
  custom_endpoints?: Sub2ApiCustomEndpoint[]
  site_name?: string
}

export interface Sub2ApiApiKeyUsageStat {
  api_key_id: number
  today_actual_cost: number
  total_actual_cost: number
}

export interface Sub2ApiApiKeysUsageResult {
  stats: Record<string, Sub2ApiApiKeyUsageStat>
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

async function requestWithSessionRefresh<T>(path: string, init: RequestInit = {}) {
  try {
    return await requestRaw<T>(path, init)
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status !== 401 || !getSub2ApiRefreshToken()) throw error

    await refreshSub2ApiSession()
    return requestRaw<T>(path, init)
  }
}

function getDashboardQuery(params: Sub2ApiDashboardQuery) {
  const query = new URLSearchParams()
  if (params.start_date) query.set('start_date', params.start_date)
  if (params.end_date) query.set('end_date', params.end_date)
  if (params.granularity) query.set('granularity', params.granularity)
  if (params.timezone) query.set('timezone', params.timezone)
  const value = query.toString()
  return value ? `?${value}` : ''
}

function saveSub2ApiUser(user: Sub2ApiUser) {
  const storage = getActiveStorage()
  if (storage) storage.setItem(USER_KEY, JSON.stringify(user))
}

export async function getCurrentSub2ApiUser() {
  const response = await requestWithSessionRefresh<Sub2ApiUser>('/auth/me')
  saveSub2ApiUser(response)
  return response
}

export async function getSub2ApiProfile() {
  const response = await requestWithSessionRefresh<Sub2ApiUser>('/user/profile', { method: 'GET' })
  saveSub2ApiUser(response)
  return response
}

export async function getSub2ApiDashboardStats() {
  return requestWithSessionRefresh<Sub2ApiDashboardStats>('/usage/dashboard/stats', { method: 'GET' })
}

export async function getSub2ApiDashboardTrend(params: Sub2ApiDashboardQuery = {}) {
  return requestWithSessionRefresh<Sub2ApiDashboardTrendResponse>(
    `/usage/dashboard/trend${getDashboardQuery(params)}`,
    { method: 'GET' },
  )
}

export async function getSub2ApiDashboardModels(params: Sub2ApiDashboardQuery = {}) {
  return requestWithSessionRefresh<Sub2ApiDashboardModelsResponse>(
    `/usage/dashboard/models${getDashboardQuery(params)}`,
    { method: 'GET' },
  )
}

export async function listRecentSub2ApiUsage() {
  return requestWithSessionRefresh<Sub2ApiUsagePage>(
    '/usage?page=1&page_size=5&sort_by=created_at&sort_order=desc',
    { method: 'GET' },
  )
}

export async function updateSub2ApiProfile(input: Sub2ApiProfileUpdateInput) {
  const response = await requestWithSessionRefresh<Sub2ApiUser>('/user', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  saveSub2ApiUser(response)
  return response
}

export async function changeSub2ApiPassword(input: Sub2ApiPasswordChangeInput) {
  return requestWithSessionRefresh<{ message: string }>('/user/password', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
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

export async function listSub2ApiKeys(options: Sub2ApiApiKeyListOptions = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    page_size: String(options.pageSize ?? 20),
  })
  const search = options.search?.trim()
  if (search) params.set('search', search)
  if (options.status) params.set('status', options.status)
  if (options.groupId !== undefined) params.set('group_id', String(options.groupId))
  if (options.sortBy) params.set('sort_by', options.sortBy)
  if (options.sortOrder) params.set('sort_order', options.sortOrder)
  return requestWithSessionRefresh<Sub2ApiApiKeyListResult>(`/keys?${params.toString()}`)
}

export async function createSub2ApiKey(input: string | Sub2ApiApiKeyCreateInput = APP_SHORT_NAME) {
  const payload = typeof input === 'string' ? { name: input } : input
  return requestWithSessionRefresh<Sub2ApiApiKey>('/keys', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateSub2ApiKey(id: number, input: Sub2ApiApiKeyUpdateInput) {
  return requestWithSessionRefresh<Sub2ApiApiKey>(`/keys/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteSub2ApiKey(id: number) {
  return requestWithSessionRefresh<{ message?: string }>(`/keys/${id}`, {
    method: 'DELETE',
  })
}

export async function listSub2ApiGroups() {
  return requestWithSessionRefresh<Sub2ApiGroup[]>('/groups/available')
}

export async function getSub2ApiKeysUsage(ids: number[]) {
  if (ids.length === 0) return { stats: {} }
  return requestWithSessionRefresh<Sub2ApiApiKeysUsageResult>('/usage/dashboard/api-keys-usage', {
    method: 'POST',
    body: JSON.stringify({ api_key_ids: ids }),
  })
}

export async function ensureSub2ApiImageKey() {
  const result = await listSub2ApiKeys()
  const existing = result.items?.find((item) => item.status === 'active' && typeof item.key === 'string' && item.key.trim())
  if (existing) return existing.key

  const created = await createSub2ApiKey()
  if (!created.key?.trim()) throw new Error('后台没有返回可用的 API Key。')
  return created.key
}
