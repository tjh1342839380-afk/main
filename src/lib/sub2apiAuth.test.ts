import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  changeSub2ApiPassword,
  clearSub2ApiSession,
  createSub2ApiKey,
  deleteSub2ApiKey,
  ensureSub2ApiImageKey,
  getCurrentSub2ApiUser,
  getSub2ApiDashboardModels,
  getSub2ApiDashboardStats,
  getSub2ApiDashboardTrend,
  getSub2ApiKeysUsage,
  getSub2ApiProfile,
  getSub2ApiPublicSettings,
  getSub2ApiSession,
  listSub2ApiGroups,
  listRecentSub2ApiUsage,
  listSub2ApiKeys,
  loginSub2Api,
  logoutSub2Api,
  requestSub2ApiPasswordReset,
  updateSub2ApiKey,
  updateSub2ApiProfile,
} from './sub2apiAuth'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('window', {
    localStorage: createStorage(),
    sessionStorage: createStorage(),
  })
  vi.stubEnv('VITE_SUB2API_AUTH_URL', 'https://auth.example.com/api/v1')
  vi.stubEnv('VITE_SUB2API_AUTH_PROXY', 'false')
})

afterEach(() => {
  clearSub2ApiSession()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('sub2apiAuth', () => {
  it('logs in and keeps non-remembered sessions in sessionStorage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        user: { id: 7, email: 'user@example.com' },
      },
    }))

    await loginSub2Api({ email: 'user@example.com', password: 'password' }, { remember: false })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/v1/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(window.localStorage.getItem('sub2api_access_token')).toBeNull()
    expect(window.sessionStorage.getItem('sub2api_access_token')).toBe('access-token')
    expect(getSub2ApiSession()?.user?.email).toBe('user@example.com')
  })

  it('uses the fixed same-origin auth proxy in production mode', async () => {
    vi.stubEnv('VITE_SUB2API_AUTH_PROXY', 'true')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: { message: 'ok' },
    }))

    await requestSub2ApiPasswordReset('user@example.com')

    expect(fetchMock).toHaveBeenCalledWith(
      '/sub2api-auth/auth/forgot-password',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('loads public registration settings through the auth proxy', async () => {
    vi.stubEnv('VITE_SUB2API_AUTH_PROXY', 'true')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: {
        registration_enabled: true,
        email_verify_enabled: true,
        invitation_code_enabled: false,
        password_reset_enabled: true,
      },
    }))

    await expect(getSub2ApiPublicSettings()).resolves.toMatchObject({
      registration_enabled: true,
      email_verify_enabled: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/sub2api-auth/settings/public',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('loads and persists the Sub2API user profile through the auth proxy', async () => {
    vi.stubEnv('VITE_SUB2API_AUTH_PROXY', 'true')
    window.sessionStorage.setItem('sub2api_access_token', 'access-token')
    const profile = {
      id: 7,
      email: 'user@example.com',
      username: 'image-user',
      avatar_url: 'https://cdn.example.com/avatar.png',
      balance: 12.5,
      concurrency: 3,
      email_bound: true,
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: profile,
    }))

    await expect(getSub2ApiProfile()).resolves.toEqual(profile)
    expect(fetchMock).toHaveBeenCalledWith(
      '/sub2api-auth/user/profile',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
    expect(getSub2ApiSession()?.user).toEqual(profile)
    expect(window.localStorage.getItem('sub2api_user')).toBeNull()
  })

  it('updates and persists the Sub2API user profile', async () => {
    window.localStorage.setItem('sub2api_access_token', 'access-token')
    const profile = {
      id: 7,
      email: 'user@example.com',
      username: 'updated-user',
      avatar_url: null,
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: profile,
    }))

    await expect(updateSub2ApiProfile({
      username: 'updated-user',
      avatar_url: null,
    })).resolves.toEqual(profile)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/v1/user',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ username: 'updated-user', avatar_url: null }),
      }),
    )
    expect(getSub2ApiSession()?.user).toEqual(profile)
    expect(window.sessionStorage.getItem('sub2api_user')).toBeNull()
  })

  it('changes the Sub2API password with the official request payload', async () => {
    window.sessionStorage.setItem('sub2api_access_token', 'access-token')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: { message: 'Password changed successfully' },
    }))

    await expect(changeSub2ApiPassword({
      old_password: 'old-password',
      new_password: 'new-password',
    })).resolves.toEqual({ message: 'Password changed successfully' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/v1/user/password',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          old_password: 'old-password',
          new_password: 'new-password',
        }),
      }),
    )
  })

  it('refreshes an expired session before retrying the user profile request', async () => {
    window.sessionStorage.setItem('sub2api_access_token', 'expired-token')
    window.sessionStorage.setItem('sub2api_refresh_token', 'refresh-token')
    window.sessionStorage.setItem('sub2api_user', JSON.stringify({ id: 7, email: 'old@example.com' }))
    const profile = {
      id: 7,
      email: 'user@example.com',
      username: 'renewed-user',
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 401, message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          access_token: 'renewed-token',
          refresh_token: 'renewed-refresh-token',
          expires_in: 3600,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: profile }))

    await expect(getSub2ApiProfile()).resolves.toEqual(profile)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://auth.example.com/api/v1/user/profile')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://auth.example.com/api/v1/auth/refresh')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://auth.example.com/api/v1/user/profile')
    const retryHeaders = new Headers((fetchMock.mock.calls[2]?.[1] as RequestInit).headers)
    expect(retryHeaders.get('Authorization')).toBe('Bearer renewed-token')
    expect(getSub2ApiSession()?.user).toEqual(profile)
  })

  it('refreshes an expired session before retrying dashboard stats', async () => {
    window.sessionStorage.setItem('sub2api_access_token', 'expired-token')
    window.sessionStorage.setItem('sub2api_refresh_token', 'refresh-token')
    const stats = {
      total_api_keys: 3,
      active_api_keys: 2,
      today_requests: 18,
      today_tokens: 4200,
      today_actual_cost: 0.42,
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 401, message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          access_token: 'renewed-token',
          refresh_token: 'renewed-refresh-token',
          expires_in: 3600,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: stats }))

    await expect(getSub2ApiDashboardStats()).resolves.toEqual(stats)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://auth.example.com/api/v1/usage/dashboard/stats')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://auth.example.com/api/v1/auth/refresh')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://auth.example.com/api/v1/usage/dashboard/stats')
    const retryHeaders = new Headers((fetchMock.mock.calls[2]?.[1] as RequestInit).headers)
    expect(retryHeaders.get('Authorization')).toBe('Bearer renewed-token')
  })

  it('loads dashboard trend with encoded date range and timezone parameters', async () => {
    vi.stubEnv('VITE_SUB2API_AUTH_PROXY', 'true')
    const trend = {
      trend: [{
        date: '2026-08-10',
        requests: 8,
        input_tokens: 100,
        output_tokens: 25,
        cache_creation_tokens: 0,
        cache_read_tokens: 30,
        total_tokens: 155,
        cost: 0.12,
        actual_cost: 0.1,
      }],
      start_date: '2026-08-04',
      end_date: '2026-08-10',
      granularity: 'day',
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, data: trend }))

    await expect(getSub2ApiDashboardTrend({
      start_date: '2026-08-04',
      end_date: '2026-08-10',
      granularity: 'day',
      timezone: 'Asia/Shanghai',
    })).resolves.toEqual(trend)
    expect(fetchMock).toHaveBeenCalledWith(
      '/sub2api-auth/usage/dashboard/trend?start_date=2026-08-04&end_date=2026-08-10&granularity=day&timezone=Asia%2FShanghai',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('loads dashboard model distribution with the supported query parameters', async () => {
    const models = {
      models: [{
        model: 'gpt-image-1',
        requests: 5,
        input_tokens: 80,
        output_tokens: 20,
        cache_creation_tokens: 0,
        cache_read_tokens: 10,
        total_tokens: 110,
        cost: 0.08,
        actual_cost: 0.06,
      }],
      start_date: '2026-08-04',
      end_date: '2026-08-10',
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, data: models }))

    await expect(getSub2ApiDashboardModels({
      start_date: '2026-08-04',
      end_date: '2026-08-10',
      granularity: 'hour',
      timezone: 'UTC+08:00',
    })).resolves.toEqual(models)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/v1/usage/dashboard/models?start_date=2026-08-04&end_date=2026-08-10&granularity=hour&timezone=UTC%2B08%3A00',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('loads the five most recent usage records in descending creation order', async () => {
    const page = {
      items: [{
        id: 91,
        model: 'gpt-image-1',
        input_tokens: 120,
        output_tokens: 30,
        total_cost: 0.15,
        actual_cost: 0.12,
        created_at: '2026-08-10T08:00:00Z',
      }],
      total: 1,
      page: 1,
      page_size: 5,
      pages: 1,
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, data: page }))

    await expect(listRecentSub2ApiUsage()).resolves.toEqual(page)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/v1/usage?page=1&page_size=5&sort_by=created_at&sort_order=desc',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('loads the current user API keys through the auth proxy', async () => {
    vi.stubEnv('VITE_SUB2API_AUTH_PROXY', 'true')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: {
        items: [{ id: 2, key: 'sk-active', name: 'image', status: 'active' }],
      },
    }))

    await expect(listSub2ApiKeys()).resolves.toMatchObject({
      items: [{ id: 2, name: 'image', status: 'active' }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/sub2api-auth/keys?page=1&page_size=20',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('loads a filtered API key page with pagination metadata', async () => {
    window.sessionStorage.setItem('sub2api_access_token', 'access-token')
    const page = {
      items: [{ id: 21, key: 'sk-workbench', name: '工作台密钥', status: 'active' }],
      total: 24,
      page: 3,
      page_size: 10,
      pages: 3,
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: page,
    }))

    await expect(listSub2ApiKeys({
      page: 3,
      pageSize: 10,
      search: '工作台 key',
      status: 'active',
      groupId: 6,
      sortBy: 'current_concurrency',
      sortOrder: 'desc',
    })).resolves.toEqual(page)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://auth.example.com/api/v1/keys?page=3&page_size=10&search=%E5%B7%A5%E4%BD%9C%E5%8F%B0+key&status=active&group_id=6&sort_by=current_concurrency&sort_order=desc',
    )
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(request.method ?? 'GET').toBe('GET')
    expect(request.credentials).toBe('include')
    const headers = new Headers(request.headers)
    expect(headers.get('Authorization')).toBe('Bearer access-token')
    expect(headers.get('Accept')).toBe('application/json')
  })

  it('creates an API key with the requested name', async () => {
    window.sessionStorage.setItem('sub2api_access_token', 'access-token')
    const key = { id: 3, key: 'sk-workbench', name: '工作台密钥', status: 'active' }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: key,
    }))

    await expect(createSub2ApiKey('工作台密钥')).resolves.toEqual(key)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/v1/keys',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: '工作台密钥' }),
        credentials: 'include',
      }),
    )
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get('Authorization')).toBe('Bearer access-token')
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('updates an API key with Sub2API quota and access policy fields', async () => {
    window.sessionStorage.setItem('sub2api_access_token', 'access-token')
    const key = { id: 3, key: 'sk-workbench', name: '生产密钥', status: 'active', group_id: 6 }
    const input = {
      name: '生产密钥',
      group_id: 6,
      quota: 25,
      expires_at: '2026-12-31T16:00:00.000Z',
      ip_whitelist: ['203.0.113.8'],
      ip_blacklist: [],
      rate_limit_5h: 2,
      rate_limit_1d: 5,
      rate_limit_7d: 20,
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, data: key }))

    await expect(updateSub2ApiKey(3, input)).resolves.toEqual(key)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/v1/keys/3',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(input),
        credentials: 'include',
      }),
    )
  })

  it('deletes an API key through the official key endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: { message: 'deleted' },
    }))

    await expect(deleteSub2ApiKey(9)).resolves.toEqual({ message: 'deleted' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/v1/keys/9',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    )
  })

  it('loads the API key groups available to the current user', async () => {
    vi.stubEnv('VITE_SUB2API_AUTH_PROXY', 'true')
    const groups = [{ id: 6, name: 'OpenAI 标准组', platform: 'openai', rate_multiplier: 1 }]
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, data: groups }))

    await expect(listSub2ApiGroups()).resolves.toEqual(groups)
    expect(fetchMock).toHaveBeenCalledWith(
      '/sub2api-auth/groups/available',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('loads batched API key usage for the current page', async () => {
    const usage = {
      stats: {
        3: { api_key_id: 3, today_actual_cost: 0.12, total_actual_cost: 2.45 },
        9: { api_key_id: 9, today_actual_cost: 0, total_actual_cost: 0.8 },
      },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 0, data: usage }))

    await expect(getSub2ApiKeysUsage([3, 9])).resolves.toEqual(usage)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/v1/usage/dashboard/api-keys-usage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ api_key_ids: [3, 9] }),
        credentials: 'include',
      }),
    )
  })

  it('creates an OmniMuse API key when no active key exists', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [] } }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { id: 3, key: 'sk-new', name: 'OmniMuse', status: 'active' },
      }))

    await expect(ensureSub2ApiImageKey()).resolves.toBe('sk-new')
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://auth.example.com/api/v1/keys',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'OmniMuse' }),
        credentials: 'include',
      }),
    )
  })

  it('refreshes an expired access token before loading API keys', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          access_token: 'expired-token',
          refresh_token: 'refresh-token',
          expires_in: 1,
          user: { id: 7, email: 'user@example.com' },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 401, message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          access_token: 'renewed-token',
          refresh_token: 'renewed-refresh-token',
          expires_in: 3600,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { items: [{ id: 2, key: 'sk-active', name: 'image', status: 'active' }] },
      }))

    await loginSub2Api({ email: 'user@example.com', password: 'password' }, { remember: false })
    const result = await listSub2ApiKeys()

    expect(result.items?.[0]?.key).toBe('sk-active')
    const retryHeaders = new Headers((fetchMock.mock.calls[3]?.[1] as RequestInit).headers)
    expect(retryHeaders.get('Authorization')).toBe('Bearer renewed-token')
  })

  it('refreshes an expired access token before retrying the current-user request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          access_token: 'expired-token',
          refresh_token: 'refresh-token',
          expires_in: 1,
          user: { id: 7, email: 'user@example.com' },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 401, message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          access_token: 'renewed-token',
          refresh_token: 'renewed-refresh-token',
          expires_in: 3600,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { id: 7, email: 'user@example.com' },
      }))

    await loginSub2Api({ email: 'user@example.com', password: 'password' }, { remember: false })
    const user = await getCurrentSub2ApiUser()

    expect(user.email).toBe('user@example.com')
    expect(getSub2ApiSession()?.accessToken).toBe('renewed-token')
    expect(window.localStorage.getItem('sub2api_access_token')).toBeNull()
    expect(window.sessionStorage.getItem('sub2api_access_token')).toBe('renewed-token')
    const retryHeaders = new Headers((fetchMock.mock.calls[3]?.[1] as RequestInit).headers)
    expect(retryHeaders.get('Authorization')).toBe('Bearer renewed-token')
  })

  it('reuses an existing active image API key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      data: {
        items: [
          { id: 1, key: 'sk-inactive', name: 'old', status: 'inactive' },
          { id: 2, key: 'sk-active', name: 'current', status: 'active' },
        ],
      },
    }))

    await expect(ensureSub2ApiImageKey()).resolves.toBe('sk-active')
  })

  it('clears the local session even when remote logout fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          user: { id: 7, email: 'user@example.com' },
        },
      }))
      .mockRejectedValueOnce(new Error('offline'))

    await loginSub2Api({ email: 'user@example.com', password: 'password' })
    await expect(logoutSub2Api()).rejects.toThrow('无法连接 Sub2API 后台')
    expect(getSub2ApiSession()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
