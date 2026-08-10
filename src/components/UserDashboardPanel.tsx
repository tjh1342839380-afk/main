import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    getSub2ApiProfile,
    getSub2ApiDashboardModels,
    getSub2ApiDashboardStats,
    getSub2ApiDashboardTrend,
    listRecentSub2ApiUsage,
    type Sub2ApiDashboardStats,
    type Sub2ApiModelStat,
    type Sub2ApiTrendPoint,
    type Sub2ApiUsageLog,
    type Sub2ApiUser,
} from '../lib/sub2apiAuth'
import { RefreshIcon } from './icons'

interface UserDashboardPanelProps {
    user: Sub2ApiUser
    onUserChange: (user: Sub2ApiUser) => void
}

interface DashboardData {
    stats: Sub2ApiDashboardStats
    trend: Sub2ApiTrendPoint[]
    models: Sub2ApiModelStat[]
    usage: Sub2ApiUsageLog[]
}

type RangeDays = 7 | 30
type TrendKey = 'input_tokens' | 'output_tokens' | 'cache_creation_tokens' | 'cache_read_tokens'

const MODEL_COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#60a5fa', '#2dd4bf', '#f472b6']
const TREND_SERIES: Array<{ key: TrendKey; label: string; color: string }> = [
    { key: 'input_tokens', label: '输入', color: '#22d3ee' },
    { key: 'output_tokens', label: '输出', color: '#34d399' },
    { key: 'cache_creation_tokens', label: '缓存写入', color: '#fbbf24' },
    { key: 'cache_read_tokens', label: '缓存读取', color: '#a78bfa' },
]

