import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createAgentPresentationBlob, getAgentPresentationImageRefs, parseAgentPresentationCallArguments, sanitizePresentationFileName } from './presentation'

const buildArgs = (patch: Record<string, unknown> = {}) => JSON.stringify({
  title: '季度产品复盘',
  subtitle: '从数据到行动',
  file_name: '季度:复盘?.pptx',
  aspect_ratio: 'wide',
  theme: 'light',
  accent_color: '#16A34A',
  footer: '产品团队',
  slides: [
    {
      layout: 'title',
      title: '季度产品复盘',
      subtitle: '从数据到行动',
      bullets: [],
      image_ref: null,
      notes: '开场说明',
    },
    {
      layout: 'split',
      title: '核心进展',
      subtitle: '本季度完成情况',
      bullets: ['完成关键能力交付', '用户留存持续提升'],
      image_ref: '<ref id="round-1-image-1" />',
      notes: null,
    },
  ],
  ...patch,
})

describe('presentation', () => {
  it('normalizes external tool arguments and image references', () => {
    const spec = parseAgentPresentationCallArguments(buildArgs())

    expect(spec).toMatchObject({
      title: '季度产品复盘',
      fileName: '季度_复盘_.pptx',
      aspectRatio: 'wide',
      theme: 'light',
      accentColor: '16A34A',
    })
    expect(spec?.slides[1]).toMatchObject({ imageRef: 'round-1-image-1' })
    expect(getAgentPresentationImageRefs(spec!)).toEqual(['round-1-image-1'])
  })

  it('limits slide and bullet counts from model output', () => {
    const slides = Array.from({ length: 45 }, (_, index) => ({
      layout: 'content',
      title: `第 ${index + 1} 页`,
      subtitle: null,
      bullets: Array.from({ length: 12 }, (_, bulletIndex) => `要点 ${bulletIndex + 1}`),
      image_ref: null,
      notes: null,
    }))
    const spec = parseAgentPresentationCallArguments(buildArgs({ slides }))

    expect(spec?.slides).toHaveLength(40)
    expect(spec?.slides[0].bullets).toHaveLength(8)
  })

  it('rejects invalid presentations and sanitizes fallback file names', () => {
    expect(parseAgentPresentationCallArguments('{}')).toBeNull()
    expect(parseAgentPresentationCallArguments('{')).toBeNull()
    expect(sanitizePresentationFileName(' .pptx')).toBe('presentation.pptx')
  })

  it('creates a valid PPTX archive with slides, notes, and embedded images', async () => {
    const spec = parseAgentPresentationCallArguments(buildArgs())!
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2V9sAAAAASUVORK5CYII='
    const blob = await createAgentPresentationBlob(spec, { 'round-1-image-1': image })
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()))

    expect(blob.size).toBeGreaterThan(10000)
    expect(archive['[Content_Types].xml']).toBeDefined()
    expect(archive['ppt/presentation.xml']).toBeDefined()
    expect(archive['ppt/slides/slide1.xml']).toBeDefined()
    expect(archive['ppt/slides/slide2.xml']).toBeDefined()
    expect(Object.keys(archive)).toContain('ppt/notesSlides/notesSlide1.xml')
    expect(Object.keys(archive).some((name) => name.startsWith('ppt/media/image'))).toBe(true)
  })
})
