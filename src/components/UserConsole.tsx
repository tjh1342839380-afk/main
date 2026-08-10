import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { listSub2ApiKeys, type Sub2ApiApiKey, type Sub2ApiUser } from '../lib/sub2apiAuth'
import { ChartBarIcon, CheckIcon, ChevronLeftIcon, CodeIcon, LayoutDashboardIcon, LogOutIcon, RefreshIcon, SettingsIcon, UserIcon } from './icons'
import UserDashboardPanel from './UserDashboardPanel'
import UserProfilePanel from './UserProfilePanel'

type ConsoleSection = 'overview' | 'dashboard' | 'profile'

interface UserConsoleProps {
    user: Sub2ApiUser
    onUserChange: (user: Sub2ApiUser) => void
    onClose: () => void
    onLogout: () => void
}

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
    }, [activeSection])

    useCloseOnEscape(!showSettings, onClose)
    usePreventBackgroundScroll(!showSettings, scrollRef)

    const activeKeys = keys.filter((item) => item.status === 'active')
    const roleLabel = user.role === 'admin' ? '管理员' : '用户'
    const statusLabel = user.status === 'disabled' ? '已停用' : '正常'

    return (
        <div data-no-drag-select className="fixed inset-0 z-[60] flex h-[100dvh] flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
            <header className="safe-area-top shrink-0 border-b border-gray-200/80 bg-white/95 backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-950/95">
                <div className="safe-area-x mx-auto flex h-16 max-w-6xl items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
                            aria-label="返回创作空间"
                        >
                            <ChevronLeftIcon className="h-5 w-5" />
                        </button>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">GPT Image 2 For TJH</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">账户控制台</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                        aria-label="退出登录"
                    >
                        <LogOutIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">退出登录</span>
                    </button>
                </div>
            </header>

            <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="safe-area-x mx-auto grid max-w-6xl gap-8 py-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-10">
                    <aside className="lg:sticky lg:top-8 lg:self-start">
                        <div className="flex items-center gap-3 border-b border-gray-200 pb-5 dark:border-white/[0.08]">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-blue-500 text-white shadow-sm">
                                {user.avatar_url ? (
                                    <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <UserIcon className="h-5 w-5" />
                                )}
                            </span>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{user.username || user.email}</p>
                                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                            </div>
                        </div>
                        <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1" aria-label="控制台导航">
                            <button
                                type="button"
                                onClick={() => setActiveSection('overview')}
                                className={`flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors lg:justify-start lg:px-3 ${activeSection === 'overview' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white'}`}
                                aria-current={activeSection === 'overview' ? 'page' : undefined}
                            >
                                <LayoutDashboardIcon className="h-4 w-4 shrink-0" />
                                账户概览
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveSection('dashboard')}
                                className={`flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors lg:justify-start lg:px-3 ${activeSection === 'dashboard' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white'}`}
                                aria-current={activeSection === 'dashboard' ? 'page' : undefined}
                            >
                                <ChartBarIcon className="h-4 w-4 shrink-0" />
                                仪表盘
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveSection('profile')}
                                className={`flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors lg:justify-start lg:px-3 ${activeSection === 'profile' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white'}`}
                                aria-current={activeSection === 'profile' ? 'page' : undefined}
                            >
                                <UserIcon className="h-4 w-4 shrink-0" />
                                个人资料
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowSettings(true)}
                                className="flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:justify-start lg:px-3 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
                            >
                                <SettingsIcon className="h-4 w-4 shrink-0" />
                                应用设置
                            </button>
                        </nav>
                    </aside>

                    <div className="min-w-0">
                        {activeSection === 'dashboard' ? (
                            <UserDashboardPanel user={user} onUserChange={onUserChange} />
                        ) : activeSection === 'profile' ? (
                            <UserProfilePanel
                                user={user}
                                onUserChange={onUserChange}
                                onPasswordChanged={onLogout}
                            />
                        ) : (
                            <>
                        <section className="border-b border-gray-200 pb-8 dark:border-white/[0.08]">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-950 dark:text-white">账户概览</h1>
                                </div>
                                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    已连接
                                </span>
                            </div>

                            <ol className="mt-7 grid gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-3 dark:border-white/[0.08] dark:bg-white/[0.08]">
                                {[
                                    ['账户', user.email],
                                    ['API 接入', activeKeys.length > 0 ? '配置可用' : isLoading ? '正在检查' : error ? '连接失败' : '等待配置'],
                                    ['应用设置', '可管理'],
                                ].map(([label, value], idx) => (
                                    <li key={label} className="flex min-h-20 items-center gap-3 bg-white px-4 py-3 dark:bg-gray-950">
                                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${idx === 1 && !isLoading && activeKeys.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-white/[0.08] dark:text-gray-500' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                                            <CheckIcon className="h-3.5 w-3.5" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-xs text-gray-500 dark:text-gray-400">{label}</span>
                                            <span className="mt-0.5 block truncate text-sm font-semibold">{value}</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        <section className="grid border-b border-gray-200 py-7 sm:grid-cols-3 dark:border-white/[0.08]">
                            <div className="border-b border-gray-200 py-4 sm:border-b-0 sm:border-r sm:px-5 sm:first:pl-0 dark:border-white/[0.08]">
                                <p className="text-xs text-gray-500 dark:text-gray-400">可用 API Key</p>
                                <p className="mt-2 text-xl font-semibold">{isLoading ? '-' : activeKeys.length}</p>
                            </div>
                            <div className="border-b border-gray-200 py-4 sm:border-b-0 sm:border-r sm:px-5 dark:border-white/[0.08]">
                                <p className="text-xs text-gray-500 dark:text-gray-400">账户状态</p>
                                <p className="mt-2 text-xl font-semibold">{statusLabel}</p>
                            </div>
                            <div className="py-4 sm:px-5 sm:last:pr-0">
                                <p className="text-xs text-gray-500 dark:text-gray-400">账户角色</p>
                                <p className="mt-2 text-xl font-semibold">{roleLabel}</p>
                            </div>
                        </section>

                        <section className="border-b border-gray-200 py-8 dark:border-white/[0.08]">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <CodeIcon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                                    <h2 className="text-base font-semibold">API Key</h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void loadKeys()}
                                    disabled={isLoading}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-wait disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
                                    aria-label="刷新 API Key"
                                >
                                    <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>

                            <div className="mt-4 min-h-24" aria-live="polite">
                                {isLoading ? (
                                    <div className="space-y-2">
                                        {[0, 1].map((item) => (
                                            <div key={item} className="h-16 animate-pulse rounded-lg bg-gray-200/70 dark:bg-white/[0.06]" />
                                        ))}
                                    </div>
                                ) : error ? (
                                    <div className="flex min-h-24 flex-col items-start justify-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                        <p>{error}</p>
                                        <button type="button" onClick={() => void loadKeys()} className="font-semibold hover:underline">重新加载</button>
                                    </div>
                                ) : keys.length === 0 ? (
                                    <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-white/[0.12] dark:text-gray-400">
                                        暂无 API Key
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {keys.map((item) => (
                                            <div key={item.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold">{item.name || '未命名 Key'}</p>
                                                    <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">{typeof item.key === 'string' && item.key ? `...${item.key.slice(-4)}` : '未返回 Key'}</p>
                                                </div>
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.status === 'active' ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${item.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                                    {item.status === 'active' ? '可用' : '已停用'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                                    <SettingsIcon className="h-5 w-5" />
                                </span>
                                <h2 className="text-base font-semibold">应用设置</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowSettings(true)}
                                className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                            >
                                打开设置
                            </button>
                        </section>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
