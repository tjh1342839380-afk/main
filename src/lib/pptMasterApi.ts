import type { AgentReferenceFile, PptMasterFillSpec, StoredAgentReferenceFile } from '../types'
import { blobToDataUrl } from './dataUrl'

const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const MAX_ANALYSIS_TEXT_LENGTH = 60000
const MAX_FILL_SLIDES = 60

interface PptMasterHealthResponse {
  status: string
  pptMasterVersion: string
}

interface PptMasterAnalyzeResponse {
  pptMasterVersion: string
  slideCount: number
  text: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function readInteger(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const result = Math.trunc(value)
  return result >= min && result <= max ? result : null
}

function createHeaders(token: string) {
  return token.trim() ? { Authorization: `Bearer ${token.trim()}` } : undefined
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as Record<string, unknown>
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim()
  } catch {
    // 非 JSON 错误响应使用通用提示。
  }
  return `${fallback}（HTTP ${response.status}）`
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) throw new Error('PPTX 文件数据无效')
  const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: match[1] || PPTX_MIME_TYPE })
}

export function normalizePptMasterApiUrl(value: string) {
  const url = value.trim().replace(/\/+$/, '')
  if (!url) return ''
  if (url.startsWith('/')) return url
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    throw new Error('PPT Master 服务地址必须是有效的 HTTP(S) URL')
  }
}

export function isPptxFile(file: Pick<AgentReferenceFile, 'name' | 'mimeType'>) {
  return file.name.toLowerCase().endsWith('.pptx') || file.mimeType === PPTX_MIME_TYPE
}

