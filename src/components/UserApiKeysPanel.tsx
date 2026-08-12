import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import {
    deleteSub2ApiKey,
    getSub2ApiGatewayBaseUrl,
    getSub2ApiKeysUsage,
    getSub2ApiPublicSettings,
    listSub2ApiGroups,
    listSub2ApiKeys,
    updateSub2ApiKey,
    type Sub2ApiApiKey,
    type Sub2ApiApiKeyUsageStat,
    type Sub2ApiGroup,
    type Sub2ApiPublicSettings,
} from '../lib/sub2apiAuth'
import {
    CheckIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    CloseIcon,
    CopyIcon,
    EditIcon,
    PlusIcon,
    PowerIcon,
    RefreshIcon,
    SearchIcon,
    TrashIcon,
} from './icons'
import UserApiKeyEditor from './UserApiKeyEditor'

interface UserApiKeysPanelProps {
    onKeysChanged: () => Promise<void>
}

type KeyStatusFilter = 'all' | 'active' | 'inactive' | 'quota_exhausted' | 'expired'
type KeySort = 'created_at' | 'name' | 'current_concurrency' | 'expires_at'
type UsageStatus = 'idle' | 'loading' | 'ready' | 'error'

const PAGE_SIZE = 20

const KEY_STATUS_LABELS: Record<string, string> = {
    active: '可用',
    inactive: '已停用',
    quota_exhausted: '额度耗尽',
    expired: '已过期',
}

const PLATFORM_LABELS: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    gemini: 'Gemini',
    antigravity: 'Antigravity',
    grok: 'Grok',
    composite: '复合路由',
}

function formatCost(value: number | undefined, digits = 4) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
    return `$${value.toFixed(digits)}`
}

function formatDateTime(value: string | null | undefined, fallback: string) {
    if (!value) return fallback
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return fallback
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)
}

function KeyStatusBadge({ status }: { status: string }) {
    const className = status === 'active'
        ? 'is-success'
        : status === 'quota_exhausted'
            ? 'is-warning'
            : status === 'expired'
                ? 'is-danger'
                : ''
    return (
        <span className={`console-inline-status ${className}`}>
            <span className="console-inline-status-dot" />
            {KEY_STATUS_LABELS[status] ?? '不可用'}
        </span>
    )
}

