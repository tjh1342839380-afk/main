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

const MODEL_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']
const TREND_SERIES: Array<{ key: TrendKey; label: string; color: string }> = [
    { key: 'input_tokens', label: '输入', color: '#2563eb' },
    { key: 'output_tokens', label: '输出', color: '#059669' },
    { key: 'cache_creation_tokens', label: '缓存写入', color: '#d97706' },
    { key: 'cache_read_tokens', label: '缓存读取', color: '#0891b2' },
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
        if (modelTokenTotal <= 0) return '#e5e7eb'
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
            <div aria-label="正在加载仪表盘" className="space-y-6">
                <div className="h-20 animate-pulse rounded-lg bg-gray-200/70 dark:bg-white/[0.06]" />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {Array.from({ length: 8 }, (_, idx) => (
                        <div key={idx} className="h-28 animate-pulse rounded-lg bg-gray-200/70 dark:bg-white/[0.06]" />
                    ))}
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="h-72 animate-pulse rounded-lg bg-gray-200/70 dark:bg-white/[0.06]" />
                    <div className="h-72 animate-pulse rounded-lg bg-gray-200/70 dark:bg-white/[0.06]" />
                </div>
            </div>
        )
    }

    if (error && !data) {
        return (
            <section className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 px-6 text-center dark:border-red-500/20 dark:bg-red-500/10">
                <h1 className="text-lg font-semibold text-red-800 dark:text-red-100">仪表盘暂时无法加载</h1>
                <p className="mt-2 max-w-md text-sm text-red-700 dark:text-red-200">{error}</p>
                <button
                    type="button"
                    onClick={() => void loadDashboard()}
                    className="mt-5 flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-800 dark:bg-red-500 dark:hover:bg-red-400"
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
            color: 'text-emerald-600 dark:text-emerald-300',
            accent: 'bg-emerald-500',
        },
        {
            label: 'API 密钥',
            value: stats.active_api_keys.toLocaleString('zh-CN'),
            detail: `${stats.total_api_keys.toLocaleString('zh-CN')} 个密钥`,
            color: 'text-blue-600 dark:text-blue-300',
            accent: 'bg-blue-500',
        },
        {
            label: '今日请求',
            value: stats.today_requests.toLocaleString('zh-CN'),
            detail: `累计 ${stats.total_requests.toLocaleString('zh-CN')}`,
            color: 'text-gray-950 dark:text-white',
            accent: 'bg-cyan-500',
        },
        {
            label: '今日消费',
            value: formatCost(stats.today_actual_cost),
            detail: `累计 ${formatCost(stats.total_actual_cost)}`,
            color: 'text-violet-600 dark:text-violet-300',
            accent: 'bg-violet-500',
        },
        {
            label: '今日 Token',
            value: formatCompact(stats.today_tokens),
            detail: `输入 ${formatCompact(stats.today_input_tokens)} / 输出 ${formatCompact(stats.today_output_tokens)}`,
            color: 'text-gray-950 dark:text-white',
            accent: 'bg-amber-500',
        },
        {
            label: '累计 Token',
            value: formatCompact(stats.total_tokens),
            detail: `输入 ${formatCompact(stats.total_input_tokens)} / 输出 ${formatCompact(stats.total_output_tokens)}`,
            color: 'text-gray-950 dark:text-white',
            accent: 'bg-indigo-500',
        },
        {
            label: '性能指标',
            value: `${formatCompact(stats.rpm)} RPM`,
            detail: `${formatCompact(stats.tpm)} TPM`,
            color: 'text-gray-950 dark:text-white',
            accent: 'bg-fuchsia-500',
        },
        {
            label: '平均响应',
            value: formatDuration(stats.average_duration_ms),
            detail: '请求平均耗时',
            color: 'text-gray-950 dark:text-white',
            accent: 'bg-rose-500',
        },
    ]

    return (
        <div className="space-y-8">
            <section className="border-b border-gray-200 pb-6 dark:border-white/[0.08]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-950 dark:text-white">用量仪表盘</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看账户消耗、模型分布与 API 调用趋势</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="grid h-9 grid-cols-2 rounded-lg bg-gray-100 p-1 dark:bg-white/[0.06]" aria-label="统计时间范围">
                            {([7, 30] as const).map((days) => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => {
                                        if (days === rangeDays) return
                                        setData(null)
                                        setRangeDays(days)
                                    }}
                                    className={`rounded-md px-3 text-xs font-semibold transition-colors ${rangeDays === days ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
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
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-wait disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
                            aria-label="刷新仪表盘"
                            title="刷新仪表盘"
                        >
                            <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
                <p className="mt-4 text-xs text-gray-400 dark:text-gray-500" aria-live="polite">
                    {error ? `刷新失败：${error}` : updatedAt ? `更新于 ${updatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}
                </p>
            </section>

            <section aria-label="账户用量概览">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {metricItems.map((item) => (
                        <article key={item.label} className="relative min-h-28 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                            <span className={`absolute inset-y-0 left-0 w-1 ${item.accent}`} />
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{item.label}</p>
                            <p className={`mt-2 break-words text-xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
                            <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400" title={item.detail}>{item.detail}</p>
                        </article>
                    ))}
                </div>
            </section>

            {stats.by_platform && stats.by_platform.length > 0 ? (
                <section className="border-y border-gray-200 py-6 dark:border-white/[0.08]">
                    <div className="flex items-center justify-between gap-4">
                        <h2 className="text-base font-semibold">按平台拆分</h2>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{stats.by_platform.length} 个平台</span>
                    </div>
                    <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-2 dark:border-white/[0.08] dark:bg-white/[0.08]">
                        {stats.by_platform.map((item) => (
                            <article key={item.platform} className="bg-white px-4 py-3 dark:bg-gray-950">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="truncate text-sm font-semibold capitalize">{item.platform}</p>
                                    <p className="shrink-0 font-mono text-sm text-violet-600 dark:text-violet-300">{formatCost(item.total_actual_cost)}</p>
                                </div>
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    今日 {formatCost(item.today_actual_cost)} · {item.total_requests.toLocaleString('zh-CN')} 次 · {formatCompact(item.total_tokens)} Token
                                </p>
                            </article>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="grid gap-8 lg:grid-cols-2">
                <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-base font-semibold">模型分布</h2>
                        <span className="text-xs text-gray-500 dark:text-gray-400">按 Token 统计</span>
                    </div>
                    {sortedModels.length === 0 || modelTokenTotal <= 0 ? (
                        <div className="mt-4 flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-white/[0.12] dark:text-gray-400">暂无模型用量</div>
                    ) : (
                        <div className="mt-4 grid items-center gap-6 sm:grid-cols-[10rem_minmax(0,1fr)]">
                            <div className="relative mx-auto aspect-square w-40 shrink-0 rounded-full" style={{ background: modelGradient }} role="img" aria-label="模型 Token 分布环形图">
                                <div className="absolute inset-7 flex items-center justify-center rounded-full bg-gray-50 text-center dark:bg-gray-950">
                                    <span>
                                        <span className="block text-lg font-bold tabular-nums">{formatCompact(modelTokenTotal)}</span>
                                        <span className="mt-0.5 block text-[10px] text-gray-500 dark:text-gray-400">总 Token</span>
                                    </span>
                                </div>
                            </div>
                            <div className="max-h-64 min-w-0 overflow-y-auto">
                                <div>
                                    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] gap-2 border-b border-gray-200 pb-2 text-[11px] text-gray-500 sm:grid-cols-[minmax(0,1fr)_4rem_5rem] sm:gap-3 dark:border-white/[0.08] dark:text-gray-400">
                                        <span>模型</span>
                                        <span className="text-right">Token</span>
                                        <span className="text-right">实际消费</span>
                                    </div>
                                    {sortedModels.map((item, idx) => (
                                        <div key={item.model} className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] items-center gap-2 border-b border-gray-100 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_4rem_5rem] sm:gap-3 last:border-b-0 dark:border-white/[0.05]">
                                            <span className="flex min-w-0 items-center gap-2">
                                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length] }} />
                                                <span className="truncate font-medium" title={item.model}>{item.model}</span>
                                            </span>
                                            <span className="text-right tabular-nums text-gray-600 dark:text-gray-300">{formatCompact(item.total_tokens)}</span>
                                            <span className="text-right tabular-nums text-emerald-600 dark:text-emerald-300">{formatCost(item.actual_cost)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-base font-semibold">Token 使用趋势</h2>
                        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                            {TREND_SERIES.map((series) => (
                                <span key={series.key} className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: series.color }} />
                                    {series.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    {data.trend.length === 0 || trendMax <= 0 ? (
                        <div className="mt-4 flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-white/[0.12] dark:text-gray-400">所选时间范围暂无趋势数据</div>
                    ) : (
                        <div className="mt-4">
                            <div className="aspect-[16/7] min-h-52 w-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.02]">
                                <svg viewBox="0 0 640 240" className="h-full w-full" role="img" aria-label={`近 ${rangeDays} 天 Token 使用趋势`} preserveAspectRatio="none">
                                    <title>近 {rangeDays} 天 Token 使用趋势</title>
                                    {[46, 87, 128, 169, 210].map((y) => (
                                        <line key={y} x1="24" x2="616" y1={y} y2={y} stroke="currentColor" className="text-gray-200 dark:text-white/[0.08]" strokeWidth="1" />
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
                                        />
                                    ))}
                                </svg>
                            </div>
                            <div className="mt-2 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                                <span>{data.trend[0]?.date.slice(5)}</span>
                                <span>峰值 {formatCompact(trendMax)}</span>
                                <span>{data.trend[data.trend.length - 1]?.date.slice(5)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="border-t border-gray-200 pt-7 dark:border-white/[0.08]">
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-base font-semibold">最近使用</h2>
                    <span className="text-xs text-gray-500 dark:text-gray-400">最近 5 条</span>
                </div>
                {data.usage.length === 0 ? (
                    <div className="mt-4 flex min-h-28 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-white/[0.12] dark:text-gray-400">暂无 API 调用记录</div>
                ) : (
                    <div className="mt-4 divide-y divide-gray-200 border-y border-gray-200 dark:divide-white/[0.08] dark:border-white/[0.08]">
                        {data.usage.map((item) => (
                            <article key={item.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold" title={item.model}>{item.model || '未知模型'}</p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(item.created_at)} · {formatCompact(item.input_tokens + item.output_tokens)} Token</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-300">{formatCost(item.actual_cost)}</p>
                                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">标准 {formatCost(item.total_cost)}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
