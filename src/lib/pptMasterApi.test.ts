import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  analyzePptxWithPptMaster,
  checkPptMasterHealth,
  createPptMasterFillPlan,
  fillPptxWithPptMaster,
  formatPptMasterAnalysisContext,
  normalizePptMasterApiUrl,
  parsePptMasterFillCallArguments,
} from './pptMasterApi'

const PPTX_DATA_URL = 'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,UEsDBA=='

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PPT Master API', () => {
  it('normalizes service URLs and rejects unsupported protocols', () => {
    expect(normalizePptMasterApiUrl(' https://ppt.example.com/// ')).toBe('https://ppt.example.com')
    expect(normalizePptMasterApiUrl('/ppt-worker/')).toBe('/ppt-worker')
    expect(() => normalizePptMasterApiUrl('ftp://ppt.example.com')).toThrow('HTTP(S)')
  })

  it('checks service health with an optional bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'ok',
      ppt_master_version: 'v4.1.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(checkPptMasterHealth('https://ppt.example.com/', 'secret')).resolves.toEqual({
      status: 'ok',
      pptMasterVersion: 'v4.1.0',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://ppt.example.com/v1/health', expect.objectContaining({
      headers: { Authorization: 'Bearer secret' },
    }))
  })

  it('uploads and validates PPTX analysis results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ppt_master_version: 'v4.1.0',
      slide_count: 3,
      analysis_text: 'slide 1 slot s01_sh2',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const result = await analyzePptxWithPptMaster({
      apiUrl: 'https://ppt.example.com',
      token: '',
      fileName: '模板.pptx',
      dataUrl: PPTX_DATA_URL,
    })

    expect(result).toEqual({
      pptMasterVersion: 'v4.1.0',
      slideCount: 3,
      text: 'slide 1 slot s01_sh2',
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
  })

  it('returns generated PPTX data from the fill endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([80, 75, 3, 4]), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'X-PPT-Master-Version': 'v4.1.0',
      },
    }))

    const result = await fillPptxWithPptMaster({
      apiUrl: 'https://ppt.example.com',
      token: '',
      fileName: '模板.pptx',
      dataUrl: PPTX_DATA_URL,
      outputName: '输出.pptx',
      plan: { status: 'confirmed', slides: [] },
    })

    expect(result.size).toBe(4)
    expect(result.serviceVersion).toBe('v4.1.0')
    expect(result.dataUrl).toMatch(/^data:application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation;base64,/)
  })

  it('parses model arguments and creates the PPT Master plan contract', () => {
    const spec = parsePptMasterFillCallArguments(JSON.stringify({
      template_file_id: 'agent-file-template',
      file_name: '季度复盘.pptx',
      slides: [{
        source_slide: 2,
        purpose: '业绩概览',
        layout_pattern: '标题 + 图表',
        why_fit: '匹配单图表信息层级',
        risk: '标题需简短',
        notes: '介绍本季度增长。',
        transition: 'fade',
        replacements: [{ slot_id: 's02_sh3', text: '2026 Q2 业绩' }],
        table_edits: [],
        chart_edits: [{
          chart_id: 's02_ch4',
          categories: ['四月', '五月'],
          series: [{ name: '营收', values: [10, 12] }],
        }],
      }],
    }))

    expect(spec).not.toBeNull()
    expect(spec?.fileName).toBe('季度复盘.pptx')
    expect(createPptMasterFillPlan(spec!, '模板.pptx')).toMatchObject({
      schema: 'template_fill_pptx_plan.v1',
      status: 'confirmed',
      source_pptx: '模板.pptx',
      slides: [{
        source_slide: 2,
        replacements: [{ slot_id: 's02_sh3', text: '2026 Q2 业绩' }],
        chart_edits: [{ chart_id: 's02_ch4' }],
      }],
    })
  })

  it('wraps cached analysis with stable file metadata', () => {
    const text = formatPptMasterAnalysisContext({
      id: 'agent-file-1',
      name: '品牌"模板.pptx',
      mimeType: 'application/octet-stream',
      size: 1,
    }, {
      apiUrl: 'https://ppt.example.com',
      serviceVersion: 'v4.1.0',
      analyzedAt: 1,
      slideCount: 2,
      text: 'slot s01_sh2',
    })

    expect(text).toContain('file_id="agent-file-1"')
    expect(text).toContain('filename="品牌&quot;模板.pptx"')
    expect(text).toContain('slot s01_sh2')
  })
})
