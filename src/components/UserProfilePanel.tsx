import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
    changeSub2ApiPassword,
    getSub2ApiProfile,
    updateSub2ApiProfile,
    type Sub2ApiAuthProvider,
    type Sub2ApiUser,
} from '../lib/sub2apiAuth'
import { prepareAvatarImage } from '../lib/avatarImage'
import { CheckIcon, ImageIcon, LinkIcon, RefreshIcon, TrashIcon, UserIcon } from './icons'

interface UserProfilePanelProps {
    user: Sub2ApiUser
    onUserChange: (user: Sub2ApiUser) => void
    onPasswordChanged: () => void
}

type Notice = {
    tone: 'success' | 'error'
    text: string
} | null

const AUTH_PROVIDER_LABELS: Record<Sub2ApiAuthProvider, string> = {
    email: '邮箱',
    linuxdo: 'LinuxDo',
    oidc: '企业账号',
    wechat: '微信',
    github: 'GitHub',
    google: 'Google',
    dingtalk: '钉钉',
}

const AUTH_PROVIDERS = Object.keys(AUTH_PROVIDER_LABELS) as Sub2ApiAuthProvider[]

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback
}

function formatBalance(value: number | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
    return `$${value.toFixed(2)}`
}

function formatMemberSince(value: string | undefined) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short' }).format(date)
}

function getFlatBindingStatus(user: Sub2ApiUser, provider: Sub2ApiAuthProvider) {
    if (provider === 'email') return user.email_bound
    if (provider === 'linuxdo') return user.linuxdo_bound
    if (provider === 'oidc') return user.oidc_bound
    if (provider === 'wechat') return user.wechat_bound
    if (provider === 'dingtalk') return user.dingtalk_bound
    return undefined
}

function getAuthBinding(user: Sub2ApiUser, provider: Sub2ApiAuthProvider) {
    const value = user.auth_bindings?.[provider]
        ?? user.identity_bindings?.[provider]
        ?? user.identities?.[provider]
    const details = value && typeof value === 'object' ? value : null
    const flatStatus = getFlatBindingStatus(user, provider)
    const bound = typeof value === 'boolean'
        ? value
        : details?.bound ?? flatStatus ?? (provider === 'email' && Boolean(user.email))
    const detail = provider === 'email'
        ? user.email || '未设置邮箱'
        : details?.display_name || details?.subject_hint || (bound ? '已连接账户' : '尚未绑定')

    return { provider, bound, detail }
}

function hasAuthBinding(user: Sub2ApiUser, provider: Sub2ApiAuthProvider) {
    if (provider === 'email') return true
    if (getFlatBindingStatus(user, provider) !== undefined) return true
    return user.auth_bindings?.[provider] !== undefined
        || user.identity_bindings?.[provider] !== undefined
        || user.identities?.[provider] !== undefined
}

