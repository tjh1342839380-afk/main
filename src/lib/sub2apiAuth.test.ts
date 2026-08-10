import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSub2ApiSession,
  ensureSub2ApiImageKey,
  getCurrentSub2ApiUser,
  getSub2ApiConsoleUrl,
  getSub2ApiPublicSettings,
  getSub2ApiSession,
  loginSub2Api,
  logoutSub2Api,
  requestSub2ApiPasswordReset,
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
  it('derives the Sub2API console URL from the auth endpoint', () => {
    expect(getSub2ApiConsoleUrl()).toBe('https://auth.example.com')
  })

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
