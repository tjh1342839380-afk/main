import { useCallback, useEffect, useState } from 'react'
import {
  clearSub2ApiSession,
  getCurrentSub2ApiUser,
  getSub2ApiSession,
  loginSub2Api,
  loginSub2ApiTwoFactor,
  logoutSub2Api,
  refreshSub2ApiSession,
  registerSub2Api,
  type Sub2ApiLoginInput,
  type Sub2ApiRegisterInput,
  type Sub2ApiSession,
  type Sub2ApiTwoFactorInput,
} from '../lib/sub2apiAuth'

const AUTH_CHANGE_EVENT = 'omni-muse:sub2api-auth-change'

function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}

export function useSub2ApiAuth() {
  const [session, setSession] = useState<Sub2ApiSession | null>(() => getSub2ApiSession())
  const [isRestoring, setIsRestoring] = useState(() => Boolean(getSub2ApiSession()))

  useEffect(() => {
    const syncSession = () => setSession(getSub2ApiSession())
    window.addEventListener(AUTH_CHANGE_EVENT, syncSession)
    window.addEventListener('storage', syncSession)
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncSession)
      window.removeEventListener('storage', syncSession)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setIsRestoring(false)
      return
    }

    let cancelled = false
    setIsRestoring(true)
    void getCurrentSub2ApiUser()
      .then((user) => {
        if (!cancelled) setSession(getSub2ApiSession() ?? { ...session, user })
      })
      .catch((error) => {
        const status = (error as { status?: number }).status
        if (!cancelled && (status === 401 || status === 403)) {
          clearSub2ApiSession()
          setSession(null)
        }
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false)
      })

    return () => {
      cancelled = true
    }
  }, [session?.accessToken])

  const login = useCallback(async (input: Sub2ApiLoginInput, remember = true) => {
    const response = await loginSub2Api(input, { remember })
    if (!response.requires_2fa) {
      setSession(getSub2ApiSession())
      notifyAuthChange()
    }
    return response
  }, [])

  const register = useCallback(async (input: Sub2ApiRegisterInput, remember = true) => {
    const response = await registerSub2Api(input, { remember })
    setSession(getSub2ApiSession())
    notifyAuthChange()
    return response
  }, [])

  const login2FA = useCallback(async (input: Sub2ApiTwoFactorInput, remember = true) => {
    const response = await loginSub2ApiTwoFactor(input, { remember })
    setSession(getSub2ApiSession())
    notifyAuthChange()
    return response
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutSub2Api()
    } finally {
      setSession(null)
      notifyAuthChange()
    }
  }, [])

  const refresh = useCallback(async () => {
    const response = await refreshSub2ApiSession()
    setSession(getSub2ApiSession())
    notifyAuthChange()
    return response
  }, [])

  const sync = useCallback(() => {
    setSession(getSub2ApiSession())
    notifyAuthChange()
  }, [])

  return {
    session,
    user: session?.user ?? null,
    isAuthenticated: Boolean(session?.accessToken),
    isRestoring,
    login,
    register,
    login2FA,
    logout,
    refresh,
    sync,
  }
}