function NoticeMessage({ notice }: { notice: Notice }) {
    if (!notice) return null

    return (
        <div
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${notice.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200'
            }`}
        >
            {notice.tone === 'success' && <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{notice.text}</span>
        </div>
    )
}

export default function UserProfilePanel({ user, onUserChange, onPasswordChanged }: UserProfilePanelProps) {
    const [profile, setProfile] = useState(user)
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [username, setUsername] = useState(user.username ?? '')
    const [usernameSaving, setUsernameSaving] = useState(false)
    const [usernameNotice, setUsernameNotice] = useState<Notice>(null)
    const [avatarDraft, setAvatarDraft] = useState('')
    const [avatarProcessing, setAvatarProcessing] = useState(false)
    const [avatarSaving, setAvatarSaving] = useState(false)
    const [avatarNotice, setAvatarNotice] = useState<Notice>(null)
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordSaving, setPasswordSaving] = useState(false)
    const [passwordNotice, setPasswordNotice] = useState<Notice>(null)
    const passwordChangedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const loadProfile = useCallback(async () => {
        setIsLoading(true)
        setLoadError('')
        try {
            const next = await getSub2ApiProfile()
            setProfile(next)
            setUsername(next.username ?? '')
            onUserChange(next)
        } catch (error) {
            setLoadError(getErrorMessage(error, '个人资料加载失败'))
        } finally {
            setIsLoading(false)
        }
    }, [onUserChange])

    useEffect(() => {
        void loadProfile()
    }, [loadProfile])

    useEffect(() => () => {
        if (passwordChangedTimer.current) clearTimeout(passwordChangedTimer.current)
    }, [])

    const displayName = profile.username?.trim() || profile.email || '用户'
    const avatarUrl = avatarDraft || profile.avatar_url?.trim() || ''
    const avatarInitial = displayName.charAt(0).toUpperCase() || 'U'
    const roleLabel = profile.role === 'admin' ? '管理员' : profile.role === 'user' || !profile.role ? '用户' : profile.role
    const statusLabel = profile.status === 'disabled' ? '已停用' : profile.status === 'active' || !profile.status ? '正常' : profile.status
    const authBindings = AUTH_PROVIDERS
        .filter((provider) => hasAuthBinding(profile, provider))
        .map((provider) => getAuthBinding(profile, provider))

    const applyUpdatedProfile = (updated: Sub2ApiUser) => {
        const next = { ...profile, ...updated }
        setProfile(next)
        setUsername(next.username ?? '')
        onUserChange(next)
    }

    const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget
        const file = input.files?.[0]
        input.value = ''
        if (!file) return

        setAvatarProcessing(true)
        setAvatarNotice(null)
        try {
            setAvatarDraft(await prepareAvatarImage(file))
            setAvatarNotice({ tone: 'success', text: '头像已准备好，保存后生效' })
        } catch (error) {
            setAvatarNotice({ tone: 'error', text: getErrorMessage(error, '头像处理失败') })
        } finally {
            setAvatarProcessing(false)
        }
    }

    const handleAvatarSave = async () => {
        if (!avatarDraft) return
        setAvatarSaving(true)
        setAvatarNotice(null)
        try {
            const updated = await updateSub2ApiProfile({ avatar_url: avatarDraft })
            applyUpdatedProfile(updated)
            setAvatarDraft('')
            setAvatarNotice({ tone: 'success', text: '头像已更新' })
        } catch (error) {
            setAvatarNotice({ tone: 'error', text: getErrorMessage(error, '头像保存失败') })
        } finally {
            setAvatarSaving(false)
        }
    }

    const handleAvatarDelete = async () => {
        if (!avatarDraft && !profile.avatar_url) {
            setAvatarNotice({ tone: 'error', text: '当前没有可删除的头像' })
            return
        }

        setAvatarSaving(true)
        setAvatarNotice(null)
        try {
            const updated = await updateSub2ApiProfile({ avatar_url: '' })
            applyUpdatedProfile({ ...updated, avatar_url: '' })
            setAvatarDraft('')
            setAvatarNotice({ tone: 'success', text: '头像已删除' })
        } catch (error) {
            setAvatarNotice({ tone: 'error', text: getErrorMessage(error, '头像删除失败') })
        } finally {
            setAvatarSaving(false)
        }
    }

    const handleUsernameSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const value = username.trim()
        if (!value) {
            setUsernameNotice({ tone: 'error', text: '用户名不能为空' })
            return
        }

        setUsernameSaving(true)
        setUsernameNotice(null)
        try {
            const updated = await updateSub2ApiProfile({ username: value })
            applyUpdatedProfile(updated)
            setUsernameNotice({ tone: 'success', text: '用户名已更新' })
        } catch (error) {
            setUsernameNotice({ tone: 'error', text: getErrorMessage(error, '用户名更新失败') })
        } finally {
            setUsernameSaving(false)
        }
    }

    const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!oldPassword) {
            setPasswordNotice({ tone: 'error', text: '请输入当前密码' })
            return
        }
        if (newPassword.length < 8) {
            setPasswordNotice({ tone: 'error', text: '新密码至少需要 8 个字符' })
            return
        }
        if (newPassword !== confirmPassword) {
            setPasswordNotice({ tone: 'error', text: '两次输入的新密码不一致' })
            return
        }

        setPasswordSaving(true)
        setPasswordNotice(null)
        try {
            await changeSub2ApiPassword({ old_password: oldPassword, new_password: newPassword })
            setOldPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setPasswordNotice({ tone: 'success', text: '密码已修改，请重新登录' })
            passwordChangedTimer.current = setTimeout(onPasswordChanged, 800)
        } catch (error) {
            setPasswordNotice({ tone: 'error', text: getErrorMessage(error, '密码修改失败') })
        } finally {
            setPasswordSaving(false)
        }
    }

    return (
        <div className="min-w-0">
            <section className="border-b border-gray-200 pb-8 dark:border-white/[0.08]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-950 dark:text-white">个人资料</h1>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadProfile()}
                        disabled={isLoading}
                        className="flex h-9 w-fit items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-wait disabled:opacity-60 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
                    >
                        <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        {isLoading ? '正在同步' : '刷新资料'}
                    </button>
                </div>

                {loadError && (
                    <div role="alert" className="mt-5 flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                        <span>{loadError}</span>
                        <button type="button" onClick={() => void loadProfile()} className="shrink-0 font-semibold hover:underline">重新加载</button>
                    </div>
                )}

                <div className="mt-6 border-y border-gray-200 py-6 dark:border-white/[0.08]">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-blue-500 text-2xl font-bold text-white shadow-sm">
                            {avatarUrl ? <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" /> : avatarInitial}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="max-w-full truncate text-xl font-semibold text-gray-950 dark:text-white">{displayName}</h2>
                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">{roleLabel}</span>
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${profile.status === 'disabled'
                                    ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${profile.status === 'disabled' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                    {statusLabel}
                                </span>
                            </div>
                            <p className="mt-2 truncate text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
                            <dl className="mt-5 grid border-y border-gray-200 sm:grid-cols-3 dark:border-white/[0.08]">
                                <div className="border-b border-gray-200 px-4 py-3 sm:border-r sm:border-b-0 dark:border-white/[0.08]">
                                    <dt className="text-xs text-gray-500 dark:text-gray-400">账户余额</dt>
                                    <dd className="mt-1 text-base font-semibold">{formatBalance(profile.balance)}</dd>
                                </div>
                                <div className="border-b border-gray-200 px-4 py-3 sm:border-r sm:border-b-0 dark:border-white/[0.08]">
                                    <dt className="text-xs text-gray-500 dark:text-gray-400">并发额度</dt>
                                    <dd className="mt-1 text-base font-semibold">{profile.concurrency ?? '-'}</dd>
                                </div>
                                <div className="px-4 py-3">
                                    <dt className="text-xs text-gray-500 dark:text-gray-400">注册时间</dt>
                                    <dd className="mt-1 text-base font-semibold">{formatMemberSince(profile.created_at)}</dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-b border-gray-200 py-8 dark:border-white/[0.08]">
                <div className="mb-6">
                    <h2 className="text-base font-semibold text-gray-950 dark:text-white">基本资料</h2>
                </div>
                <div className="grid gap-8 md:grid-cols-2 md:gap-0">
                    <div className="border-b border-gray-200 pb-8 md:border-b-0 md:border-r md:pb-0 md:pr-8 dark:border-white/[0.08]">
                        <div className="flex items-center gap-2">
                            <ImageIcon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                            <h3 className="text-sm font-semibold">头像</h3>
                        </div>
                        <div className="mt-4 flex items-center gap-4">
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-blue-500 text-xl font-bold text-white">
                                {avatarUrl ? <img src={avatarUrl} alt="头像预览" className="h-full w-full object-cover" /> : avatarInitial}
                            </span>
                            <div className="flex min-w-0 flex-wrap gap-2">
                                <label className={`flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/[0.12] dark:text-gray-200 dark:hover:bg-white/[0.06] ${avatarProcessing || avatarSaving ? 'pointer-events-none opacity-50' : ''}`}>
                                    <ImageIcon className="h-4 w-4" />
                                    {avatarProcessing ? '处理中' : '选择图片'}
                                    <input type="file" accept="image/*" onChange={(event) => void handleAvatarFileChange(event)} disabled={avatarProcessing || avatarSaving} className="hidden" />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => void handleAvatarSave()}
                                    disabled={!avatarDraft || avatarProcessing || avatarSaving}
                                    className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <CheckIcon className="h-4 w-4" />
                                    {avatarSaving ? '保存中' : '保存'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleAvatarDelete()}
                                    disabled={avatarProcessing || avatarSaving}
                                    className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/10"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                    删除
                                </button>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">支持常见图片格式；GIF 需小于 20 KB，其他大图会自动压缩。</p>
                        <div className="mt-4"><NoticeMessage notice={avatarNotice} /></div>
                    </div>

                    <form onSubmit={(event) => void handleUsernameSubmit(event)} className="md:pl-8">
                        <div className="flex items-center gap-2">
                            <UserIcon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                            <h3 className="text-sm font-semibold">用户名</h3>
                        </div>
                        <label htmlFor="profile-username" className="mt-4 block text-xs font-medium text-gray-600 dark:text-gray-300">显示名称</label>
                        <input
                            id="profile-username"
                            type="text"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoComplete="username"
                            className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white"
                        />
                        <div className="mt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={usernameSaving || !username.trim()}
                                className="flex h-9 items-center gap-2 rounded-lg bg-gray-900 px-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                            >
                                <CheckIcon className="h-4 w-4" />
                                {usernameSaving ? '保存中' : '保存用户名'}
                            </button>
                        </div>
                        <div className="mt-4"><NoticeMessage notice={usernameNotice} /></div>
                    </form>
                </div>
            </section>

            <section className="border-b border-gray-200 py-8 dark:border-white/[0.08]">
                <h2 className="text-base font-semibold text-gray-950 dark:text-white">登录方式</h2>
                <div className="mt-5 space-y-2">
                    {authBindings.map((binding) => (
                        <div key={binding.provider} className="flex min-h-16 items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                                    <LinkIcon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold">{AUTH_PROVIDER_LABELS[binding.provider]}</p>
                                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{binding.detail}</p>
                                </div>
                            </div>
                            <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${binding.bound ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${binding.bound ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                {binding.bound ? '已绑定' : '未绑定'}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="py-8">
                <h2 className="text-base font-semibold text-gray-950 dark:text-white">修改密码</h2>
                <form onSubmit={(event) => void handlePasswordSubmit(event)} className="mt-5">
                    <div className="grid gap-4 lg:grid-cols-3">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                            当前密码
                            <input
                                type="password"
                                value={oldPassword}
                                onChange={(event) => setOldPassword(event.target.value)}
                                autoComplete="current-password"
                                className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white"
                            />
                        </label>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                            新密码
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                autoComplete="new-password"
                                minLength={8}
                                className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white"
                            />
                        </label>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                            确认新密码
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                autoComplete="new-password"
                                minLength={8}
                                className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white"
                            />
                        </label>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">新密码至少 8 个字符。修改后需要重新登录。</p>
                    <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1"><NoticeMessage notice={passwordNotice} /></div>
                        <button
                            type="submit"
                            disabled={passwordSaving}
                            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-wait disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                        >
                            <CheckIcon className="h-4 w-4" />
                            {passwordSaving ? '修改中' : '修改密码'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    )
}
