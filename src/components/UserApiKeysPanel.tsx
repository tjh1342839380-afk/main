import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { APP_SHORT_NAME } from '../lib/brand'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import { createSub2ApiKey, listSub2ApiKeys, type Sub2ApiApiKey } from '../lib/sub2apiAuth'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, CopyIcon, KeyIcon, PlusIcon, RefreshIcon, SearchIcon } from './icons'

interface UserApiKeysPanelProps {
    onKeysChanged: () => Promise<void>
}

type KeyStatusFilter = 'all' | 'active' | 'inactive' | 'quota_exhausted' | 'expired'

const PAGE_SIZE = 20

const KEY_STATUS_LABELS: Record<string, string> = {
    active: '可用',
    inactive: '已停用',
    quota_exhausted: '额度耗尽',
    expired: '已过期',
}

export default function UserApiKeysPanel({ onKeysChanged }: UserApiKeysPanelProps) {
    const createButtonRef = useRef<HTMLButtonElement>(null)
    const createdCopyButtonRef = useRef<HTMLButtonElement>(null)
    const copyResetTimerRef = useRef<number | null>(null)
    const [keys, setKeys] = useState<Sub2ApiApiKey[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<KeyStatusFilter>('all')
    const [showCreate, setShowCreate] = useState(false)
    const [newKeyName, setNewKeyName] = useState(APP_SHORT_NAME)
    const [isCreating, setIsCreating] = useState(false)
    const [createError, setCreateError] = useState('')
    const [createdKey, setCreatedKey] = useState<Sub2ApiApiKey | null>(null)
    const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)
    const [copyNotice, setCopyNotice] = useState('')
    const [copyError, setCopyError] = useState('')

    const activeKeys = keys.filter((item) => item.status === 'active')

    const loadKeys = useCallback(async (nextPage: number, search: string, status: KeyStatusFilter) => {
        setIsLoading(true)
        setError('')
        try {
            const result = await listSub2ApiKeys({
                page: nextPage,
                pageSize: PAGE_SIZE,
                search,
                status: status === 'all' ? undefined : status,
            })
            const items = Array.isArray(result.items) ? result.items : []
            const nextTotal = typeof result.total === 'number' && Number.isFinite(result.total) ? Math.max(0, result.total) : items.length
            const nextPages = typeof result.pages === 'number' && Number.isFinite(result.pages)
                ? Math.max(1, result.pages)
                : Math.max(1, Math.ceil(nextTotal / PAGE_SIZE))
            setKeys(items)
            setTotal(nextTotal)
            setPages(nextPages)
            setPage(Math.min(Math.max(1, nextPage), nextPages))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'API 密钥加载失败。')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadKeys(1, searchQuery, statusFilter)
        }, 280)
        return () => window.clearTimeout(timer)
    }, [loadKeys, searchQuery, statusFilter])

    useEffect(() => () => {
        if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
    }, [])

    useEffect(() => {
        if (!createdKey) return
        const frame = window.requestAnimationFrame(() => createdCopyButtonRef.current?.focus())
        return () => window.cancelAnimationFrame(frame)
    }, [createdKey])

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const name = newKeyName.trim()
        if (!name || isCreating) return

        setIsCreating(true)
        setCreateError('')
        try {
            const key = await createSub2ApiKey(name)
            if (typeof key.key !== 'string' || !key.key.trim()) throw new Error('后台没有返回可复制的 API 密钥。')
            setCreatedKey(key)
            setShowCreate(false)
            setNewKeyName(APP_SHORT_NAME)
            await Promise.all([
                loadKeys(1, searchQuery, statusFilter),
                onKeysChanged(),
            ])
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : 'API 密钥创建失败。')
        } finally {
            setIsCreating(false)
        }
    }

    const handleCopy = async (item: Sub2ApiApiKey) => {
        const value = typeof item.key === 'string' ? item.key.trim() : ''
        if (!value) return

        setCopyError('')
        try {
            await copyTextToClipboard(value)
            if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
            setCopiedKeyId(item.id)
            const name = typeof item.name === 'string' && item.name ? item.name : '未命名密钥'
            setCopyNotice(`“${name}”已复制`)
            copyResetTimerRef.current = window.setTimeout(() => {
                setCopiedKeyId(null)
                setCopyNotice('')
                copyResetTimerRef.current = null
            }, 2400)
        } catch (err) {
            setCopyError(getClipboardFailureMessage('API 密钥复制失败。', err))
        }
    }

    return (
        <div className="console-page space-y-6">
            <header className="console-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 className="console-page-title">API 密钥</h1>
                    <p className="console-page-description mt-2 text-sm">访问凭证与连接状态</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void loadKeys(page, searchQuery, statusFilter)}
                        disabled={isLoading}
                        className="console-icon-button"
                        aria-label="刷新 API 密钥"
                        title="刷新 API 密钥"
                    >
                        <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        ref={createButtonRef}
                        type="button"
                        onClick={() => {
                            setShowCreate((current) => !current)
                            setCreateError('')
                        }}
                        className="console-button console-button--primary"
                        aria-expanded={showCreate}
                        aria-controls="console-create-api-key"
                    >
                        <PlusIcon className="h-4 w-4" />
                        创建密钥
                    </button>
                </div>
            </header>

            <section className="console-api-key-metrics console-stagger grid gap-3 sm:grid-cols-3" aria-label="API 密钥状态">
                {[
                    { label: '结果总数', value: total, detail: '符合当前条件', tone: 'accent' },
                    { label: '当前页可用', value: activeKeys.length, detail: '服务可调用', tone: 'success' },
                    { label: '当前页不可用', value: keys.length - activeKeys.length, detail: '停用、过期或额度耗尽', tone: 'muted' },
                ].map((item) => (
                    <article key={item.label} className={`console-metric console-tone-${item.tone}`}>
                        <span className="console-metric-signal" aria-hidden="true" />
                        <p className="console-metric-label">{item.label}</p>
                        <p className="console-metric-value mt-3 tabular-nums">{isLoading ? '-' : item.value.toLocaleString('zh-CN')}</p>
                        <p className="console-metric-detail mt-1">{item.detail}</p>
                    </article>
                ))}
            </section>

            {showCreate && (
                <section id="console-create-api-key" className="console-key-create console-panel p-5" aria-labelledby="console-create-api-key-title">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="console-panel-icon"><KeyIcon className="h-4 w-4" /></span>
                            <h2 id="console-create-api-key-title" className="console-panel-title">创建 API 密钥</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setShowCreate(false)
                                setCreateError('')
                                window.requestAnimationFrame(() => createButtonRef.current?.focus())
                            }}
                            className="console-icon-button"
                            aria-label="关闭创建表单"
                            title="关闭创建表单"
                        >
                            <CloseIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <form onSubmit={(event) => void handleCreate(event)} className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
                        <label htmlFor="console-api-key-name" className="console-field-label min-w-0 flex-1">
                            密钥名称
                            <input
                                id="console-api-key-name"
                                type="text"
                                value={newKeyName}
                                onChange={(event) => setNewKeyName(event.target.value)}
                                maxLength={80}
                                autoFocus
                                className="console-input mt-2"
                                aria-invalid={Boolean(createError)}
                                aria-describedby={createError ? 'console-api-key-create-error' : undefined}
                            />
                        </label>
                        <button type="submit" disabled={isCreating || !newKeyName.trim()} className="console-button console-button--primary shrink-0">
                            <PlusIcon className="h-4 w-4" />
                            {isCreating ? '创建中' : '确认创建'}
                        </button>
                    </form>
                    {createError && <p id="console-api-key-create-error" role="alert" className="mt-4 text-sm text-rose-300">{createError}</p>}
                </section>
            )}

            {createdKey && (
                <section className="console-message console-message--success p-4" aria-live="polite">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                                <CheckIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-bold">“{typeof createdKey.name === 'string' && createdKey.name ? createdKey.name : '未命名密钥'}”已创建</p>
                                <p className="mt-1 text-xs text-emerald-100/70">请妥善保存本次返回的完整密钥。</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setCreatedKey(null)
                                window.requestAnimationFrame(() => createButtonRef.current?.focus())
                            }}
                            className="console-icon-button"
                            aria-label="关闭创建结果"
                            title="关闭创建结果"
                        >
                            <CloseIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <code className="console-key-value min-w-0 flex-1 break-all px-3 py-3 text-xs">{createdKey.key}</code>
                        <button ref={createdCopyButtonRef} type="button" onClick={() => void handleCopy(createdKey)} className="console-button console-button--secondary shrink-0">
                            {copiedKeyId === createdKey.id ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                            {copiedKeyId === createdKey.id ? '已复制' : '复制密钥'}
                        </button>
                    </div>
                </section>
            )}

            {copyError && <div role="alert" className="console-message console-message--danger px-4 py-3 text-sm">{copyError}</div>}
            <span role="status" aria-live="polite" className="sr-only">{copyNotice}</span>

            <section className="console-panel overflow-hidden" aria-labelledby="console-api-key-list-title">
                <h2 id="console-api-key-list-title" className="sr-only">API 密钥列表</h2>
                <div className="console-key-toolbar flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 flex-1">
                        <label htmlFor="console-api-key-search" className="sr-only">搜索 API 密钥</label>
                        <SearchIcon className="console-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <input
                            id="console-api-key-search"
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="搜索名称或密钥"
                            className="console-input pl-10"
                        />
                    </div>
                    <label className="sr-only" htmlFor="console-api-key-status">筛选密钥状态</label>
                    <select
                        id="console-api-key-status"
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value as KeyStatusFilter)}
                        className="console-input sm:w-40"
                    >
                        <option value="all">全部状态</option>
                        <option value="active">可用</option>
                        <option value="inactive">已停用</option>
                        <option value="quota_exhausted">额度耗尽</option>
                        <option value="expired">已过期</option>
                    </select>
                    <span className="console-muted shrink-0 px-1 text-xs tabular-nums">{keys.length} / {total}</span>
                </div>

                <div className="console-key-table-head hidden min-h-11 grid-cols-[minmax(9rem,1.2fr)_minmax(13rem,1.8fr)_7rem_3rem] items-center gap-4 px-5 text-xs font-semibold md:grid">
                    <span>名称</span>
                    <span>API 密钥</span>
                    <span>状态</span>
                    <span className="sr-only">操作</span>
                </div>

                <div className="min-h-32" aria-live="polite">
                    {isLoading ? (
                        <div role="status" aria-label="正在加载 API 密钥" className="space-y-3 p-5">
                            {[0, 1, 2].map((item) => <div key={item} className="console-skeleton h-[4.5rem] rounded-lg" />)}
                        </div>
                    ) : error ? (
                        <div role="alert" className="console-message console-message--danger m-5 flex min-h-32 flex-col items-start justify-center gap-3 px-4 py-3 text-sm">
                            <p>{error}</p>
                            <button type="button" onClick={() => void loadKeys(page, searchQuery, statusFilter)} className="console-text-action min-h-11 font-semibold">重新加载</button>
                        </div>
                    ) : keys.length === 0 ? (
                        <div className="console-empty m-5 flex min-h-32 items-center justify-center px-4 text-center text-sm">
                            {searchQuery.trim() || statusFilter !== 'all' ? '没有符合筛选条件的密钥' : '暂无 API 密钥'}
                        </div>
                    ) : (
                        <div className="console-data-list">
                            {keys.map((item) => {
                                const name = typeof item.name === 'string' ? item.name : ''
                                const value = typeof item.key === 'string' ? item.key.trim() : ''
                                const maskedKey = value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value ? '••••••••' : '未返回密钥'
                                const isActive = item.status === 'active'
                                const statusLabel = KEY_STATUS_LABELS[item.status] ?? '不可用'
                                const statusClass = isActive ? 'is-success' : item.status === 'quota_exhausted' ? 'is-warning' : item.status === 'expired' ? 'is-danger' : ''
                                return (
                                    <article key={item.id} className="console-data-row grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-4 md:min-h-[4.75rem] md:grid-cols-[minmax(9rem,1.2fr)_minmax(13rem,1.8fr)_7rem_3rem] md:items-center">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-white" title={name || '未命名密钥'}>{name || '未命名密钥'}</p>
                                            <p className="console-muted mt-1 text-xs tabular-nums">ID {item.id}</p>
                                        </div>
                                        <code className="console-key-value col-start-1 row-start-2 w-fit max-w-full truncate px-2 py-1.5 text-xs md:col-start-auto md:row-start-auto" title={maskedKey}>{maskedKey}</code>
                                        <span className={`console-inline-status col-start-2 row-start-1 w-fit justify-self-end md:col-start-auto md:row-start-auto md:justify-self-start ${statusClass}`}>
                                            <span className="console-inline-status-dot" />
                                            {statusLabel}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => void handleCopy(item)}
                                            disabled={!value}
                                            className="console-icon-button col-start-2 row-start-2 justify-self-end md:col-start-auto md:row-start-auto"
                                            aria-label={copiedKeyId === item.id ? `“${name || '未命名密钥'}”已复制` : `复制“${name || '未命名密钥'}”`}
                                            title={copiedKeyId === item.id ? '已复制' : '复制密钥'}
                                        >
                                            {copiedKeyId === item.id ? <CheckIcon className="h-4 w-4 text-emerald-300" /> : <CopyIcon className="h-4 w-4" />}
                                        </button>
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </div>

                {pages > 1 && !error && (
                    <nav className="console-key-pagination flex items-center justify-between gap-3 px-4 py-3" aria-label="API 密钥分页">
                        <button
                            type="button"
                            onClick={() => void loadKeys(page - 1, searchQuery, statusFilter)}
                            disabled={isLoading || page <= 1}
                            className="console-button console-button--secondary w-11 px-0 sm:w-auto sm:px-3"
                            aria-label="上一页"
                        >
                            <ChevronLeftIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">上一页</span>
                        </button>
                        <span className="console-muted text-center text-xs tabular-nums">
                            第 {page} / {pages} 页<span className="hidden sm:inline"> · 共 {total.toLocaleString('zh-CN')} 个</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => void loadKeys(page + 1, searchQuery, statusFilter)}
                            disabled={isLoading || page >= pages}
                            className="console-button console-button--secondary w-11 px-0 sm:w-auto sm:px-3"
                            aria-label="下一页"
                        >
                            <span className="hidden sm:inline">下一页</span>
                            <ChevronRightIcon className="h-4 w-4" />
                        </button>
                    </nav>
                )}
            </section>
        </div>
    )
}
