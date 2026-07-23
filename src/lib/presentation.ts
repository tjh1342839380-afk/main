import type { AgentPresentationSlide, AgentPresentationSlideLayout, AgentPresentationSpec } from '../types'
import { extractAgentReferenceIds } from './agentImageReferences'

const PRESENTATION_LAYOUTS = new Set<AgentPresentationSlideLayout>(['title', 'section', 'content', 'image', 'split'])
const MAX_SLIDES = 40
const MAX_BULLETS = 8

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function normalizeImageRef(value: unknown) {
  const text = readText(value, 160)
  if (!text) return ''
  return extractAgentReferenceIds(text)[0] ?? text.replace(/^<ref\s+id=["']|["']\s*\/>$/g, '').trim()
}

export function sanitizePresentationFileName(value: string) {
  const name = value
    .replace(/\.pptx?$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80)
  return `${name || 'presentation'}.pptx`
}

export function parseAgentPresentationCallArguments(value: string): AgentPresentationSpec | null {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.slides) || parsed.slides.length === 0) return null

    const title = readText(parsed.title, 160)
    if (!title) return null

    const slides = parsed.slides
      .slice(0, MAX_SLIDES)
      .map((value, index): AgentPresentationSlide | null => {
        if (!isRecord(value)) return null
        const layout = typeof value.layout === 'string' && PRESENTATION_LAYOUTS.has(value.layout as AgentPresentationSlideLayout)
          ? value.layout as AgentPresentationSlideLayout
          : 'content'
        const slideTitle = readText(value.title, 180) || `第 ${index + 1} 页`
        const bullets = Array.isArray(value.bullets)
          ? value.bullets
              .map((item) => readText(item, 360))
              .filter(Boolean)
              .slice(0, MAX_BULLETS)
          : []
        const subtitle = readText(value.subtitle, 480)
        const imageRef = normalizeImageRef(value.image_ref ?? value.imageRef)
        const notes = readText(value.notes, 2000)

        return {
          layout,
          title: slideTitle,
          bullets,
          ...(subtitle ? { subtitle } : {}),
          ...(imageRef ? { imageRef } : {}),
          ...(notes ? { notes } : {}),
        }
      })
      .filter((slide): slide is AgentPresentationSlide => Boolean(slide))

    if (slides.length === 0) return null

    const theme = parsed.theme === 'dark' ? 'dark' : 'light'
    const accentColor = readText(parsed.accent_color ?? parsed.accentColor, 12).replace(/^#/, '').toUpperCase()
    const subtitle = readText(parsed.subtitle, 320)
    const footer = readText(parsed.footer, 160)
    const fileName = sanitizePresentationFileName(readText(parsed.file_name ?? parsed.fileName, 120) || title)

    return {
      title,
      fileName,
      aspectRatio: parsed.aspect_ratio === 'standard' || parsed.aspectRatio === 'standard' ? 'standard' : 'wide',
      theme,
      accentColor: /^[0-9A-F]{6}$/.test(accentColor) ? accentColor : theme === 'dark' ? '38BDF8' : '2563EB',
      slides,
      ...(subtitle ? { subtitle } : {}),
      ...(footer ? { footer } : {}),
    }
  } catch {
    return null
  }
}

export function getAgentPresentationImageRefs(spec: AgentPresentationSpec) {
  return Array.from(new Set(spec.slides.map((slide) => slide.imageRef).filter((ref): ref is string => Boolean(ref))))
}