function formatLocalDate(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function formatCompact(value: number) {
    if (!Number.isFinite(value)) return '0'
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return Math.round(value).toLocaleString('zh-CN')
}

function formatCost(value: number, digits = 4) {
    if (!Number.isFinite(value)) return '$0.0000'
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function formatDuration(value: number) {
    if (!Number.isFinite(value) || value <= 0) return '0ms'
    if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
    return `${Math.round(value)}ms`
}

function formatDateTime(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value || '-'
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)
}

export default function UserDashboardPanel({ user, onUserChange }: UserDashboardPanelProps) {
    const requestIdRef = useRef(0)
    const [rangeDays, setRangeDays] = useState<RangeDays>(7)
    const [data, setData] = useState<DashboardData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

    const loadDashboard = useCallback(async () => {
        const requestId = ++requestIdRef.current
        setIsLoading(true)
        setError('')

        const endDate = new Date()
        const startDate = new Date(endDate)
        startDate.setDate(startDate.getDate() - rangeDays + 1)
        const params = {
            start_date: formatLocalDate(startDate),
            end_date: formatLocalDate(endDate),
            granularity: 'day' as const,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
        }

        try {
            const [profile, stats, trend, models, usage] = await Promise.all([
                getSub2ApiProfile(),
                getSub2ApiDashboardStats(),
                getSub2ApiDashboardTrend(params),
                getSub2ApiDashboardModels({
                    start_date: params.start_date,
                    end_date: params.end_date,
                    timezone: params.timezone,
                }),
                listRecentSub2ApiUsage(),
            ])
            if (requestId !== requestIdRef.current) return
            setData({
                stats,
                trend: Array.isArray(trend.trend) ? trend.trend : [],
                models: Array.isArray(models.models) ? models.models : [],
                usage: Array.isArray(usage.items) ? usage.items : [],
            })
            onUserChange(profile)
            setUpdatedAt(new Date())
        } catch (err) {
            if (requestId !== requestIdRef.current) return
            setError(err instanceof Error ? err.message : '仪表盘加载失败。')
        } finally {
            if (requestId === requestIdRef.current) setIsLoading(false)
        }
    }, [onUserChange, rangeDays])

    useEffect(() => {
        void loadDashboard()
        return () => {
            requestIdRef.current += 1
        }
    }, [loadDashboard])

    const sortedModels = useMemo(
        () => [...(data?.models ?? [])].sort((a, b) => b.total_tokens - a.total_tokens),
        [data?.models],
    )
    const modelTokenTotal = sortedModels.reduce((sum, item) => sum + Math.max(0, item.total_tokens || 0), 0)
    const modelGradient = useMemo(() => {
        if (modelTokenTotal <= 0) return '#1a2230'
        let cursor = 0
        return `conic-gradient(${sortedModels.map((item, idx) => {
            const start = cursor
            cursor += (Math.max(0, item.total_tokens || 0) / modelTokenTotal) * 100
            return `${MODEL_COLORS[idx % MODEL_COLORS.length]} ${start}% ${cursor}%`
        }).join(', ')})`
    }, [modelTokenTotal, sortedModels])

    const trendMax = Math.max(
        0,
        ...(data?.trend ?? []).flatMap((item) => TREND_SERIES.map((series) => Number(item[series.key]) || 0)),
    )
    const getTrendPoints = (key: TrendKey) => (data?.trend ?? []).map((item, idx, items) => {
        const x = items.length === 1 ? 320 : 24 + (idx / (items.length - 1)) * 592
        const y = 210 - ((Number(item[key]) || 0) / trendMax) * 164
        return `${x},${y}`
    }).join(' ')

    if (isLoading && !data) {
        return (
            <div role="status" aria-live="polite" aria-label="正在加载仪表盘" className="console-page space-y-6">
                <div className="console-skeleton h-24 rounded-lg" />
                <div className="console-dashboard-metrics console-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 8 }, (_, idx) => (
                        <div key={idx} className="console-skeleton h-28 rounded-lg" />
                    ))}
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                    <div className="console-skeleton h-80 rounded-lg" />
                    <div className="console-skeleton h-80 rounded-lg" />
                </div>
            </div>
        )
    }

    if (error && !data) {
        return (
            <section role="alert" className="console-page console-error-panel flex min-h-80 flex-col items-center justify-center px-6 text-center">
                <h1 className="text-lg font-semibold text-red-100">仪表盘暂时无法加载</h1>
                <p className="mt-2 max-w-md text-sm text-red-200/80">{error}</p>
                <button
                    type="button"
                    onClick={() => void loadDashboard()}
                    className="console-button console-button--danger mt-5"
                >
                    <RefreshIcon className="h-4 w-4" />
                    重新加载
                </button>
            </section>
        )
    }

    if (!data) return null

    const stats = data.stats
    const metricItems = [
        {
            label: '可用余额',
            value: formatCost(user.balance ?? 0, 2),
            detail: '当前账户余额',
            tone: 'success',
        },
        {
            label: 'API 密钥',
            value: stats.active_api_keys.toLocaleString('zh-CN'),
            detail: `${stats.total_api_keys.toLocaleString('zh-CN')} 个密钥`,
            tone: 'accent',
        },
        {
            label: '今日请求',
            value: stats.today_requests.toLocaleString('zh-CN'),
            detail: `累计 ${stats.total_requests.toLocaleString('zh-CN')}`,
            tone: 'accent',
        },
        {
            label: '今日消费',
            value: formatCost(stats.today_actual_cost),
            detail: `累计 ${formatCost(stats.total_actual_cost)}`,
            tone: 'warning',
        },
        {
            label: '今日 Token',
            value: formatCompact(stats.today_tokens),
            detail: `输入 ${formatCompact(stats.today_input_tokens)} / 输出 ${formatCompact(stats.today_output_tokens)}`,
            tone: 'accent',
        },
        {
            label: '累计 Token',
            value: formatCompact(stats.total_tokens),
            detail: `输入 ${formatCompact(stats.total_input_tokens)} / 输出 ${formatCompact(stats.total_output_tokens)}`,
            tone: 'accent',
        },
        {
            label: '性能指标',
            value: `${formatCompact(stats.rpm)} RPM`,
            detail: `${formatCompact(stats.tpm)} TPM`,
            tone: 'success',
        },
        {
            label: '平均响应',
            value: formatDuration(stats.average_duration_ms),
            detail: '请求平均耗时',
            tone: 'warning',
        },
    ]

    return (
        <div className="console-page space-y-6">
            <header className="console-page-header">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="console-page-title">用量仪表盘</h1>
                        <p className="console-page-description mt-2 text-sm">查看账户消耗、模型分布与 API 调用趋势</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="console-segmented grid h-11 grid-cols-2 p-1" aria-label="统计时间范围">
                            {([7, 30] as const).map((days) => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => {
                                        if (days === rangeDays) return
                                        setData(null)
                                        setRangeDays(days)
                                    }}
                                    className={`console-segmented-button ${rangeDays === days ? 'is-active' : ''}`}
                                    aria-pressed={rangeDays === days}
                                >
                                    {days} 天
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadDashboard()}
                            disabled={isLoading}
                            className="console-icon-button"
                            aria-label="刷新仪表盘"
                            title="刷新仪表盘"
                        >
                            <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
                <p className={`mt-3 min-h-5 text-xs ${error ? 'text-red-300' : 'console-muted'}`} aria-live="polite">
                    {error ? `刷新失败：${error}` : updatedAt ? `更新于 ${updatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}
                </p>
            </header>

            <section aria-label="账户用量概览">
                <div className="console-dashboard-metrics console-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {metricItems.map((item) => (
                        <article key={item.label} className={`console-metric console-tone-${item.tone}`}>
                            <span className="console-metric-signal" aria-hidden="true" />
                            <p className="console-metric-label">{item.label}</p>
                            <p className="console-metric-value mt-2 break-words tabular-nums">{item.value}</p>
                            <p className="console-metric-detail mt-1 leading-5">{item.detail}</p>
                        </article>
                    ))}
                </div>
            </section>

            {stats.by_platform && stats.by_platform.length > 0 ? (
                <section className="console-panel overflow-hidden">
                    <div className="console-panel-header flex min-h-16 items-center justify-between gap-4 px-5 py-3">
                        <h2 className="console-panel-title">按平台拆分</h2>
                        <span className="console-muted text-xs">{stats.by_platform.length} 个平台</span>
                    </div>
                    <div className="console-platform-grid grid sm:grid-cols-2">
                        {stats.by_platform.map((item) => (
                            <article key={item.platform} className="console-platform-item px-5 py-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="truncate text-sm font-semibold capitalize text-white">{item.platform}</p>
                                    <p className="console-success-text shrink-0 font-mono text-sm font-semibold">{formatCost(item.total_actual_cost)}</p>
                                </div>
                                <p className="console-muted mt-2 text-xs">
                                    今日 {formatCost(item.today_actual_cost)} · {item.total_requests.toLocaleString('zh-CN')} 次 · {formatCompact(item.total_tokens)} Token
                                </p>
                            </article>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
                <div className="console-panel min-w-0 p-5">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="console-panel-title">模型分布</h2>
                        <span className="console-muted text-xs">按 Token 统计</span>
                    </div>
                    {sortedModels.length === 0 || modelTokenTotal <= 0 ? (
                        <div className="console-empty mt-4 flex h-64 items-center justify-center text-sm">暂无模型用量</div>
                    ) : (
                        <div className="mt-4 grid items-center gap-6 sm:grid-cols-[10rem_minmax(0,1fr)]">
                            <div className="console-donut relative mx-auto aspect-square w-40 shrink-0 rounded-full" style={{ background: modelGradient }} role="img" aria-label="模型 Token 分布环形图">
                                <div className="console-donut-core absolute inset-7 flex items-center justify-center rounded-full text-center">
                                    <span>
                                        <span className="block text-lg font-bold tabular-nums text-white">{formatCompact(modelTokenTotal)}</span>
                                        <span className="console-muted mt-1 block text-xs">总 Token</span>
                                    </span>
                                </div>
                            </div>
                            <div className="max-h-64 min-w-0 overflow-y-auto">
                                <div>
                                    <div className="console-table-header grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] gap-2 pb-2 text-xs sm:grid-cols-[minmax(0,1fr)_4rem_5rem] sm:gap-3">
                                        <span>模型</span>
                                        <span className="text-right">Token</span>
                                        <span className="text-right">实际消费</span>
                                    </div>
                                    {sortedModels.map((item, idx) => (
                                        <div key={item.model} className="console-table-row grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] items-center gap-2 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_4rem_5rem] sm:gap-3">
                                            <span className="flex min-w-0 items-center gap-2">
                                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length] }} />
                                                <span className="truncate font-medium" title={item.model}>{item.model}</span>
                                            </span>
                                            <span className="console-secondary-text text-right tabular-nums">{formatCompact(item.total_tokens)}</span>
                                            <span className="console-success-text text-right tabular-nums">{formatCost(item.actual_cost)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="console-panel min-w-0 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="console-panel-title">Token 使用趋势</h2>
                        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                            {TREND_SERIES.map((series) => (
                                <span key={series.key} className="console-muted flex items-center gap-1.5 text-xs">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
                                    {series.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    {data.trend.length === 0 || trendMax <= 0 ? (
                        <div className="console-empty mt-4 flex h-64 items-center justify-center px-4 text-center text-sm">所选时间范围暂无趋势数据</div>
                    ) : (
                        <div className="mt-4">
                            <div className="console-chart aspect-[16/7] min-h-52 w-full overflow-hidden rounded-lg">
                                <svg viewBox="0 0 640 240" className="h-full w-full" role="img" aria-label={`近 ${rangeDays} 天 Token 使用趋势`} preserveAspectRatio="none">
                                    <title>近 {rangeDays} 天 Token 使用趋势</title>
                                    {[46, 87, 128, 169, 210].map((y) => (
                                        <line key={y} x1="24" x2="616" y1={y} y2={y} stroke="currentColor" className="console-chart-gridline" strokeWidth="1" />
                                    ))}
                                    {TREND_SERIES.map((series) => (
                                        <polyline
                                            key={series.key}
                                            points={getTrendPoints(series.key)}
                                            fill="none"
                                            stroke={series.color}
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            vectorEffect="non-scaling-stroke"
                                            pathLength={1}
                                            className="console-chart-line"
                                        />
                                    ))}
                                </svg>
                            </div>
                            <div className="console-muted mt-2 flex justify-between text-xs">
                                <span>{data.trend[0]?.date.slice(5)}</span>
                                <span>峰值 {formatCompact(trendMax)}</span>
                                <span>{data.trend[data.trend.length - 1]?.date.slice(5)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="console-panel overflow-hidden">
                <div className="console-panel-header flex min-h-16 items-center justify-between gap-4 px-5 py-3">
                    <h2 className="console-panel-title">最近使用</h2>
                    <span className="console-muted text-xs">最近 5 条</span>
                </div>
                {data.usage.length === 0 ? (
                    <div className="console-empty m-5 flex min-h-28 items-center justify-center text-sm">暂无 API 调用记录</div>
                ) : (
                    <div className="console-data-list">
                        {data.usage.map((item) => (
                            <article key={item.id} className="console-data-row grid min-h-[4.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white" title={item.model}>{item.model || '未知模型'}</p>
                                    <p className="console-muted mt-1 text-xs">{formatDateTime(item.created_at)} · {formatCompact(item.input_tokens + item.output_tokens)} Token</p>
                                </div>
                                <div className="text-right">
                                    <p className="console-success-text font-mono text-sm font-semibold">{formatCost(item.actual_cost)}</p>
                                    <p className="console-muted mt-1 text-xs">标准 {formatCost(item.total_cost)}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