export async function checkPptMasterHealth(apiUrl: string, token: string, signal?: AbortSignal): Promise<PptMasterHealthResponse> {
  const url = normalizePptMasterApiUrl(apiUrl)
  if (!url) throw new Error('请先填写 PPT Master 服务地址')
  const response = await fetch(`${url}/v1/health`, {
    headers: createHeaders(token),
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(await readError(response, 'PPT Master 服务连接失败'))
  const payload = await response.json() as Record<string, unknown>
  if (payload.status !== 'ok') throw new Error('PPT Master 服务未就绪')
  return {
    status: 'ok',
    pptMasterVersion: readText(payload.ppt_master_version, 40) || 'unknown',
  }
}

export async function analyzePptxWithPptMaster(opts: {
  apiUrl: string
  token: string
  fileName: string
  dataUrl: string
  signal?: AbortSignal
}): Promise<PptMasterAnalyzeResponse> {
  const apiUrl = normalizePptMasterApiUrl(opts.apiUrl)
  if (!apiUrl) throw new Error('未配置 PPT Master 服务')
  const form = new FormData()
  form.append('file', dataUrlToBlob(opts.dataUrl), opts.fileName)
  const response = await fetch(`${apiUrl}/v1/analyze`, {
    method: 'POST',
    headers: createHeaders(opts.token),
    body: form,
    cache: 'no-store',
    signal: opts.signal,
  })
  if (!response.ok) throw new Error(await readError(response, 'PPTX 分析失败'))
  const payload = await response.json() as Record<string, unknown>
  const slideCount = readInteger(payload.slide_count, 0, 10000)
  const text = readText(payload.analysis_text, MAX_ANALYSIS_TEXT_LENGTH)
  if (slideCount == null || !text) throw new Error('PPT Master 返回了无效的分析结果')
  return {
    pptMasterVersion: readText(payload.ppt_master_version, 40) || 'unknown',
    slideCount,
    text,
  }
}

export async function fillPptxWithPptMaster(opts: {
  apiUrl: string
  token: string
  fileName: string
  dataUrl: string
  outputName: string
  plan: Record<string, unknown>
  signal?: AbortSignal
}) {
  const apiUrl = normalizePptMasterApiUrl(opts.apiUrl)
  if (!apiUrl) throw new Error('未配置 PPT Master 服务')
  const form = new FormData()
  form.append('file', dataUrlToBlob(opts.dataUrl), opts.fileName)
  form.append('plan', JSON.stringify(opts.plan))
  form.append('output_name', opts.outputName)
  const response = await fetch(`${apiUrl}/v1/fill`, {
    method: 'POST',
    headers: createHeaders(opts.token),
    body: form,
    cache: 'no-store',
    signal: opts.signal,
  })
  if (!response.ok) throw new Error(await readError(response, 'PPTX 模板填充失败'))
  const blob = await response.blob()
  if (blob.size === 0) throw new Error('PPT Master 未返回 PPTX 文件')
  return {
    dataUrl: await blobToDataUrl(blob, PPTX_MIME_TYPE),
    size: blob.size,
    serviceVersion: response.headers.get('X-PPT-Master-Version') || 'unknown',
  }
}

export function formatPptMasterAnalysisContext(file: AgentReferenceFile, analysis: NonNullable<StoredAgentReferenceFile['pptMasterAnalysis']>) {
  const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const text = analysis.text.replace(/<\/?ppt_master_analysis/gi, '[ppt_master_analysis')
  return [
    `<ppt_master_analysis file_id="${escapeAttr(file.id)}" filename="${escapeAttr(file.name)}" service_version="${escapeAttr(analysis.serviceVersion)}" slide_count="${analysis.slideCount}">`,
    text,
    '</ppt_master_analysis>',
  ].join('\n')
}

export function parsePptMasterFillCallArguments(value: string): PptMasterFillSpec | null {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.slides) || parsed.slides.length === 0) return null
    const templateFileId = readText(parsed.template_file_id, 180)
    if (!templateFileId) return null
    const rawFileName = readText(parsed.file_name, 120).replace(/\.pptx?$/i, '')
    const safeFileName = rawFileName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 80)
    const slides = parsed.slides.slice(0, MAX_FILL_SLIDES).map((value) => {
      if (!isRecord(value)) return null
      const sourceSlide = readInteger(value.source_slide, 1, 10000)
      if (sourceSlide == null) return null
      const replacements = Array.isArray(value.replacements)
        ? value.replacements.slice(0, 100).map((item) => {
            if (!isRecord(item)) return null
            const slotId = readText(item.slot_id, 120)
            const text = readText(item.text, 5000)
            return slotId ? { slotId, text } : null
          }).filter((item): item is { slotId: string; text: string } => Boolean(item))
        : []
      const tableEdits = Array.isArray(value.table_edits)
        ? value.table_edits.slice(0, 20).map((item) => {
            if (!isRecord(item)) return null
            const tableId = readText(item.table_id, 120)
            const cells = Array.isArray(item.cells)
              ? item.cells.slice(0, 500).map((cell) => {
                  if (!isRecord(cell)) return null
                  const row = readInteger(cell.row, 0, 1000)
                  const col = readInteger(cell.col, 0, 1000)
                  if (row == null || col == null) return null
                  return { row, col, text: readText(cell.text, 5000) }
                }).filter((cell): cell is { row: number; col: number; text: string } => Boolean(cell))
              : []
            return tableId ? { tableId, cells } : null
          }).filter((item): item is NonNullable<typeof item> => Boolean(item))
        : []
      const chartEdits = Array.isArray(value.chart_edits)
        ? value.chart_edits.slice(0, 20).map((item) => {
            if (!isRecord(item)) return null
            const chartId = readText(item.chart_id, 120)
            const categories = Array.isArray(item.categories)
              ? item.categories.map((category) => readText(category, 500)).slice(0, 500)
              : []
            const series = Array.isArray(item.series)
              ? item.series.slice(0, 50).map((series) => {
                  if (!isRecord(series) || !Array.isArray(series.values)) return null
                  const values = series.values.filter((number): number is number => typeof number === 'number' && Number.isFinite(number)).slice(0, 500)
                  return { name: readText(series.name, 500), values }
                }).filter((series): series is { name: string; values: number[] } => Boolean(series))
              : []
            return chartId ? { chartId, categories, series } : null
          }).filter((item): item is NonNullable<typeof item> => Boolean(item))
        : []
      const notes = readText(value.notes, 5000)
      const transition = readText(value.transition, 20)
      return {
        sourceSlide,
        purpose: readText(value.purpose, 300) || `第 ${sourceSlide} 页`,
        layoutPattern: readText(value.layout_pattern, 500),
        whyFit: readText(value.why_fit, 1000),
        risk: readText(value.risk, 1000),
        replacements,
        tableEdits,
        chartEdits,
        ...(notes ? { notes } : {}),
        ...(transition ? { transition } : {}),
      }
    }).filter((slide): slide is NonNullable<typeof slide> => Boolean(slide))
    if (slides.length === 0) return null
    return {
      templateFileId,
      fileName: `${safeFileName || 'presentation'}.pptx`,
      slides,
    }
  } catch {
    return null
  }
}

export function createPptMasterFillPlan(spec: PptMasterFillSpec, sourceName: string): Record<string, unknown> {
  return {
    schema: 'template_fill_pptx_plan.v1',
    status: 'confirmed',
    source_pptx: sourceName,
    accepted_warnings: [],
    slides: spec.slides.map((slide) => ({
      source_slide: slide.sourceSlide,
      purpose: slide.purpose,
      layout_rationale: {
        layout_pattern: slide.layoutPattern,
        why_fit: slide.whyFit,
        risk: slide.risk,
      },
      ...(slide.notes ? { notes: slide.notes } : {}),
      ...(slide.transition ? { transition: slide.transition } : {}),
      replacements: slide.replacements.map((item) => ({ slot_id: item.slotId, text: item.text })),
      table_edits: slide.tableEdits.map((item) => ({
        table_id: item.tableId,
        cells: item.cells,
      })),
      chart_edits: slide.chartEdits.map((item) => ({
        chart_id: item.chartId,
        categories: item.categories,
        series: item.series,
      })),
    })),
  }
}

export function downloadPptxDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.click()
}