export async function createAgentPresentationBlob(spec: AgentPresentationSpec, imagesByRef: Record<string, string>) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  const width = spec.aspectRatio === 'standard' ? 10 : 13.333
  const height = 7.5
  const dark = spec.theme === 'dark'
  const background = dark ? '111827' : 'F7F8FA'
  const surface = dark ? '1F2937' : 'FFFFFF'
  const text = dark ? 'F9FAFB' : '111827'
  const muted = dark ? 'CBD5E1' : '64748B'
  const border = dark ? '374151' : 'E2E8F0'
  const accent = spec.accentColor

  pptx.layout = spec.aspectRatio === 'standard' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE'
  pptx.author = 'GPT Image 2 For TJH'
  pptx.company = 'GPT Image 2 For TJH'
  pptx.subject = spec.subtitle || spec.title
  pptx.title = spec.title
  pptx.theme = {
    headFontFace: 'Microsoft YaHei',
    bodyFontFace: 'Microsoft YaHei',
  }

  for (let index = 0; index < spec.slides.length; index++) {
    const item = spec.slides[index]
    const slide = pptx.addSlide()
    const image = item.imageRef ? imagesByRef[item.imageRef] : undefined
    slide.background = { color: background }

    if (item.layout === 'title') {
      if (image) {
        slide.addImage({ data: image, x: 0, y: 0, w: width, h: height, sizing: { type: 'cover', w: width, h: height } })
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: width, h: height, line: { transparency: 100 }, fill: { color: '000000', transparency: 38 } })
      }
      slide.addShape(pptx.ShapeType.rect, { x: 0.75, y: 1.1, w: 0.08, h: 3.8, line: { transparency: 100 }, fill: { color: accent } })
      slide.addText(item.title, {
        x: 1.05,
        y: 1.35,
        w: width - 2,
        h: 2.05,
        fontFace: 'Microsoft YaHei',
        fontSize: spec.aspectRatio === 'standard' ? 30 : 38,
        bold: true,
        color: image ? 'FFFFFF' : text,
        margin: 0,
        breakLine: false,
        fit: 'shrink',
      })
      const subtitle = item.subtitle || (index === 0 ? spec.subtitle : '')
      if (subtitle) {
        slide.addText(subtitle, {
          x: 1.08,
          y: 3.65,
          w: width - 2.2,
          h: 1.2,
          fontFace: 'Microsoft YaHei',
          fontSize: 16,
          color: image ? 'E2E8F0' : muted,
          margin: 0,
          fit: 'shrink',
        })
      }
    } else if (item.layout === 'section') {
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: width * 0.32, h: height, line: { transparency: 100 }, fill: { color: accent } })
      slide.addText(String(index + 1).padStart(2, '0'), {
        x: 0.65,
        y: 0.65,
        w: width * 0.22,
        h: 1.1,
        fontSize: 42,
        bold: true,
        color: 'FFFFFF',
        margin: 0,
      })
      slide.addText(item.title, {
        x: width * 0.38,
        y: 2.05,
        w: width * 0.54,
        h: 1.65,
        fontFace: 'Microsoft YaHei',
        fontSize: spec.aspectRatio === 'standard' ? 28 : 34,
        bold: true,
        color: text,
        margin: 0,
        fit: 'shrink',
      })
      if (item.subtitle) {
        slide.addText(item.subtitle, {
          x: width * 0.38,
          y: 3.9,
          w: width * 0.52,
          h: 1.2,
          fontSize: 15,
          color: muted,
          margin: 0,
          fit: 'shrink',
        })
      }
    } else {
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: width, h: 0.12, line: { transparency: 100 }, fill: { color: accent } })
      slide.addText(item.title, {
        x: 0.72,
        y: 0.48,
        w: width - 1.44,
        h: 0.7,
        fontFace: 'Microsoft YaHei',
        fontSize: spec.aspectRatio === 'standard' ? 24 : 28,
        bold: true,
        color: text,
        margin: 0,
        fit: 'shrink',
      })

      const imageOnly = item.layout === 'image'
      const split = item.layout === 'split' || (item.layout === 'content' && Boolean(image))
      const contentX = 0.72
      const contentY = 1.48
      const contentW = split ? width * 0.45 : width - 1.44
      const contentH = 5.2
      const imageX = split ? width * 0.54 : 0.72
      const imageY = imageOnly ? 1.38 : 1.48
      const imageW = imageOnly ? width - 1.44 : width * 0.405
      const imageH = imageOnly ? 5.35 : 5.2

      if (!imageOnly) {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: contentX,
          y: contentY,
          w: contentW,
          h: contentH,
          rectRadius: 0.06,
          line: { color: border, transparency: 15, width: 1 },
          fill: { color: surface },
        })
        if (item.subtitle) {
          slide.addText(item.subtitle, {
            x: contentX + 0.35,
            y: contentY + 0.32,
            w: contentW - 0.7,
            h: 0.75,
            fontSize: 14,
            color: muted,
            margin: 0,
            fit: 'shrink',
          })
        }
        if (item.bullets.length > 0) {
          slide.addText(item.bullets.map((bullet) => ({
            text: bullet,
            options: {
              bullet: { indent: 18 },
              breakLine: true,
              paraSpaceAfterPt: 13,
            },
          })), {
            x: contentX + 0.38,
            y: contentY + (item.subtitle ? 1.15 : 0.45),
            w: contentW - 0.76,
            h: contentH - (item.subtitle ? 1.48 : 0.8),
            fontFace: 'Microsoft YaHei',
            fontSize: item.bullets.length > 6 ? 14 : 17,
            color: text,
            valign: 'top',
            margin: 0,
            breakLine: false,
            fit: 'shrink',
          })
        }
      }

      if (image) {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: imageX - 0.03,
          y: imageY - 0.03,
          w: imageW + 0.06,
          h: imageH + 0.06,
          rectRadius: 0.06,
          line: { color: border, transparency: 10, width: 1 },
          fill: { color: surface },
        })
        slide.addImage({ data: image, x: imageX, y: imageY, w: imageW, h: imageH, sizing: { type: 'contain', w: imageW, h: imageH } })
      } else if (item.imageRef) {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: imageX,
          y: imageY,
          w: imageW,
          h: imageH,
          rectRadius: 0.06,
          line: { color: border, dashType: 'dash', width: 1 },
          fill: { color: surface },
        })
        slide.addText('图片引用不可用', {
          x: imageX + 0.25,
          y: imageY + imageH / 2 - 0.25,
          w: imageW - 0.5,
          h: 0.5,
          fontSize: 13,
          color: muted,
          align: 'center',
          margin: 0,
        })
      }
    }

    if (item.notes) slide.addNotes(item.notes)
    if (item.layout !== 'title') {
      slide.addText(spec.footer || spec.title, {
        x: 0.72,
        y: height - 0.42,
        w: width - 1.8,
        h: 0.2,
        fontSize: 8,
        color: muted,
        margin: 0,
      })
      slide.addText(`${index + 1} / ${spec.slides.length}`, {
        x: width - 1.08,
        y: height - 0.42,
        w: 0.5,
        h: 0.2,
        fontSize: 8,
        color: muted,
        align: 'right',
        margin: 0,
      })
    }
  }

  const output = await pptx.write({ outputType: 'blob', compression: true })
  if (!(output instanceof Blob)) throw new Error('PPTX 文件生成失败')
  return output
}

export async function downloadAgentPresentation(spec: AgentPresentationSpec, imagesByRef: Record<string, string>) {
  const blob = await createAgentPresentationBlob(spec, imagesByRef)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = spec.fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
