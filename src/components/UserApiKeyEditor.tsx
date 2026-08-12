import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
    createSub2ApiKey,
    updateSub2ApiKey,
    type Sub2ApiApiKey,
    type Sub2ApiGroup,
} from '../lib/sub2apiAuth'
import { CloseIcon, EditIcon, KeyIcon, PlusIcon } from './icons'

interface UserApiKeyEditorProps {
    item: Sub2ApiApiKey | null
    groups: Sub2ApiGroup[]
    onClose: () => void
    onSaved: (item: Sub2ApiApiKey, created: boolean) => Promise<void>
}

function toLocalDateTime(value?: string | null) {
    if (!value) return ''
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function parseAddresses(value: string) {
    return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)
}

function parseLimit(value: string) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? number : 0
}

export default function UserApiKeyEditor({ item, groups, onClose, onSaved }: UserApiKeyEditorProps) {
    const nameRef = useRef<HTMLInputElement>(null)
    const isEditing = Boolean(item)
    const [name, setName] = useState(item?.name || '')
    const [groupId, setGroupId] = useState(item?.group_id == null ? '' : String(item.group_id))
    const [quota, setQuota] = useState(item?.quota && item.quota > 0 ? String(item.quota) : '')
    const [expiration, setExpiration] = useState(isEditing ? toLocalDateTime(item?.expires_at) : '')
    const [ipWhitelist, setIpWhitelist] = useState(item?.ip_whitelist?.join(', ') || '')
    const [ipBlacklist, setIpBlacklist] = useState(item?.ip_blacklist?.join(', ') || '')
    const [rateLimit5h, setRateLimit5h] = useState(item?.rate_limit_5h ? String(item.rate_limit_5h) : '')
    const [rateLimit1d, setRateLimit1d] = useState(item?.rate_limit_1d ? String(item.rate_limit_1d) : '')
    const [rateLimit7d, setRateLimit7d] = useState(item?.rate_limit_7d ? String(item.rate_limit_7d) : '')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => nameRef.current?.focus())
        return () => window.cancelAnimationFrame(frame)
    }, [])

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const trimmedName = name.trim()
        if (!trimmedName || isSubmitting) return

        setIsSubmitting(true)
        setError('')
        try {
            const parsedQuota = parseLimit(quota)
            const parsedWhitelist = parseAddresses(ipWhitelist)
            const parsedBlacklist = parseAddresses(ipBlacklist)
            const parsedRateLimit5h = parseLimit(rateLimit5h)
            const parsedRateLimit1d = parseLimit(rateLimit1d)
            const parsedRateLimit7d = parseLimit(rateLimit7d)
            const expirationDays = parseLimit(expiration)
            const shared = {
                name: trimmedName,
                group_id: groupId ? Number(groupId) : null,
                quota: parsedQuota,
                ip_whitelist: parsedWhitelist,
                ip_blacklist: parsedBlacklist,
                rate_limit_5h: parsedRateLimit5h,
                rate_limit_1d: parsedRateLimit1d,
                rate_limit_7d: parsedRateLimit7d,
            }
            const saved = item
                ? await updateSub2ApiKey(item.id, {
                    ...shared,
                    expires_at: expiration ? new Date(expiration).toISOString() : null,
                })
                : await createSub2ApiKey({
                    name: trimmedName,
                    ...(groupId ? { group_id: Number(groupId) } : {}),
                    ...(parsedQuota > 0 ? { quota: parsedQuota } : {}),
                    ...(expirationDays > 0 ? { expires_in_days: expirationDays } : {}),
                    ...(parsedWhitelist.length > 0 ? { ip_whitelist: parsedWhitelist } : {}),
                    ...(parsedBlacklist.length > 0 ? { ip_blacklist: parsedBlacklist } : {}),
                    ...(parsedRateLimit5h > 0 ? { rate_limit_5h: parsedRateLimit5h } : {}),
                    ...(parsedRateLimit1d > 0 ? { rate_limit_1d: parsedRateLimit1d } : {}),
                    ...(parsedRateLimit7d > 0 ? { rate_limit_7d: parsedRateLimit7d } : {}),
                })
            await onSaved(saved, !item)
        } catch (err) {
            setError(err instanceof Error ? err.message : `API 密钥${isEditing ? '更新' : '创建'}失败。`)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <section className="console-key-editor console-panel p-5" aria-labelledby="console-api-key-editor-title">
            <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="console-panel-icon">
                        {isEditing ? <EditIcon className="h-4 w-4" /> : <KeyIcon className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                        <h2 id="console-api-key-editor-title" className="console-panel-title">{isEditing ? '编辑 API 密钥' : '创建 API 密钥'}</h2>
                        {isEditing && <p className="console-muted mt-1 truncate text-xs tabular-nums">ID {item?.id}</p>}
                    </div>
                </div>
                <button type="button" onClick={onClose} className="console-icon-button" aria-label="关闭密钥表单" title="关闭">
                    <CloseIcon className="h-4 w-4" />
                </button>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label htmlFor="console-api-key-name" className="console-field-label block xl:col-span-2">
                        密钥名称
                        <input
                            ref={nameRef}
                            id="console-api-key-name"
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={80}
                            className="console-input mt-2"
                            aria-invalid={Boolean(error)}
                        />
                    </label>
                    <label htmlFor="console-api-key-group" className="console-field-label block">
                        绑定分组
                        <select id="console-api-key-group" value={groupId} onChange={(event) => setGroupId(event.target.value)} className="console-input mt-2">
                            <option value="">不指定分组</option>
                            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                    </label>
                    <label htmlFor="console-api-key-quota" className="console-field-label block">
                        额度上限（USD）
                        <input
                            id="console-api-key-quota"
                            type="number"
                            value={quota}
                            onChange={(event) => setQuota(event.target.value)}
                            min="0"
                            step="0.01"
                            placeholder="0 = 不限额"
                            className="console-input mt-2"
                        />
                    </label>
                    <label htmlFor="console-api-key-expiration" className="console-field-label block md:col-span-2 xl:col-span-1">
                        {isEditing ? '到期时间' : '有效天数'}
                        <input
                            id="console-api-key-expiration"
                            type={isEditing ? 'datetime-local' : 'number'}
                            value={expiration}
                            onChange={(event) => setExpiration(event.target.value)}
                            min={isEditing ? undefined : '1'}
                            step={isEditing ? undefined : '1'}
                            placeholder={isEditing ? undefined : '留空为永久有效'}
                            className="console-input mt-2"
                        />
                    </label>
                </div>

                <details className="console-key-advanced">
                    <summary>访问限制与周期限额</summary>
                    <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                        <label htmlFor="console-api-key-rate-5h" className="console-field-label block">
                            5 小时限额（USD）
                            <input id="console-api-key-rate-5h" type="number" value={rateLimit5h} onChange={(event) => setRateLimit5h(event.target.value)} min="0" step="0.01" placeholder="0 = 不限制" className="console-input mt-2" />
                        </label>
                        <label htmlFor="console-api-key-rate-1d" className="console-field-label block">
                            每日限额（USD）
                            <input id="console-api-key-rate-1d" type="number" value={rateLimit1d} onChange={(event) => setRateLimit1d(event.target.value)} min="0" step="0.01" placeholder="0 = 不限制" className="console-input mt-2" />
                        </label>
                        <label htmlFor="console-api-key-rate-7d" className="console-field-label block">
                            7 天限额（USD）
                            <input id="console-api-key-rate-7d" type="number" value={rateLimit7d} onChange={(event) => setRateLimit7d(event.target.value)} min="0" step="0.01" placeholder="0 = 不限制" className="console-input mt-2" />
                        </label>
                        <label htmlFor="console-api-key-ip-whitelist" className="console-field-label block md:col-span-2 xl:col-span-3">
                            IP 白名单
                            <textarea id="console-api-key-ip-whitelist" value={ipWhitelist} onChange={(event) => setIpWhitelist(event.target.value)} rows={2} placeholder="多个 IP 使用逗号或换行分隔" className="console-input mt-2 min-h-20 resize-y py-3" />
                        </label>
                        <label htmlFor="console-api-key-ip-blacklist" className="console-field-label block md:col-span-2 xl:col-span-3">
                            IP 黑名单
                            <textarea id="console-api-key-ip-blacklist" value={ipBlacklist} onChange={(event) => setIpBlacklist(event.target.value)} rows={2} placeholder="多个 IP 使用逗号或换行分隔" className="console-input mt-2 min-h-20 resize-y py-3" />
                        </label>
                    </div>
                </details>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p role="alert" className="min-h-5 text-sm text-rose-300">{error}</p>
                    <div className="flex gap-2 sm:shrink-0">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="console-button console-button--secondary flex-1 sm:flex-none">取消</button>
                        <button type="submit" disabled={isSubmitting || !name.trim()} className="console-button console-button--primary flex-1 sm:flex-none">
                            {isEditing ? <EditIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                            {isSubmitting ? '保存中' : isEditing ? '保存修改' : '创建密钥'}
                        </button>
                    </div>
                </div>
            </form>
        </section>
    )
}
