import { useEffect, useState } from 'react'
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
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!mode) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, onClose])

  if (!mode) return null

  const isLogin = mode === 'login'

  return (
    <div className="landing-auth-layer" role="presentation" onMouseDown={onClose}>
      <form
        className="landing-auth-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => event.preventDefault()}
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
          <button type="button">忘记密码?</button>
        </div>

        <button type="submit" className="landing-auth-submit">
          {isLogin ? '登录' : '创建账号'}
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
          API Key 加密保存，不展示明文
        </div>
      </form>
    </div>
  )
}
