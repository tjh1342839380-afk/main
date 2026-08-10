import { useEffect, useState, type FormEvent } from 'react'
import { useSub2ApiAuth } from '../hooks/useSub2ApiAuth'
import {
  getSub2ApiPublicSettings,
  requestSub2ApiPasswordReset,
  sendSub2ApiVerifyCode,
  type Sub2ApiPublicSettings,
} from '../lib/sub2apiAuth'
import { CheckIcon, CloseIcon } from './icons'

export type LandingAuthMode = 'login' | 'register'

interface LandingAuthModalProps {
  mode: LandingAuthMode | null
  onModeChange: (mode: LandingAuthMode) => void
  onClose: () => void
}

export default function LandingAuthModal({ mode, onModeChange, onClose }: LandingAuthModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [twoFactorToken, setTwoFactorToken] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [verifyCodeCountdown, setVerifyCodeCountdown] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
  const [publicSettings, setPublicSettings] = useState<Sub2ApiPublicSettings | null>(null)
  const { login, login2FA, register } = useSub2ApiAuth()

  useEffect(() => {
    if (!mode) return

    setErrorMessage('')
    setNoticeMessage('')

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, onClose])

  useEffect(() => {
    if (!mode) return

    let active = true
    void getSub2ApiPublicSettings().then((settings) => {
      if (active) setPublicSettings(settings)
    }).catch((error) => {
      console.warn('读取 Sub2API 公开设置失败', error)
    })

    return () => {
      active = false
    }
  }, [mode])

  useEffect(() => {
    if (verifyCodeCountdown <= 0) return
    const timer = window.setInterval(() => {
      setVerifyCodeCountdown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [verifyCodeCountdown > 0])

  if (!mode) return null

  const isLogin = mode === 'login'
  const requiresTwoFactor = Boolean(twoFactorToken)
  const emailVerifyEnabled = publicSettings?.email_verify_enabled ?? true
  const invitationCodeEnabled = publicSettings?.invitation_code_enabled ?? false

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password) {
      setErrorMessage('请输入邮箱和密码。')
      return
    }
    if (!isLogin && password.length < 6) {
      setErrorMessage('注册密码至少需要 6 位。')
      return
    }
    if (!isLogin && publicSettings?.registration_enabled === false) {
      setErrorMessage('后台当前未开放注册。')
      return
    }
    if (!isLogin && emailVerifyEnabled && verifyCode.trim().length !== 6) {
      setErrorMessage('请输入邮件中的 6 位验证码。')
      return
    }
    if (requiresTwoFactor && twoFactorCode.trim().length < 6) {
      setErrorMessage('请输入 6 位二次验证码。')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setNoticeMessage('')
    try {
      const response = requiresTwoFactor
        ? await login2FA({ temp_token: twoFactorToken, totp_code: twoFactorCode.trim() }, remember)
        : isLogin
        ? await login({ email: normalizedEmail, password }, remember)
        : await register({
            email: normalizedEmail,
            password,
            verify_code: verifyCode.trim() || undefined,
            invitation_code: invitationCode.trim() || undefined,
          }, remember)

      if (response.requires_2fa) {
        if (!response.temp_token) {
          setErrorMessage('后台要求二次验证，但没有返回验证会话，请重新登录。')
          return
        }
        setTwoFactorToken(response.temp_token)
        setNoticeMessage('请输入验证器中的 6 位验证码。')
        return
      }

      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '认证失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setErrorMessage('请先输入邮箱地址。')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setNoticeMessage('')
    try {
      const response = await requestSub2ApiPasswordReset(normalizedEmail)
      setNoticeMessage(response.message || '如果邮箱存在，后台会发送密码重置邮件。')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '密码重置请求失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSendVerifyCode = async () => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setErrorMessage('请先输入邮箱地址。')
      return
    }
    if (isSendingCode || verifyCodeCountdown > 0) return

    setIsSendingCode(true)
    setErrorMessage('')
    setNoticeMessage('')
    try {
      const response = await sendSub2ApiVerifyCode(normalizedEmail)
      setVerifyCodeCountdown(Math.max(1, response.countdown ?? 60))
      setNoticeMessage('发送请求已提交。邮件由后台异步投递，请检查收件箱和垃圾邮件。')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '验证码发送失败，请稍后重试。')
    } finally {
      setIsSendingCode(false)
    }
  }

  return (
    <div className="landing-auth-layer" role="presentation" onMouseDown={onClose}>
      <form
        className="landing-auth-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <button
          type="button"
          className="landing-auth-close"
          onClick={onClose}
          aria-label="关闭"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <div className="landing-auth-emblem">
          <img src="/brand/gpt-img-2-for-tjh-icon.png" alt="" aria-hidden="true" />
        </div>

        <div className="landing-auth-title">
          <h2>登录 / 注册</h2>
          <p>登录以保存您的配置与创作记录</p>
        </div>

        <div className="landing-auth-tabs" role="tablist" aria-label="登录注册切换">
          <button
            type="button"
            role="tab"
            aria-selected={isLogin}
            className={isLogin ? 'is-active' : ''}
            onClick={() => onModeChange('login')}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isLogin}
            className={!isLogin ? 'is-active' : ''}
            onClick={() => onModeChange('register')}
          >
            注册
          </button>
        </div>

        <label className="landing-auth-field">
          <span>邮箱</span>
          <div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" strokeWidth="2" />
              <path d="M3 7l9 6 9-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="请输入邮箱地址"
              autoComplete="email"
            />
          </div>
        </label>

        {requiresTwoFactor && (
          <label className="landing-auth-field">
            <span>二次验证码</span>
            <div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="3" strokeWidth="2" />
                <path d="M8 9h.01M12 9h.01M16 9h.01M8 14h.01M12 14h.01M16 14h.01" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <input
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="请输入 6 位验证码"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
          </label>
        )}

        {!isLogin && (
          <>
            {emailVerifyEnabled && (
              <label className="landing-auth-field">
                <span>邮箱验证码</span>
                <div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M5 5h14v14H5z" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M8 9h8M8 13h5" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <input
                    value={verifyCode}
                    onChange={(event) => setVerifyCode(event.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="请输入邮件中的 6 位验证码"
                    autoComplete="one-time-code"
                    required
                  />
                  <button
                    type="button"
                    className="landing-auth-inline-action"
                    onClick={() => void handleSendVerifyCode()}
                    disabled={isSendingCode || verifyCodeCountdown > 0}
                  >
                    {isSendingCode ? '发送中' : verifyCodeCountdown > 0 ? `${verifyCodeCountdown}s` : '发送'}
                  </button>
                </div>
              </label>
            )}

            {invitationCodeEnabled && (
              <label className="landing-auth-field">
                <span>邀请码</span>
                <div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M4 7h16v10H4z" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M8 7V5h8v2M8 12h8" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <input
                    value={invitationCode}
                    onChange={(event) => setInvitationCode(event.target.value)}
                    placeholder="请输入邀请码"
                    autoComplete="off"
                  />
                </div>
              </label>
            )}
          </>
        )}

        {errorMessage && (
          <p className="landing-auth-error" role="alert">
            {errorMessage}
          </p>
        )}

        {noticeMessage && (
          <p className="landing-auth-notice" role="status">
            {noticeMessage}
          </p>
        )}

        <label className="landing-auth-field">
          <span>密码</span>
          <div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" strokeWidth="2" />
              <path d="M8 10V7a4 4 0 018 0v3" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? 'text' : 'password'}
              placeholder="请输入密码"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              className="landing-auth-eye"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </label>

        <div className="landing-auth-options">
          <button
            type="button"
            className="landing-auth-checkbox"
            onClick={() => setRemember((value) => !value)}
            aria-pressed={remember}
          >
            <span>{remember && <CheckIcon className="h-3 w-3" />}</span>
            记住我
          </button>
          {isLogin && publicSettings?.password_reset_enabled !== false ? (
            <button type="button" onClick={() => void handleForgotPassword()} disabled={isSubmitting}>忘记密码?</button>
          ) : <span />}
        </div>

        <button type="submit" className="landing-auth-submit" disabled={isSubmitting}>
          {isSubmitting ? '请求中…' : requiresTwoFactor ? '验证并登录' : isLogin ? '登录' : '创建账号'}
        </button>

        <button
          type="button"
          className="landing-auth-secondary"
          onClick={() => onModeChange(isLogin ? 'register' : 'login')}
        >
          {isLogin ? '还没有账号？创建账号' : '已有账号？去登录'}
        </button>

        <div className="landing-auth-safe">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M12 3l7 3v5c0 4.5-2.8 8.4-7 10-4.2-1.6-7-5.5-7-10V6l7-3z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 12l2 2 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          登录凭证与 API Key 分开使用
        </div>
      </form>
    </div>
  )
}
