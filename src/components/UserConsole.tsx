import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { APP_SHORT_NAME } from '../lib/brand'
import { listSub2ApiKeys, type Sub2ApiApiKey, type Sub2ApiUser } from '../lib/sub2apiAuth'
import { ChartBarIcon, ChevronLeftIcon, KeyIcon, LayoutDashboardIcon, LogOutIcon, SettingsIcon, UserIcon } from './icons'
import UserApiKeysPanel from './UserApiKeysPanel'
import UserDashboardPanel from './UserDashboardPanel'
import UserProfilePanel from './UserProfilePanel'

type ConsoleSection = 'overview' | 'dashboard' | 'apiKeys' | 'profile'

interface UserConsoleProps {
    user: Sub2ApiUser
    onUserChange: (user: Sub2ApiUser) => void
    onClose: () => void
    onLogout: () => void
}

const CONSOLE_SECTIONS = [
    { id: 'overview', label: '账户概览', compactLabel: '概览', icon: LayoutDashboardIcon },
    { id: 'dashboard', label: '用量仪表盘', compactLabel: '数据', icon: ChartBarIcon },
    { id: 'apiKeys', label: 'API 密钥', compactLabel: '密钥', icon: KeyIcon },
    { id: 'profile', label: '个人资料', compactLabel: '资料', icon: UserIcon },
] as const

