import { useEffect, useState } from 'react'
import type { AppSettings } from '../types'
import { DEFAULT_RESPONSES_MODEL, getAgentTextApiProfile, validateApiProfile } from '../lib/apiProfiles'
import { callRevisedPromptTranslationApi } from '../lib/agentApi'

const promptTranslationCache = new Map<string, string>()
const promptTranslationFailures = new Set<string>()

export function shouldTranslatePromptText(text: string) {
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0
  const chineseCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0
  if (latinCount < 16) return false
  return chineseCount === 0 || latinCount / Math.max(chineseCount, 1) >= 2.5
}

function getPromptTranslationProfile(settings: AppSettings) {
  const profile = getAgentTextApiProfile(settings)
  if (!profile || profile.provider !== 'openai') return null

  const candidate = profile.apiMode === 'responses'
    ? profile
    : { ...profile, apiMode: 'responses' as const, model: DEFAULT_RESPONSES_MODEL, streamImages: false }
  return validateApiProfile(candidate) ? null : candidate
}

export function useTranslatedPrompt({
  text,
  settings,
  enabled = true,
  logLabel = '提示词',
}: {
  text: string
  settings: AppSettings
  enabled?: boolean
  logLabel?: string
}) {
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [translatingText, setTranslatingText] = useState('')
  const textToTranslate = text.trim()
  const needsTranslation = Boolean(enabled && textToTranslate && shouldTranslatePromptText(textToTranslate))

  useEffect(() => {
    if (!needsTranslation) {
      setTranslatingText('')
      return
    }

    const cached = promptTranslationCache.get(textToTranslate)
    if (cached) {
      setTranslations((prev) =>
        prev[textToTranslate] === cached ? prev : { ...prev, [textToTranslate]: cached },
      )
      setTranslatingText('')
      return
    }
    if (promptTranslationFailures.has(textToTranslate)) {
      setTranslatingText('')
      return
    }

    const profile = getPromptTranslationProfile(settings)
    if (!profile) {
      setTranslatingText('')
      return
    }

    const controller = new AbortController()
    setTranslatingText(textToTranslate)
    callRevisedPromptTranslationApi({
      settings,
      profile,
      prompt: textToTranslate,
      signal: controller.signal,
    })
      .then((value) => {
        const translated = value.trim()
        if (!translated) {
          promptTranslationFailures.add(textToTranslate)
          return
        }
        promptTranslationCache.set(textToTranslate, translated)
        setTranslations((prev) => ({ ...prev, [textToTranslate]: translated }))
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        promptTranslationFailures.add(textToTranslate)
        console.warn(`翻译 ${logLabel} 失败`, err)
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setTranslatingText((value) => value === textToTranslate ? '' : value)
      })

    return () => controller.abort()
  }, [logLabel, needsTranslation, settings, textToTranslate])

  const translatedText = textToTranslate
    ? translations[textToTranslate] ?? promptTranslationCache.get(textToTranslate) ?? ''
    : ''
  const isTranslating = needsTranslation && translatingText === textToTranslate
  const displayText = needsTranslation
    ? translatedText || (isTranslating ? '正在翻译提示词……' : text)
    : text

  return {
    displayText,
    translatedText,
    isTranslating,
    needsTranslation,
  }
}