function KeyUsageSummary({ item, stat, status }: { item: Sub2ApiApiKey, stat?: Sub2ApiApiKeyUsageStat, status: UsageStatus }) {
    const quota = typeof item.quota === 'number' && Number.isFinite(item.quota) ? Math.max(0, item.quota) : 0
    const quotaUsed = typeof item.quota_used === 'number' && Number.isFinite(item.quota_used) ? Math.max(0, item.quota_used) : 0
    const quotaProgress = quota > 0 ? Math.min(100, (quotaUsed / quota) * 100) : 0
    const quotaTone = quota > 0 && quotaUsed >= quota ? 'is-danger' : quota > 0 && quotaUsed >= quota * 0.8 ? 'is-warning' : ''
    const limits = [
        { label: '5h', limit: item.rate_limit_5h, used: item.usage_5h },
        { label: '1d', limit: item.rate_limit_1d, used: item.usage_1d },
        { label: '7d', limit: item.rate_limit_7d, used: item.usage_7d },
    ].filter((entry) => typeof entry.limit === 'number' && entry.limit > 0)

    return (
        <div className="min-w-0 text-xs">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span><span className="console-muted">今日</span> <strong className="console-secondary-text tabular-nums">{status === 'loading' ? '...' : status === 'ready' ? formatCost(stat?.today_actual_cost) : '-'}</strong></span>
                <span><span className="console-muted">累计</span> <strong className="console-secondary-text tabular-nums">{status === 'loading' ? '...' : status === 'ready' ? formatCost(stat?.total_actual_cost) : '-'}</strong></span>
            </div>
            {quota > 0 ? (
                <div className="mt-2">
                    <div className="flex items-center justify-between gap-2 tabular-nums">
                        <span className="console-muted">额度</span>
                        <span className={`console-key-quota-text ${quotaTone}`}>{formatCost(quotaUsed, 2)} / {formatCost(quota, 2)}</span>
                    </div>
                    <div className="console-key-quota-track mt-1.5" aria-label={`额度已使用 ${quotaProgress.toFixed(0)}%`}>
                        <span className={`console-key-quota-fill ${quotaTone}`} style={{ width: `${quotaProgress}%` }} />
                    </div>
                </div>
            ) : (
                <p className="console-muted mt-2">不限总额度</p>
            )}
            {limits.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {limits.map((entry) => (
                        <span key={entry.label} className="console-key-limit-chip tabular-nums">
                            {entry.label} {formatCost(entry.used, 2)} / {formatCost(entry.limit, 2)}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function UserApiKeysPanel({ onKeysChanged }: UserApiKeysPanelProps) {
    const setConfirmDialog = useStore((state) => state.setConfirmDialog)
    const showToast = useStore((state) => state.showToast)
    const settings = useStore((state) => state.settings)
    const createButtonRef = useRef<HTMLButtonElement>(null)
    const createdCopyButtonRef = useRef<HTMLButtonElement>(null)
    const copyResetTimerRef = useRef<number | null>(null)
    const loadRequestRef = useRef(0)
    const [keys, setKeys] = useState<Sub2ApiApiKey[]>([])
    const [groups, setGroups] = useState<Sub2ApiGroup[]>([])
    const [publicSettings, setPublicSettings] = useState<Sub2ApiPublicSettings | null>(null)
    const [usageStats, setUsageStats] = useState<Record<string, Sub2ApiApiKeyUsageStat>>({})
    const [usageStatus, setUsageStatus] = useState<UsageStatus>('idle')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [operationError, setOperationError] = useState('')
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<KeyStatusFilter>('all')
    const [groupFilter, setGroupFilter] = useState('all')
    const [sortBy, setSortBy] = useState<KeySort>('created_at')
    const [editorItem, setEditorItem] = useState<Sub2ApiApiKey | null | undefined>(undefined)
    const [createdKey, setCreatedKey] = useState<Sub2ApiApiKey | null>(null)
    const [copiedTarget, setCopiedTarget] = useState('')
    const [copyNotice, setCopyNotice] = useState('')
    const [copyError, setCopyError] = useState('')
    const [busyKeyId, setBusyKeyId] = useState<number | null>(null)

    const activeKeys = keys.filter((item) => item.status === 'active')
    const currentConcurrency = keys.reduce((sum, item) => sum + (typeof item.current_concurrency === 'number' ? item.current_concurrency : 0), 0)
    const pageUsage = usageStatus === 'ready'
        ? Object.values(usageStats).reduce((sum, item) => sum + (Number.isFinite(item.total_actual_cost) ? item.total_actual_cost : 0), 0)
        : null
    const quotaUsed = keys.reduce((sum, item) => sum + (typeof item.quota_used === 'number' ? item.quota_used : 0), 0)
    const quotaLimit = keys.reduce((sum, item) => sum + (typeof item.quota === 'number' ? item.quota : 0), 0)

    const loadKeys = useCallback(async (
        nextPage: number,
        search: string,
        status: KeyStatusFilter,
        group: string,
        sort: KeySort,
    ) => {
        const requestId = ++loadRequestRef.current
        setIsLoading(true)
        setError('')
        setUsageStatus('loading')
        try {
            const result = await listSub2ApiKeys({
                page: nextPage,
                pageSize: PAGE_SIZE,
                search,
                status: status === 'all' ? undefined : status,
                groupId: group === 'all' ? undefined : Number(group),
                sortBy: sort,
                sortOrder: sort === 'name' ? 'asc' : 'desc',
            })
            if (requestId !== loadRequestRef.current) return
            const items = Array.isArray(result.items) ? result.items : []
            const nextTotal = typeof result.total === 'number' && Number.isFinite(result.total) ? Math.max(0, result.total) : items.length
            const nextPages = typeof result.pages === 'number' && Number.isFinite(result.pages)
                ? Math.max(1, result.pages)
                : Math.max(1, Math.ceil(nextTotal / PAGE_SIZE))
            setKeys(items)
            setTotal(nextTotal)
            setPages(nextPages)
            setPage(Math.min(Math.max(1, nextPage), nextPages))
            setIsLoading(false)

            try {
                const usage = await getSub2ApiKeysUsage(items.map((item) => item.id))
                if (requestId !== loadRequestRef.current) return
                setUsageStats(usage.stats && typeof usage.stats === 'object' ? usage.stats : {})
                setUsageStatus('ready')
            } catch {
                if (requestId !== loadRequestRef.current) return
                setUsageStats({})
                setUsageStatus('error')
            }
        } catch (err) {
            if (requestId !== loadRequestRef.current) return
            setKeys([])
            setUsageStats({})
            setUsageStatus('error')
            setError(err instanceof Error ? err.message : 'API 密钥加载失败。')
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadKeys(1, searchQuery, statusFilter, groupFilter, sortBy)
        }, 280)
        return () => window.clearTimeout(timer)
    }, [groupFilter, loadKeys, searchQuery, sortBy, statusFilter])

    useEffect(() => {
        let isActive = true
        void Promise.allSettled([listSub2ApiGroups(), getSub2ApiPublicSettings()]).then((results) => {
            if (!isActive) return
            if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) setGroups(results[0].value)
            if (results[1].status === 'fulfilled') setPublicSettings(results[1].value)
        })
        return () => {
            isActive = false
        }
    }, [])

    useEffect(() => () => {
        if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
    }, [])

    useEffect(() => {
        if (!createdKey) return
        const frame = window.requestAnimationFrame(() => createdCopyButtonRef.current?.focus())
        return () => window.cancelAnimationFrame(frame)
    }, [createdKey])

    const handleCopy = async (value: string, target: string, label: string) => {
        if (!value.trim()) return
        setCopyError('')
        try {
            await copyTextToClipboard(value)
            if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
            setCopiedTarget(target)
            setCopyNotice(`${label}已复制`)
            copyResetTimerRef.current = window.setTimeout(() => {
                setCopiedTarget('')
                setCopyNotice('')
                copyResetTimerRef.current = null
            }, 2400)
        } catch (err) {
            setCopyError(getClipboardFailureMessage(`${label}复制失败。`, err))
        }
    }

    const reloadCurrentPage = () => loadKeys(page, searchQuery, statusFilter, groupFilter, sortBy)

    const handleSaved = async (item: Sub2ApiApiKey, created: boolean) => {
        setEditorItem(undefined)
        setOperationError('')
        if (created && item.key?.trim()) setCreatedKey(item)
        showToast(created ? 'API 密钥已创建' : 'API 密钥已更新', 'success')
        await Promise.all([
            loadKeys(created ? 1 : page, searchQuery, statusFilter, groupFilter, sortBy),
            onKeysChanged(),
        ])
    }

    const performToggle = async (item: Sub2ApiApiKey) => {
        const nextStatus = item.status === 'active' ? 'inactive' : 'active'
        setBusyKeyId(item.id)
        setOperationError('')
        try {
            await updateSub2ApiKey(item.id, { status: nextStatus })
            showToast(nextStatus === 'active' ? 'API 密钥已启用' : 'API 密钥已停用', 'success')
            await Promise.all([reloadCurrentPage(), onKeysChanged()])
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : 'API 密钥状态更新失败。')
        } finally {
            setBusyKeyId(null)
        }
    }

    const handleToggle = (item: Sub2ApiApiKey) => {
        if (item.status !== 'active') {
            void performToggle(item)
            return
        }
        const inUse = settings.profiles.some((profile) => profile.apiKey.trim() === item.key.trim())
        setConfirmDialog({
            title: '停用 API 密钥',
            message: inUse
                ? `“${item.name || '未命名密钥'}”正在被 OmniMuse 的 API 配置使用。停用后，相关图像生成或 Agent 请求会立即失败。`
                : `确定停用“${item.name || '未命名密钥'}”吗？使用该密钥的客户端将无法继续调用 API。`,
            confirmText: '确认停用',
            tone: 'warning',
            action: () => void performToggle(item),
        })
    }

    const performDelete = async (item: Sub2ApiApiKey) => {
        setBusyKeyId(item.id)
        setOperationError('')
        try {
            await deleteSub2ApiKey(item.id)
            showToast('API 密钥已删除', 'success')
            const nextPage = keys.length === 1 && page > 1 ? page - 1 : page
            await Promise.all([
                loadKeys(nextPage, searchQuery, statusFilter, groupFilter, sortBy),
                onKeysChanged(),
            ])
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : 'API 密钥删除失败。')
        } finally {
            setBusyKeyId(null)
        }
    }

    const handleDelete = (item: Sub2ApiApiKey) => {
        const inUse = settings.profiles.some((profile) => profile.apiKey.trim() === item.key.trim())
        setConfirmDialog({
            title: '删除 API 密钥',
            message: inUse
                ? `“${item.name || '未命名密钥'}”正在被 OmniMuse 的 API 配置使用。删除不可恢复，相关图像生成或 Agent 请求会立即失败。`
                : `确定永久删除“${item.name || '未命名密钥'}”吗？此操作不可恢复。`,
            confirmText: '确认删除',
            tone: 'danger',
            minConfirmDelayMs: 800,
            action: () => void performDelete(item),
        })
    }

    const primaryEndpoint = publicSettings?.api_base_url?.trim() || getSub2ApiGatewayBaseUrl()
    const endpoints = [
        { name: '默认端点', endpoint: primaryEndpoint },
        ...(publicSettings?.custom_endpoints ?? []),
    ].filter((item, index, list) => item.endpoint?.trim() && list.findIndex((candidate) => candidate.endpoint?.trim() === item.endpoint.trim()) === index)

    return (
        <div className="console-page min-w-0 space-y-6">
            <header className="console-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 className="console-page-title">API 密钥</h1>
                    <p className="console-page-description mt-2 text-sm">凭证、额度与访问策略</p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void reloadCurrentPage()} disabled={isLoading} className="console-icon-button" aria-label="刷新 API 密钥" title="刷新 API 密钥">
                        <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        ref={createButtonRef}
                        type="button"
                        onClick={() => {
                            setEditorItem(null)
                            setCreatedKey(null)
                        }}
                        className="console-button console-button--primary"
                        aria-expanded={editorItem !== undefined}
                        aria-controls="console-api-key-editor-title"
                    >
                        <PlusIcon className="h-4 w-4" />
                        创建密钥
                    </button>
                </div>
            </header>

            <section className="console-api-key-metrics console-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="API 密钥状态">
                {[
                    { label: '密钥总数', value: isLoading ? '-' : total.toLocaleString('zh-CN'), detail: `${activeKeys.length} 个本页可用`, tone: 'accent' },
                    { label: '当前并发', value: isLoading ? '-' : currentConcurrency.toLocaleString('zh-CN'), detail: '本页实时占用', tone: currentConcurrency > 0 ? 'success' : 'muted' },
                    { label: '累计用量', value: pageUsage === null ? '-' : formatCost(pageUsage, 2), detail: usageStatus === 'error' ? '用量服务暂不可用' : '当前页密钥', tone: 'success' },
                    { label: '额度使用', value: quotaLimit > 0 ? `${formatCost(quotaUsed, 2)} / ${formatCost(quotaLimit, 2)}` : '不限额', detail: '当前页已配置额度', tone: quotaLimit > 0 && quotaUsed >= quotaLimit ? 'warning' : 'muted' },
                ].map((item) => (
                    <article key={item.label} className={`console-metric console-tone-${item.tone}`}>
                        <span className="console-metric-signal" aria-hidden="true" />
                        <p className="console-metric-label">{item.label}</p>
                        <p className="console-metric-value mt-3 break-words tabular-nums">{item.value}</p>
                        <p className="console-metric-detail mt-1">{item.detail}</p>
                    </article>
                ))}
            </section>

            {editorItem !== undefined && (
                <UserApiKeyEditor
                    key={editorItem?.id ?? 'create'}
                    item={editorItem}
                    groups={groups}
                    onClose={() => {
                        setEditorItem(undefined)
                        window.requestAnimationFrame(() => createButtonRef.current?.focus())
                    }}
                    onSaved={handleSaved}
                />
            )}

            {createdKey && (
                <section className="console-message console-message--success p-4" aria-live="polite">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><CheckIcon className="h-4 w-4" /></span>
                            <div className="min-w-0">
                                <p className="text-sm font-bold">“{createdKey.name || '未命名密钥'}”已创建</p>
                                <p className="mt-1 text-xs text-emerald-100/70">请妥善保存本次返回的完整密钥。</p>
                            </div>
                        </div>
                        <button type="button" onClick={() => setCreatedKey(null)} className="console-icon-button" aria-label="关闭创建结果" title="关闭">
                            <CloseIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <code className="console-key-value min-w-0 flex-1 break-all px-3 py-3 text-xs">{createdKey.key}</code>
                        <button ref={createdCopyButtonRef} type="button" onClick={() => void handleCopy(createdKey.key, `key-${createdKey.id}`, 'API 密钥')} className="console-button console-button--secondary shrink-0">
                            {copiedTarget === `key-${createdKey.id}` ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                            {copiedTarget === `key-${createdKey.id}` ? '已复制' : '复制密钥'}
                        </button>
                    </div>
                </section>
            )}

            {(copyError || operationError) && <div role="alert" className="console-message console-message--danger px-4 py-3 text-sm">{copyError || operationError}</div>}
            <span role="status" aria-live="polite" className="sr-only">{copyNotice}</span>

            <section className="console-panel min-w-0 overflow-hidden" aria-labelledby="console-api-key-list-title">
                <h2 id="console-api-key-list-title" className="sr-only">API 密钥列表</h2>
                <div className="console-key-toolbar grid gap-3 px-4 py-4 sm:grid-cols-2 xl:flex xl:items-center">
                    <div className="relative min-w-0 sm:col-span-2 xl:flex-1">
                        <label htmlFor="console-api-key-search" className="sr-only">搜索 API 密钥</label>
                        <SearchIcon className="console-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <input id="console-api-key-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索名称或密钥" className="console-input pl-10" />
                    </div>
                    <label className="sr-only" htmlFor="console-api-key-group-filter">筛选分组</label>
                    <select id="console-api-key-group-filter" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} className="console-input xl:w-40">
                        <option value="all">全部分组</option>
                        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                    <label className="sr-only" htmlFor="console-api-key-status">筛选密钥状态</label>
                    <select id="console-api-key-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as KeyStatusFilter)} className="console-input xl:w-36">
                        <option value="all">全部状态</option>
                        <option value="active">可用</option>
                        <option value="inactive">已停用</option>
                        <option value="quota_exhausted">额度耗尽</option>
                        <option value="expired">已过期</option>
                    </select>
                    <label className="sr-only" htmlFor="console-api-key-sort">排序方式</label>
                    <select id="console-api-key-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as KeySort)} className="console-input xl:w-36">
                        <option value="created_at">最近创建</option>
                        <option value="name">名称排序</option>
                        <option value="current_concurrency">并发排序</option>
                        <option value="expires_at">到期排序</option>
                    </select>
                    <span className="console-muted self-center justify-self-end px-1 text-xs tabular-nums">{keys.length} / {total}</span>
                </div>

                <div className="console-key-endpoints px-4 py-3" aria-label="API 端点">
                    <span className="console-key-endpoint-title">API 端点</span>
                    <div className="console-key-endpoint-list">
                        {endpoints.map((item, index) => (
                            <button
                                key={`${item.endpoint}-${index}`}
                                type="button"
                                onClick={() => void handleCopy(item.endpoint, `endpoint-${index}`, `${item.name}端点`)}
                                className="console-key-endpoint"
                                title={`复制 ${item.endpoint}`}
                            >
                                <span>{item.name}</span>
                                <code>{item.endpoint}</code>
                                {copiedTarget === `endpoint-${index}` ? <CheckIcon className="h-3.5 w-3.5 text-emerald-300" /> : <CopyIcon className="h-3.5 w-3.5" />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="console-key-grid-head" aria-hidden="true">
                    <span>名称 / 状态</span>
                    <span>API 密钥</span>
                    <span>分组</span>
                    <span>并发</span>
                    <span>用量 / 额度</span>
                    <span>到期 / 最近使用</span>
                    <span>操作</span>
                </div>

                <div className="min-h-32" aria-live="polite">
                    {isLoading ? (
                        <div role="status" aria-label="正在加载 API 密钥" className="space-y-3 p-5">
                            {[0, 1, 2].map((item) => <div key={item} className="console-skeleton h-32 rounded-lg xl:h-24" />)}
                        </div>
                    ) : error ? (
                        <div role="alert" className="console-message console-message--danger m-5 flex min-h-32 flex-col items-start justify-center gap-3 px-4 py-3 text-sm">
                            <p>{error}</p>
                            <button type="button" onClick={() => void reloadCurrentPage()} className="console-text-action min-h-11 font-semibold">重新加载</button>
                        </div>
                    ) : keys.length === 0 ? (
                        <div className="console-empty m-5 flex min-h-32 items-center justify-center px-4 text-center text-sm">
                            {searchQuery.trim() || statusFilter !== 'all' || groupFilter !== 'all' ? '没有符合筛选条件的密钥' : '暂无 API 密钥'}
                        </div>
                    ) : (
                        <div className="console-data-list">
                            {keys.map((item) => {
                                const name = item.name || '未命名密钥'
                                const value = item.key?.trim() || ''
                                const maskedKey = value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value ? '••••••••' : '未返回密钥'
                                const group = item.group ?? groups.find((entry) => entry.id === item.group_id)
                                const isCurrent = value && settings.profiles.some((profile) => profile.apiKey.trim() === value)
                                const hasIpRestriction = Boolean(item.ip_whitelist?.length || item.ip_blacklist?.length)
                                const busy = busyKeyId === item.id
                                return (
                                    <article key={item.id} className="console-key-grid-row">
                                        <div className="console-key-cell console-key-cell--identity">
                                            <span className="console-key-cell-label">名称 / 状态</span>
                                            <div className="flex min-w-0 items-start justify-between gap-3 xl:block">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-white" title={name}>{name}</p>
                                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                                        <span className="console-muted text-xs tabular-nums">ID {item.id}</span>
                                                        {isCurrent && <span className="console-key-context-chip">当前配置</span>}
                                                        {hasIpRestriction && <span className="console-key-context-chip is-secure">IP 限制</span>}
                                                    </div>
                                                </div>
                                                <div className="xl:mt-2"><KeyStatusBadge status={item.status} /></div>
                                            </div>
                                        </div>

                                        <div className="console-key-cell console-key-cell--key">
                                            <span className="console-key-cell-label">API 密钥</span>
                                            <div className="flex min-w-0 items-center gap-2">
                                                <code className="console-key-value min-w-0 flex-1 truncate px-2 py-2 text-xs" title={maskedKey}>{maskedKey}</code>
                                                <button type="button" onClick={() => void handleCopy(value, `key-${item.id}`, 'API 密钥')} disabled={!value} className="console-icon-button" aria-label={`复制“${name}”`} title={copiedTarget === `key-${item.id}` ? '已复制' : '复制密钥'}>
                                                    {copiedTarget === `key-${item.id}` ? <CheckIcon className="h-4 w-4 text-emerald-300" /> : <CopyIcon className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="console-key-cell console-key-cell--group">
                                            <span className="console-key-cell-label">分组</span>
                                            {group ? (
                                                <div className="console-key-group">
                                                    <span className="console-key-group-badge">{group.name}</span>
                                                    <p className="console-key-group-detail">
                                                        {PLATFORM_LABELS[group.platform || ''] || group.platform || '通用'}
                                                        {typeof group.rate_multiplier === 'number' ? ` · ${group.rate_multiplier}x` : ''}
                                                    </p>
                                                </div>
                                            ) : <span className="console-muted text-xs">未指定</span>}
                                        </div>

                                        <div className="console-key-cell console-key-cell--concurrency">
                                            <span className="console-key-cell-label">当前并发</span>
                                            <span className={`console-key-concurrency ${(item.current_concurrency ?? 0) > 0 ? 'is-active' : ''}`}>{item.current_concurrency ?? 0}</span>
                                        </div>

                                        <div className="console-key-cell console-key-cell--usage">
                                            <span className="console-key-cell-label">用量 / 额度</span>
                                            <KeyUsageSummary item={item} stat={usageStats[String(item.id)]} status={usageStatus} />
                                        </div>

                                        <div className="console-key-cell console-key-cell--expiry">
                                            <span className="console-key-cell-label">到期 / 最近使用</span>
                                            <p className={item.expires_at && new Date(item.expires_at).getTime() < Date.now() ? 'text-xs text-rose-300' : 'console-secondary-text text-xs'}>{formatDateTime(item.expires_at, '永久有效')}</p>
                                            <p className="console-muted mt-1.5 text-xs">最近 {formatDateTime(item.last_used_at, '暂无记录')}</p>
                                            {item.last_used_ip && <p className="console-muted mt-1 truncate font-mono text-[11px]" title={item.last_used_ip}>{item.last_used_ip}</p>}
                                        </div>

                                        <div className="console-key-cell console-key-cell--actions">
                                            <span className="console-key-cell-label">操作</span>
                                            <div className="flex items-center justify-end gap-2 xl:justify-start">
                                                <button type="button" onClick={() => handleToggle(item)} disabled={busy} className="console-icon-button" aria-label={`${item.status === 'active' ? '停用' : '启用'}“${name}”`} title={item.status === 'active' ? '停用' : '启用'}>
                                                    <PowerIcon className={`h-4 w-4 ${item.status === 'active' ? '' : 'text-emerald-300'}`} />
                                                </button>
                                                <button type="button" onClick={() => setEditorItem(item)} disabled={busy} className="console-icon-button" aria-label={`编辑“${name}”`} title="编辑">
                                                    <EditIcon className="h-4 w-4" />
                                                </button>
                                                <button type="button" onClick={() => handleDelete(item)} disabled={busy} className="console-icon-button console-icon-button--danger" aria-label={`删除“${name}”`} title="删除">
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </div>

                {pages > 1 && !error && (
                    <nav className="console-key-pagination flex items-center justify-between gap-3 px-4 py-3" aria-label="API 密钥分页">
                        <button type="button" onClick={() => void loadKeys(page - 1, searchQuery, statusFilter, groupFilter, sortBy)} disabled={isLoading || page <= 1} className="console-button console-button--secondary w-11 px-0 sm:w-auto sm:px-3" aria-label="上一页">
                            <ChevronLeftIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">上一页</span>
                        </button>
                        <span className="console-muted text-center text-xs tabular-nums">第 {page} / {pages} 页<span className="hidden sm:inline"> · 共 {total.toLocaleString('zh-CN')} 个</span></span>
                        <button type="button" onClick={() => void loadKeys(page + 1, searchQuery, statusFilter, groupFilter, sortBy)} disabled={isLoading || page >= pages} className="console-button console-button--secondary w-11 px-0 sm:w-auto sm:px-3" aria-label="下一页">
                            <span className="hidden sm:inline">下一页</span>
                            <ChevronRightIcon className="h-4 w-4" />
                        </button>
                    </nav>
                )}
            </section>
        </div>
    )
}