export default function UserConsole({ user, onUserChange, onClose, onLogout }: UserConsoleProps) {
    const setShowSettings = useStore((s) => s.setShowSettings)
    const showSettings = useStore((s) => s.showSettings)
    const scrollRef = useRef<HTMLElement>(null)
    const [keys, setKeys] = useState<Sub2ApiApiKey[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [activeSection, setActiveSection] = useState<ConsoleSection>('overview')

    const loadKeys = useCallback(async () => {
        setIsLoading(true)
        setError('')
        try {
            const result = await listSub2ApiKeys()
            setKeys(Array.isArray(result.items) ? result.items : [])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'API Key 加载失败。')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadKeys()
    }, [loadKeys])

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 })
        scrollRef.current?.focus({ preventScroll: true })
    }, [activeSection])

    useCloseOnEscape(!showSettings, onClose)
    usePreventBackgroundScroll(!showSettings, scrollRef)

    const activeKeys = keys.filter((item) => item.status === 'active')
    const roleLabel = user.role === 'admin' ? '管理员' : '用户'
    const statusLabel = user.status === 'disabled' ? '已停用' : '正常'
    const apiStatusLabel = isLoading ? '检测中' : error ? '连接异常' : activeKeys.length > 0 ? '已接入' : '待配置'
    const serviceStatusLabel = user.status === 'disabled' ? '不可用' : isLoading ? '检测中' : error ? '连接异常' : '正常'
    const serviceStatusTextClass = user.status === 'disabled' || error ? 'text-rose-300' : isLoading ? 'text-amber-300' : 'console-success-text'
    const serviceStatusDotClass = user.status === 'disabled' || error
        ? 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.55)]'
        : isLoading
            ? 'animate-pulse bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.45)]'
            : 'console-status-dot'

    return (
        <div data-user-console data-no-drag-select className="console-shell fixed inset-0 z-[60] flex h-[100dvh] flex-col overflow-hidden lg:flex-row">
            <a
                href="#console-content"
                onClick={(event) => {
                    event.preventDefault()
                    scrollRef.current?.focus({ preventScroll: true })
                    scrollRef.current?.scrollTo({ top: 0 })
                }}
                className="console-skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
                跳转到主要内容
            </a>

            <aside className="console-rail safe-area-top relative z-20 flex shrink-0 flex-col lg:h-full lg:w-64 xl:w-72">
                <div className="console-rail-header safe-area-x flex h-16 shrink-0 items-center gap-3 lg:h-[4.75rem]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="console-icon-button lg:hidden"
                        aria-label="返回创作空间"
                        title="返回创作空间"
                    >
                        <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="console-brand-mark">
                            <img src="/brand/omni-muse-icon.png" alt="" aria-hidden="true" className="h-full w-full object-cover" />
                        </span>
                        <div className="min-w-0 leading-tight">
                            <p className="truncate text-sm font-bold text-white">{APP_SHORT_NAME}</p>
                            <p className="console-muted mt-1 truncate text-xs">账户控制台</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="console-icon-button console-icon-button--danger lg:hidden"
                        aria-label="退出登录"
                        title="退出登录"
                    >
                        <LogOutIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="console-identity mx-5 hidden py-5 lg:flex lg:items-center lg:gap-3">
                    <span className="console-avatar relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden font-semibold text-white">
                        {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <UserIcon className="h-5 w-5" />
                        )}
                        {user.status !== 'disabled' && <span className="console-avatar-status" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white" title={user.username || user.email}>{user.username || user.email}</p>
                        <p className="console-muted mt-1 truncate text-xs" title={user.email}>{user.email}</p>
                    </div>
                </div>

                <nav className="console-nav safe-area-x flex shrink-0 gap-2 overflow-x-auto py-2 lg:mt-5 lg:block lg:space-y-1 lg:overflow-visible lg:py-0" aria-label="控制台导航">
                    <p className="console-nav-label mb-2 hidden px-3 text-xs font-semibold lg:block">工作区</p>
                    {CONSOLE_SECTIONS.map((item) => {
                        const Icon = item.icon
                        const isActive = activeSection === item.id
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveSection(item.id)}
                                className={`console-nav-item ${isActive ? 'is-active' : ''}`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                <span className="console-nav-icon"><Icon className="h-4 w-4" /></span>
                                <span className="lg:hidden">{item.compactLabel}</span>
                                <span className="hidden lg:inline">{item.label}</span>
                            </button>
                        )
                    })}
                    <button
                        type="button"
                        onClick={() => setShowSettings(true)}
                        className="console-nav-item"
                    >
                        <span className="console-nav-icon"><SettingsIcon className="h-4 w-4" /></span>
                        <span className="lg:hidden">设置</span>
                        <span className="hidden lg:inline">应用设置</span>
                    </button>
                </nav>

                <div className="console-rail-footer mt-auto hidden p-4 lg:block">
                    <div className="console-runtime mb-3 flex items-center justify-between px-3 text-xs">
                        <span className="flex items-center gap-2"><span className={`h-[7px] w-[7px] shrink-0 rounded-full ${serviceStatusDotClass}`} />服务连接</span>
                        <span className={serviceStatusTextClass} aria-live="polite">{serviceStatusLabel}</span>
                    </div>
                    <button type="button" onClick={onClose} className="console-rail-action">
                        <ChevronLeftIcon className="h-4 w-4" />
                        返回创作空间
                    </button>
                    <button type="button" onClick={onLogout} className="console-rail-action console-rail-action--danger">
                        <LogOutIcon className="h-4 w-4" />
                        退出登录
                    </button>
                </div>
            </aside>

            <main id="console-content" ref={scrollRef} tabIndex={-1} className="console-main min-h-0 min-w-0 flex-1 select-text overflow-y-auto overscroll-contain outline-none">
                <div className="safe-area-x relative z-[1] mx-auto w-full max-w-7xl pb-[calc(2rem+var(--safe-area-bottom))] pt-6 sm:pt-8 lg:px-8 lg:pb-10 lg:pt-10">
                    {activeSection === 'dashboard' ? (
                        <UserDashboardPanel user={user} onUserChange={onUserChange} />
                    ) : activeSection === 'apiKeys' ? (
                        <UserApiKeysPanel onKeysChanged={loadKeys} />
                    ) : activeSection === 'profile' ? (
                        <UserProfilePanel
                            user={user}
                            onUserChange={onUserChange}
                            onPasswordChanged={onLogout}
                        />
                    ) : (
                        <div className="console-page space-y-6">
                            <header className="console-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <h1 className="console-page-title">账户概览</h1>
                                    <p className="console-page-description mt-2 truncate text-sm" title={user.email}>{user.email}</p>
                                </div>
                                <span className={`console-status-chip ${user.status === 'disabled' ? 'is-danger' : 'is-success'}`}>
                                    <span className="console-status-chip-dot" />
                                    {statusLabel}
                                </span>
                            </header>

                            <section className="console-stagger grid gap-3 sm:grid-cols-3" aria-label="账户状态">
                                {[
                                    {
                                        label: '可用 API Key',
                                        value: isLoading ? '-' : activeKeys.length.toLocaleString('zh-CN'),
                                        detail: apiStatusLabel,
                                        tone: error ? 'danger' : activeKeys.length > 0 ? 'accent' : 'muted',
                                    },
                                    {
                                        label: '账户状态',
                                        value: statusLabel,
                                        detail: user.status === 'disabled' ? '访问受限' : '服务可用',
                                        tone: user.status === 'disabled' ? 'danger' : 'success',
                                    },
                                    {
                                        label: '账户角色',
                                        value: roleLabel,
                                        detail: user.role === 'admin' ? '管理权限' : '标准权限',
                                        tone: 'warning',
                                    },
                                ].map((item) => (
                                    <article key={item.label} className={`console-metric console-tone-${item.tone}`}>
                                        <span className="console-metric-signal" aria-hidden="true" />
                                        <p className="console-metric-label">{item.label}</p>
                                        <p className="console-metric-value mt-3 tabular-nums">{item.value}</p>
                                        <p className="console-metric-detail mt-1">{item.detail}</p>
                                    </article>
                                ))}
                            </section>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
