import { useEffect, useRef, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { activateFirstImportedProfile, buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { getActiveApiProfile, isDefaultConfigOnlyEnabled, mergeImportedSettings, normalizeSettings } from './lib/apiProfiles'
import { ensureSub2ApiImageKey, getSub2ApiGatewayBaseUrl, getSub2ApiSession } from './lib/sub2apiAuth'
import { useSub2ApiAuth } from './hooks/useSub2ApiAuth'
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
import LandingAuthModal, { type LandingAuthMode } from './components/LandingAuthModal'
import UserConsole from './components/UserConsole'
import { FavoriteCollectionPickerModal, FavoriteCollectionsView, ManageCollectionsModal } from './components/FavoriteCollections'
import { useGlobalClickSuppression } from './lib/clickSuppression'

let customProviderConfigUrlImportStarted = false
const DYNAMIC_BACKGROUND_STORAGE_KEY = 'gpt-image-2-for-tjh:dynamic-background-enabled'
const LEGACY_DYNAMIC_BACKGROUND_STORAGE_KEY = 'gpt-image-' + 'playground:dynamic-background-enabled'
const STATIC_BACKGROUND_MANIFEST_URL = '/wallpapers/background-wallpapers.json'
const DEFAULT_DYNAMIC_BACKGROUND_URL = '/wallpapers/dynamic/page-background.mp4'
const DEFAULT_STATIC_BACKGROUND_URL = '/wallpapers/static/page-background-az.png'

function getInitialDynamicBackgroundEnabled() {
  try {
    const saved = window.localStorage.getItem(DYNAMIC_BACKGROUND_STORAGE_KEY)
    if (saved !== null) return saved !== 'false'

    const legacySaved = window.localStorage.getItem(LEGACY_DYNAMIC_BACKGROUND_STORAGE_KEY)
    if (legacySaved !== null) {
      window.localStorage.setItem(DYNAMIC_BACKGROUND_STORAGE_KEY, legacySaved)
      return legacySaved !== 'false'
    }

    return true
  } catch {
    return true
  }
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
  const [hasEnteredExperience, setHasEnteredExperience] = useState(() => Boolean(getSub2ApiSession()))
  const [landingAuthMode, setLandingAuthMode] = useState<LandingAuthMode | null>(null)
  const [staticBackgroundManualOffset, setStaticBackgroundManualOffset] = useState(0)
  const [staticBackgroundImages, setStaticBackgroundImages] = useState<string[]>([DEFAULT_STATIC_BACKGROUND_URL])
  const [showUserConsole, setShowUserConsole] = useState(() => window.location.hash === '#console')
  const dynamicBackgroundVideoRef = useRef<HTMLVideoElement>(null)
  const apiKeySyncStarted = useRef(false)
  const sub2ApiAuth = useSub2ApiAuth()
  const staticBackgroundUrl = staticBackgroundImages[staticBackgroundManualOffset % staticBackgroundImages.length] ?? DEFAULT_STATIC_BACKGROUND_URL
  const showDynamicBackground = hasEnteredExperience && dynamicBackgroundEnabled && !showUserConsole
  const openSub2ApiConsole = () => {
    if (window.location.hash !== '#console') {
      window.history.pushState({ ...window.history.state, gptImageView: 'console' }, '', '#console')
    }
    setShowUserConsole(true)
  }
  const clearSub2ApiConsoleRoute = () => {
    const state = { ...window.history.state }
    delete state.gptImageView
    window.history.replaceState(state, '', `${window.location.pathname}${window.location.search}`)
  }
  const closeSub2ApiConsole = () => {
    if (window.history.state?.gptImageView === 'console') {
      window.history.back()
      return
    }

    clearSub2ApiConsoleRoute()
    setShowUserConsole(false)
  }
  const handleLogout = () => {
    clearSub2ApiConsoleRoute()
    setShowUserConsole(false)
    void sub2ApiAuth.logout().catch((error) => {
      console.warn('退出 Sub2API 登录失败：', error)
    })
  }
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    const syncConsoleRoute = () => setShowUserConsole(window.location.hash === '#console')
    window.addEventListener('hashchange', syncConsoleRoute)
    window.addEventListener('popstate', syncConsoleRoute)
    return () => {
      window.removeEventListener('hashchange', syncConsoleRoute)
      window.removeEventListener('popstate', syncConsoleRoute)
    }
  }, [])

  useEffect(() => {
    if (sub2ApiAuth.isAuthenticated) {
      setHasEnteredExperience(true)
      return
    }

    if (!sub2ApiAuth.isRestoring) setHasEnteredExperience(false)
  }, [sub2ApiAuth.isAuthenticated, sub2ApiAuth.isRestoring])

  useEffect(() => {
    if (!sub2ApiAuth.isAuthenticated || apiKeySyncStarted.current) return
    if (import.meta.env.VITE_SUB2API_AUTO_CONFIGURE !== 'true') return

    const settings = normalizeSettings(useStore.getState().settings)
    const profile = getActiveApiProfile(settings)
    const gatewayBaseUrl = getSub2ApiGatewayBaseUrl()
    const normalizedGatewayBaseUrl = gatewayBaseUrl.replace(/\/+$/, '')
    const isSub2ApiProfile = [profile.baseUrl, settings.baseUrl]
      .some((url) => url.replace(/\/+$/, '') === normalizedGatewayBaseUrl)
    if (profile.provider !== 'openai' || profile.apiKey || !isSub2ApiProfile) return

    apiKeySyncStarted.current = true
    void ensureSub2ApiImageKey()
      .then((apiKey) => {
        const latest = normalizeSettings(useStore.getState().settings)
        const activeProfile = getActiveApiProfile(latest)
        if (activeProfile.provider !== 'openai' || activeProfile.apiKey) return

        const profiles = latest.profiles.map((item) => item.id === activeProfile.id
          ? { ...item, baseUrl: gatewayBaseUrl, apiKey }
          : item)
        useStore.getState().setSettings({ profiles, activeProfileId: activeProfile.id })
      })
      .catch((error) => {
        apiKeySyncStarted.current = false
        console.warn('Sub2API API Key 自动配置失败：', error)
      })
  }, [sub2ApiAuth.isAuthenticated])

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
        className={`fixed inset-0 z-0 pointer-events-none bg-cover bg-center bg-no-repeat ${hasEnteredExperience ? 'bg-[#111827]' : 'landing-start-background'}`}
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
          <main className="landing-start-screen">
            <div className="landing-start-frame">
              <div className="landing-start-content">
                <h1>想象，即刻成画</h1>
                <p>用自然语言描述你的想法，AI 为你生成高质量图像</p>
                <button
                  type="button"
                  className="landing-start-button"
                  onClick={() => {
                    if (sub2ApiAuth.isAuthenticated) {
                      setHasEnteredExperience(true)
                      return
                    }
                    setLandingAuthMode('login')
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 16l-1.7-5L6 9.3l4.3-1.7L12 3z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  开始使用
                </button>
                <div className="landing-start-auth-actions">
                  <button type="button" onClick={() => setLandingAuthMode('login')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                      <circle cx="12" cy="8" r="4" strokeWidth="2" />
                      <path d="M5 21a7 7 0 0114 0" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    登录
                  </button>
                  <span />
                  <button type="button" onClick={() => setLandingAuthMode('register')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                      <circle cx="10" cy="8" r="4" strokeWidth="2" />
                      <path d="M3 21a7 7 0 0114 0" strokeWidth="2" strokeLinecap="round" />
                      <path d="M19 8v6m3-3h-6" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    注册
                  </button>
                </div>
              </div>

              <div className="landing-start-notes">
                <span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M7 18h10a4 4 0 00.6-8 6 6 0 00-11.2-1.8A4.8 4.8 0 007 18z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  登录后同步云端 API 配置
                </span>
                <i />
                <span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M12 3l7 3v5c0 4.5-2.8 8.4-7 10-4.2-1.6-7-5.5-7-10V6l7-3z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9 12l2 2 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  API Key 与登录凭证分离
                </span>
              </div>
            </div>
            <LandingAuthModal
              mode={landingAuthMode}
              onModeChange={setLandingAuthMode}
              onClose={() => setLandingAuthMode(null)}
            />
          </main>
        ) : (
          <>
            {showUserConsole && sub2ApiAuth.user ? (
              <UserConsole
                user={sub2ApiAuth.user}
                onUserChange={sub2ApiAuth.sync}
                onClose={closeSub2ApiConsole}
                onLogout={handleLogout}
              />
            ) : (
              <>
                <Header
                  dynamicBackgroundEnabled={dynamicBackgroundEnabled}
                  onToggleDynamicBackground={() => setDynamicBackgroundEnabled((enabled) => !enabled)}
                  staticBackgroundCount={staticBackgroundImages.length}
                  onNextStaticBackground={() => setStaticBackgroundManualOffset((offset) => offset + 1)}
                  authUser={sub2ApiAuth.user}
                  onOpenConsole={openSub2ApiConsole}
                  onLogout={sub2ApiAuth.isAuthenticated ? handleLogout : undefined}
                />
                {appMode === 'agent' ? (
                  <AgentWorkspace />
                ) : (
                  <main
                    data-home-main
                    data-drag-select-surface
                    className="pb-[calc(var(--input-bar-clearance,12rem)+var(--task-grid-bottom-clearance,2rem))]"
                  >
                    <div className="safe-area-x max-w-7xl mx-auto">
                      <SearchBar />
                      {filterFavorite && !activeFavoriteCollectionId ? <FavoriteCollectionsView /> : <TaskGrid />}
                    </div>
                  </main>
                )}
                <InputBar />
                <DetailModal />
                <Lightbox />
                <SupportPromptModal />
                <FavoriteCollectionPickerModal />
                <ManageCollectionsModal />
                <MaskEditorModal />
                <ImageContextMenu />
              </>
            )}
            <SettingsModal />
            <ConfirmDialog />
            <Toast />
          </>
        )}
      </div>
    </>
  )
}
