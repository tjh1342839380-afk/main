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
            className={`console-message flex items-start gap-2 px-3 py-2.5 text-sm ${notice.tone === 'success' ? 'console-message--success' : 'console-message--danger'}`}
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
        <div className="console-page min-w-0 space-y-6">
            <header className="console-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="console-page-title">个人资料</h1>
                    <p className="console-page-description mt-2 truncate text-sm" title={profile.email}>{profile.email}</p>
                </div>
                <button
                    type="button"
                    onClick={() => void loadProfile()}
                    disabled={isLoading}
                    className="console-button console-button--secondary"
                >
                    <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    {isLoading ? '正在同步' : '刷新资料'}
                </button>
            </header>

            {loadError && (
                <div role="alert" className="console-message console-message--danger flex flex-col items-start gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span>{loadError}</span>
                    <button type="button" onClick={() => void loadProfile()} className="console-text-action min-h-11 shrink-0 font-semibold">重新加载</button>
                </div>
            )}

            <section className="console-panel console-profile-summary overflow-hidden" aria-label="账户摘要">
                <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
                    <span className="console-profile-avatar flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden text-2xl font-bold text-white">
                        {avatarUrl ? <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" /> : avatarInitial}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="max-w-full truncate text-xl font-bold text-white" title={displayName}>{displayName}</h2>
                            <span className="console-neutral-chip">{roleLabel}</span>
                            <span className={`console-status-chip ${profile.status === 'disabled' ? 'is-danger' : 'is-success'}`}>
                                <span className="console-status-chip-dot" />
                                {statusLabel}
                            </span>
                        </div>
                        <p className="console-muted mt-2 truncate text-sm" title={profile.email}>{profile.email}</p>
                    </div>
                </div>
                <dl className="console-summary-grid grid sm:grid-cols-3">
                    <div className="console-summary-item px-5 py-4">
                        <dt className="console-muted text-xs font-semibold">账户余额</dt>
                        <dd className="console-success-text mt-2 text-lg font-bold tabular-nums">{formatBalance(profile.balance)}</dd>
                    </div>
                    <div className="console-summary-item px-5 py-4">
                        <dt className="console-muted text-xs font-semibold">并发额度</dt>
                        <dd className="mt-2 text-lg font-bold tabular-nums text-white">{profile.concurrency ?? '-'}</dd>
                    </div>
                    <div className="console-summary-item px-5 py-4">
                        <dt className="console-muted text-xs font-semibold">注册时间</dt>
                        <dd className="mt-2 text-lg font-bold text-white">{formatMemberSince(profile.created_at)}</dd>
                    </div>
                </dl>
            </section>

            <section aria-labelledby="profile-basic-title">
                <h2 id="profile-basic-title" className="console-section-title mb-4">基本资料</h2>
                <div className="console-stagger grid gap-4 xl:grid-cols-2">
                    <div className="console-panel p-5">
                        <div className="flex items-center gap-3">
                            <span className="console-panel-icon">
                                <ImageIcon className="h-4 w-4" />
                            </span>
                            <h3 className="text-sm font-bold text-white">头像</h3>
                        </div>
                        <div className="mt-5 flex items-start gap-4">
                            <span className="console-profile-avatar flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden text-xl font-bold text-white">
                                {avatarUrl ? <img src={avatarUrl} alt="头像预览" className="h-full w-full object-cover" /> : avatarInitial}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                                <label className={`console-button console-button--secondary cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cyan-400 ${avatarProcessing || avatarSaving ? 'pointer-events-none opacity-50' : ''}`}>
                                    <ImageIcon className="h-4 w-4" />
                                    {avatarProcessing ? '处理中' : '选择图片'}
                                    <input type="file" accept="image/*" onChange={(event) => void handleAvatarFileChange(event)} disabled={avatarProcessing || avatarSaving} className="sr-only" />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => void handleAvatarSave()}
                                    disabled={!avatarDraft || avatarProcessing || avatarSaving}
                                    className="console-button console-button--primary"
                                >
                                    <CheckIcon className="h-4 w-4" />
                                    {avatarSaving ? '保存中' : '保存'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleAvatarDelete()}
                                    disabled={avatarProcessing || avatarSaving}
                                    className="console-button console-button--ghost-danger"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                    删除
                                </button>
                            </div>
                        </div>
                        <p className="console-muted mt-4 text-xs leading-5">支持常见图片格式；GIF 需小于 20 KB，其他大图会自动压缩。</p>
                        <div className="mt-4"><NoticeMessage notice={avatarNotice} /></div>
                    </div>

                    <form onSubmit={(event) => void handleUsernameSubmit(event)} className="console-panel p-5">
                        <div className="flex items-center gap-3">
                            <span className="console-panel-icon">
                                <UserIcon className="h-4 w-4" />
                            </span>
                            <h3 className="text-sm font-bold text-white">用户名</h3>
                        </div>
                        <label htmlFor="profile-username" className="console-field-label mt-5 block">显示名称</label>
                        <input
                            id="profile-username"
                            type="text"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoComplete="username"
                            aria-invalid={usernameNotice?.tone === 'error'}
                            aria-describedby="profile-username-notice"
                            className="console-input mt-2"
                        />
                        <div className="mt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={usernameSaving || !username.trim()}
                                className="console-button console-button--primary"
                            >
                                <CheckIcon className="h-4 w-4" />
                                {usernameSaving ? '保存中' : '保存用户名'}
                            </button>
                        </div>
                        <div id="profile-username-notice" className="mt-4"><NoticeMessage notice={usernameNotice} /></div>
                    </form>
                </div>
            </section>

            <section className="console-panel overflow-hidden" aria-labelledby="profile-bindings-title">
                <div className="console-panel-header flex min-h-16 items-center gap-3 px-5 py-3">
                    <span className="console-panel-icon console-panel-icon--neutral">
                        <LinkIcon className="h-4 w-4" />
                    </span>
                    <h2 id="profile-bindings-title" className="console-panel-title">登录方式</h2>
                </div>
                <div className="console-data-list">
                    {authBindings.map((binding) => (
                        <div key={binding.provider} className="console-data-row flex min-h-[4.5rem] items-center justify-between gap-4 px-5 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-white">{AUTH_PROVIDER_LABELS[binding.provider]}</p>
                                <p className="console-muted mt-1 truncate text-xs" title={binding.detail}>{binding.detail}</p>
                            </div>
                            <span className={`console-inline-status shrink-0 ${binding.bound ? 'is-success' : ''}`}>
                                <span className="console-inline-status-dot" />
                                {binding.bound ? '已绑定' : '未绑定'}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="console-panel p-5" aria-labelledby="profile-password-title">
                <h2 id="profile-password-title" className="console-panel-title">修改密码</h2>
                <form onSubmit={(event) => void handlePasswordSubmit(event)} className="mt-5">
                    <div className="grid gap-4 xl:grid-cols-3">
                        <label className="console-field-label block">
                            当前密码
                            <input
                                type="password"
                                value={oldPassword}
                                onChange={(event) => setOldPassword(event.target.value)}
                                autoComplete="current-password"
                                aria-invalid={passwordNotice?.tone === 'error'}
                                aria-describedby="profile-password-help profile-password-notice"
                                className="console-input mt-2"
                            />
                        </label>
                        <label className="console-field-label block">
                            新密码
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                autoComplete="new-password"
                                minLength={8}
                                aria-invalid={passwordNotice?.tone === 'error'}
                                aria-describedby="profile-password-help profile-password-notice"
                                className="console-input mt-2"
                            />
                        </label>
                        <label className="console-field-label block">
                            确认新密码
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                autoComplete="new-password"
                                minLength={8}
                                aria-invalid={passwordNotice?.tone === 'error'}
                                aria-describedby="profile-password-help profile-password-notice"
                                className="console-input mt-2"
                            />
                        </label>
                    </div>
                    <p id="profile-password-help" className="console-muted mt-3 text-xs">新密码至少 8 个字符。修改后需要重新登录。</p>
                    <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div id="profile-password-notice" className="min-w-0 flex-1"><NoticeMessage notice={passwordNotice} /></div>
                        <button
                            type="submit"
                            disabled={passwordSaving}
                            className="console-button console-button--primary shrink-0"
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
