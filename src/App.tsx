import { useEffect, useRef, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { activateFirstImportedProfile, buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { isDefaultConfigOnlyEnabled, mergeImportedSettings } from './lib/apiProfiles'
import { getCustomProviderConfigUrl, loadCustomProviderSettingsFromUrl } from './lib/customProviderConfigUrl'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import type { AppSettings } from './types'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import AgentWorkspace from './components/AgentWorkspace'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import SupportPromptModal from './components/SupportPromptModal'
import { FavoriteCollectionPickerModal, FavoriteCollectionsView, ManageCollectionsModal } from './components/FavoriteCollections'
import { useGlobalClickSuppression } from './lib/clickSuppression'

let customProviderConfigUrlImportStarted = false
const DYNAMIC_BACKGROUND_STORAGE_KEY = 'gpt-image-playground:dynamic-background-enabled'
const STATIC_BACKGROUND_MANIFEST_URL = '/background-wallpapers.json'
const DEFAULT_DYNAMIC_BACKGROUND_URL = '/page-background.mp4'
const DEFAULT_STATIC_BACKGROUND_URL = '/page-background-kushiro-sunset.png'
const DAY_MS = 24 * 60 * 60 * 1000

function getInitialDynamicBackgroundEnabled() {
  try {
    return window.localStorage.getItem(DYNAMIC_BACKGROUND_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

function getLocalDayNumber() {
  const now = new Date()
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / DAY_MS)
}

function normalizeStaticBackgroundImages(value: unknown) {
  const images = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { images?: unknown }).images)
      ? (value as { images: unknown[] }).images
      : []

  return images
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

function preloadImage(url: string) {
  return new Promise<string | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(url)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const appMode = useStore((s) => s.appMode)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const [dynamicBackgroundEnabled, setDynamicBackgroundEnabled] = useState(getInitialDynamicBackgroundEnabled)
  const [hasEnteredExperience, setHasEnteredExperience] = useState(false)
  const [wallpaperDayNumber, setWallpaperDayNumber] = useState(getLocalDayNumber)
  const [staticBackgroundManualOffset, setStaticBackgroundManualOffset] = useState(0)
  const [staticBackgroundImages, setStaticBackgroundImages] = useState<string[]>([DEFAULT_STATIC_BACKGROUND_URL])
  const dynamicBackgroundVideoRef = useRef<HTMLVideoElement>(null)
  const staticBackgroundUrl = staticBackgroundImages[(wallpaperDayNumber + staticBackgroundManualOffset) % staticBackgroundImages.length] ?? DEFAULT_STATIC_BACKGROUND_URL
  const showDynamicBackground = !hasEnteredExperience || dynamicBackgroundEnabled
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const customProviderConfigUrl = getCustomProviderConfigUrl()
    const defaultConfigOnly = isDefaultConfigOnlyEnabled()

    const applyUrlSettings = (baseSettings: Partial<AppSettings>) => {
      const nextSettings = buildSettingsFromUrlParams(baseSettings, searchParams)
      return Object.keys(nextSettings).length ? nextSettings : baseSettings
    }

    const clearAppliedUrlSettings = () => {
      if (!hasUrlSettingParams(searchParams)) return

      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    if (customProviderConfigUrl && defaultConfigOnly && !customProviderConfigUrlImportStarted) {
      customProviderConfigUrlImportStarted = true
      void loadCustomProviderSettingsFromUrl(customProviderConfigUrl)
        .then((importedSettings) => {
          const state = useStore.getState()
          const baseSettings = importedSettings
            ? activateFirstImportedProfile(mergeImportedSettings(state.settings, importedSettings), importedSettings)
            : state.settings
          state.setSettings(applyUrlSettings(baseSettings))
          clearAppliedUrlSettings()
        })
        .catch((error) => {
          console.warn('Failed to import custom provider config URL:', error)
          const state = useStore.getState()
          state.setSettings(applyUrlSettings(state.settings))
          clearAppliedUrlSettings()
        })

      initStore()
      return
    }

    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    clearAppliedUrlSettings()

    if (customProviderConfigUrl && !customProviderConfigUrlImportStarted) {
      customProviderConfigUrlImportStarted = true
      void loadCustomProviderSettingsFromUrl(customProviderConfigUrl)
        .then((importedSettings) => {
          if (!importedSettings) return
          const state = useStore.getState()
          state.setSettings(mergeImportedSettings(state.settings, importedSettings))
        })
        .catch((error) => {
          console.warn('Failed to import custom provider config URL:', error)
        })
    }

    initStore()
  }, [setSettings])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  useEffect(() => {
    let cancelled = false

    void fetch(STATIC_BACKGROUND_MANIFEST_URL, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then(async (manifest) => {
        if (!manifest) return
        const images = normalizeStaticBackgroundImages(manifest)
        if (images.length === 0) return

        const availableImages = (await Promise.all(images.map(preloadImage)))
          .filter((url): url is string => Boolean(url))
        if (!cancelled && availableImages.length > 0) {
          setStaticBackgroundImages(availableImages)
        }
      })
      .catch(() => {
        // Keep the built-in fallback background if the optional manifest is missing or invalid.
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWallpaperDayNumber((current) => {
        const next = getLocalDayNumber()
        return next === current ? current : next
      })
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(DYNAMIC_BACKGROUND_STORAGE_KEY, dynamicBackgroundEnabled ? 'true' : 'false')
    } catch {
      // Ignore storage failures; the switch still works for the current session.
    }
  }, [dynamicBackgroundEnabled])

  useEffect(() => {
    const video = dynamicBackgroundVideoRef.current
    if (!video || !showDynamicBackground) return
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    void video.play().catch(() => {
      // 移动端省电/省流量模式可能拒绝自动播放，保留静态海报兜底。
    })
  }, [showDynamicBackground])

  return (
    <>
      <div
        className="fixed inset-0 z-0 pointer-events-none bg-[#111827] bg-cover bg-center bg-no-repeat"
        style={hasEnteredExperience ? { backgroundImage: `url(${JSON.stringify(staticBackgroundUrl)})` } : undefined}
      >
        {showDynamicBackground && (
          <video
            ref={dynamicBackgroundVideoRef}
            aria-hidden="true"
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={hasEnteredExperience ? staticBackgroundUrl : undefined}
            onCanPlay={(e) => {
              void e.currentTarget.play().catch(() => {})
            }}
          >
            <source src={DEFAULT_DYNAMIC_BACKGROUND_URL} type="video/mp4" />
          </video>
        )}
      </div>
      <div className="relative z-10 min-h-screen">
        {!hasEnteredExperience ? (
          <main className="landing-start-screen safe-area-x flex min-h-screen items-center justify-center text-center">
            <div className="landing-start-content">
              <h1>想象，即刻成画</h1>
              <button
                type="button"
                className="landing-start-button"
                onClick={() => setHasEnteredExperience(true)}
              >
                开始使用
              </button>
            </div>
          </main>
        ) : (
          <>
            <Header
              dynamicBackgroundEnabled={dynamicBackgroundEnabled}
              onToggleDynamicBackground={() => setDynamicBackgroundEnabled((enabled) => !enabled)}
              staticBackgroundCount={staticBackgroundImages.length}
              onNextStaticBackground={() => setStaticBackgroundManualOffset((offset) => offset + 1)}
            />
            {appMode === 'agent' ? (
              <AgentWorkspace />
            ) : (
              <main data-home-main data-drag-select-surface className="pb-48">
                <div className="safe-area-x max-w-7xl mx-auto">
                  <SearchBar />
                  {filterFavorite && !activeFavoriteCollectionId ? <FavoriteCollectionsView /> : <TaskGrid />}
                </div>
              </main>
            )}
            <InputBar />
            <DetailModal />
            <Lightbox />
            <SettingsModal />
            <ConfirmDialog />
            <SupportPromptModal />
            <FavoriteCollectionPickerModal />
            <ManageCollectionsModal />
            <Toast />
            <MaskEditorModal />
            <ImageContextMenu />
          </>
        )}
      </div>
    </>
  )
}
