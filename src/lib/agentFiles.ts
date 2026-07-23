import type { AgentReferenceFile } from '../types'

const MIME_BY_EXTENSION: Record<string, string> = {
    pdf: 'application/pdf',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    html: 'text/html',
    htm: 'text/html',
    xml: 'application/xml',
}

export const AGENT_REFERENCE_FILE_MAX_BYTES = 50 * 1024 * 1024
export const AGENT_REFERENCE_FILE_ACCEPT = Object.keys(MIME_BY_EXTENSION).map((ext) => `.${ext}`).join(',')

export function getAgentReferenceFileExtension(name: string) {
    const ext = name.split('.').pop()?.trim().toLowerCase() ?? ''
    return ext && ext !== name.toLowerCase() ? ext : ''
}

export function isSupportedAgentReferenceFile(file: Pick<File, 'name'>) {
    return Boolean(MIME_BY_EXTENSION[getAgentReferenceFileExtension(file.name)])
}

export function getAgentReferenceFileMimeType(file: Pick<File, 'name' | 'type'>) {
    return MIME_BY_EXTENSION[getAgentReferenceFileExtension(file.name)] || file.type || 'application/octet-stream'
}

export function validateAgentReferenceFiles(
    files: Array<Pick<File, 'name' | 'size'>>,
    existing: AgentReferenceFile[] = [],
) {
    for (const file of files) {
        if (!isSupportedAgentReferenceFile(file)) {
            throw new Error(`不支持“${file.name}”的文件格式`)
        }
        if (file.size <= 0) {
            throw new Error(`“${file.name}”是空文件`)
        }
        if (file.size > AGENT_REFERENCE_FILE_MAX_BYTES) {
            throw new Error(`“${file.name}”超过 50 MB 上限`)
        }
    }

    const total = existing.reduce((sum, file) => sum + file.size, 0)
        + files.reduce((sum, file) => sum + file.size, 0)
    if (total > AGENT_REFERENCE_FILE_MAX_BYTES) {
        throw new Error('单次 Agent 请求的参考文件总大小不能超过 50 MB')
    }
}

export function formatAgentReferenceFileSize(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
    return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
