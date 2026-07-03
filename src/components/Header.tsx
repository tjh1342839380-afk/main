import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useStore } from '../store'
import { useTooltip } from '../hooks/useTooltip'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import ViewportTooltip from './ViewportTooltip'
import HelpModal from './HelpModal'
import HistoryModal from './HistoryModal'
import { useFavoriteCollectionTitle } from './FavoriteCollections'
import { CheckIcon, CloseIcon, EditIcon, HelpCircleIcon, HistoryIcon, ImageIcon, InstallIcon, RefreshIcon, SettingsIcon, VideoIcon } from './icons'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isInstalledPwa() {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

interface HeaderProps {
  dynamicBackgroundEnabled: boolean
  onToggleDynamicBackground: () => void
  staticBackgroundCount: number
  onNextStaticBackground: () => void
}

export default function Header({ dynamicBackgroundEnabled, onToggleDynamicBackground, staticBackgroundCount, onNextStaticBackground }: HeaderProps) {
  const appMode = useStore((s) => s.appMode)
  const setAppMode = useStore((s) => s.setAppMode)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const agentConversations = useStore((s) => s.agentConversations)
  const activeAgentConversationId = useStore((s) => s.activeAgentConversationId)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const activeConversation = agentConversations.find((item) => item.id === activeAgentConversationId)
  const renameAgentConversation = useStore((s) => s.renameAgentConversation)
  const favoriteCollectionTitle = useFavoriteCollectionTitle()
  const showFavoriteCollectionTitle = appMode === 'gallery' && Boolean(activeFavoriteCollectionId)
  const [showHelp, setShowHelp] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(isInstalledPwa)
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('up')
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [titleEditorOpen, setTitleEditorOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const titleEditorRef = useRef<HTMLDivElement>(null)
  const titleButtonRef = useRef<HTMLButtonElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const createConversation = useStore((s) => s.createAgentConversation)

  useEffect(() => {
    if (appMode === 'agent') {
      setScrollDirection('up')
      return
    }

    let lastScrollY = window.scrollY
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          if (currentScrollY < 20) {
            setScrollDirection('up')
          } else if (currentScrollY > lastScrollY + 10) {
            setScrollDirection('down')
          } else if (currentScrollY < lastScrollY - 10) {
            setScrollDirection('up')
          }
          lastScrollY = currentScrollY
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [appMode])

  useEffect(() => {
    if (!titleEditorOpen) return
    setTitleDraft(activeConversation?.title || '')
  }, [activeConversation?.id, activeConversation?.title, titleEditorOpen])

  useEffect(() => {
    if (!titleEditorOpen) return
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [titleEditorOpen])

  useEffect(() => {
    if (!titleEditorOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (titleEditorRef.current?.contains(target) || titleButtonRef.current?.contains(target)) return
      setTitleEditorOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [titleEditorOpen])

  const installTooltip = useTooltip()
  const backgroundTooltip = useTooltip()
  const nextBackgroundTooltip = useTooltip()
  const helpTooltip = useTooltip()
  const settingsTooltip = useTooltip()

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setIsPwaInstalled(false)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsPwaInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (installPrompt) {
      const promptEvent = installPrompt
      setInstallPrompt(null)

      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        setIsPwaInstalled(choice.outcome === 'accepted')
      } catch {
        setIsPwaInstalled(isInstalledPwa())
      }
    } else {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (isIos) {
        setConfirmDialog({
          title: '安装为应用',
          message: '在 Safari 浏览器中，点击底部「分享」按钮，选择「添加到主屏幕」即可安装此应用。',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      } else {
        setConfirmDialog({
          title: '安装为应用',
          message: '请在浏览器的菜单中选择「添加到主屏幕」或「安装应用」。\n\n（如果在微信等内置浏览器中，请先在外部浏览器打开）',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      }
    }
  }

  const backgroundToggleLabel = dynamicBackgroundEnabled
    ? '\u5207\u6362\u4e3a\u9759\u6001\u80cc\u666f'
    : '\u5207\u6362\u4e3a\u52a8\u6001\u80cc\u666f'
  const showStaticBackgroundSwitcher = !dynamicBackgroundEnabled
  const canSwitchStaticBackground = !dynamicBackgroundEnabled && staticBackgroundCount > 1
  const nextBackgroundLabel = canSwitchStaticBackground ? '\u4e0b\u4e00\u5f20\u58c1\u7eb8' : '\u6ca1\u6709\u66f4\u591a\u58c1\u7eb8'

  const openTitleEditor = () => {
    if (!activeConversation) return
    setShowHistoryModal(false)
    setTitleDraft(activeConversation.title || '')
    setTitleEditorOpen(true)
  }

  const closeTitleEditor = () => setTitleEditorOpen(false)

  const saveTitleEditor = () => {
    if (!activeConversation) {
      setTitleEditorOpen(false)
      return
    }

    const nextTitle = titleDraft.trim()
    if (nextTitle && nextTitle !== activeConversation.title) {
      renameAgentConversation(activeConversation.id, nextTitle)
    }
    setTitleEditorOpen(false)
  }

  const handleTitleEditorKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveTitleEditor()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeTitleEditor()
    }
  }

  return (
    <>
      <header data-no-drag-select className="liquid-glass-header safe-area-top fixed top-0 left-0 right-0 z-40 translate-y-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-white/[0.08] transition-transform duration-300 ease-in-out">
        <div className="safe-area-x safe-header-inner max-w-7xl mx-auto flex items-center justify-between relative">
          <div className="flex-1 min-w-0 pr-2 flex items-center gap-2">
            <h1 className="inline-flex min-w-0 items-start relative mr-2">
              {showFavoriteCollectionTitle ? (
                <>
                  <span className="min-w-0 truncate text-[17px] font-bold tracking-tight text-gray-800 dark:text-gray-100 sm:hidden" title={favoriteCollectionTitle}>{favoriteCollectionTitle}</span>
                  <span
                    className="hidden text-lg font-bold tracking-tight text-gray-800 dark:text-gray-100 sm:inline"
                  >
                    GPT Image 2 For TJH
                  </span>
                </>
              ) : (
                <span
                  className="text-[17px] sm:text-lg font-bold tracking-tight text-gray-800 dark:text-gray-100"
                >
                  GPT Image 2 For TJH
                </span>
              )}
            </h1>
            {appMode === 'agent' && <div className="hidden sm:flex items-center gap-1 relative">
              <button
                ref={historyButtonRef}
                type="button"
                onClick={() => {
                  setTitleEditorOpen(false)
                  setShowHistoryModal((visible) => !visible)
                }}
                className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg transition-colors"
                title="历史任务"
              >
                <HistoryIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAppMode('agent')
                  createConversation()
                }}
                className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg transition-colors"
                title="新对话"
              >
                <EditIcon className="w-5 h-5" />
              </button>
            </div>}
          </div>
          {appMode === 'agent' && activeConversation && (
            <div className="absolute left-1/2 top-1/2 hidden max-w-[30%] -translate-x-1/2 -translate-y-1/2 sm:flex">
              <button
                ref={titleButtonRef}
                type="button"
                onClick={openTitleEditor}
                className="group flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-white/75 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
                aria-haspopup="dialog"
                aria-expanded={titleEditorOpen}
                title="编辑对话名称"
              >
                <span className="min-w-0 truncate">{activeConversation.title || 'Agent'}</span>
                <EditIcon className="h-3.5 w-3.5 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-500" />
              </button>
            </div>
          )}
          {showFavoriteCollectionTitle && (
            <div className="absolute left-1/2 top-1/2 hidden max-w-[30%] -translate-x-1/2 -translate-y-1/2 sm:flex">
              <div className="truncate rounded px-2 py-1 text-sm font-semibold text-gray-700 dark:text-gray-300" title={favoriteCollectionTitle}>
                {favoriteCollectionTitle}
              </div>
            </div>
          )}
          <div className="liquid-glass-segment hidden sm:flex items-center gap-1 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-100/70 dark:bg-white/[0.04] p-1 mr-4">
            <button
              type="button"
              onClick={() => setAppMode('gallery')}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${appMode === 'gallery' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              画廊
            </button>
            <button
              type="button"
              onClick={() => setAppMode('agent')}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${appMode === 'agent' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              Agent
            </button>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div
              className="relative"
              {...backgroundTooltip.handlers}
            >
              <button
                onClick={() => {
                  dismissAllTooltips()
                  onToggleDynamicBackground()
                }}
                className={`p-2 rounded-lg transition-colors ${dynamicBackgroundEnabled ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900'}`}
                aria-label={backgroundToggleLabel}
                aria-pressed={dynamicBackgroundEnabled}
              >
                {dynamicBackgroundEnabled ? <VideoIcon className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
              </button>
              <ViewportTooltip visible={backgroundTooltip.visible} className="whitespace-nowrap">
                {backgroundToggleLabel}
              </ViewportTooltip>
            </div>
            {showStaticBackgroundSwitcher && (
              <div
                className="relative"
                {...nextBackgroundTooltip.handlers}
              >
                <button
                  onClick={() => {
                    if (!canSwitchStaticBackground) return
                    dismissAllTooltips()
                    onNextStaticBackground()
                  }}
                  disabled={!canSwitchStaticBackground}
                  className={`p-2 rounded-lg transition-colors ${canSwitchStaticBackground ? 'text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-500/20' : 'cursor-not-allowed text-gray-400/60 dark:text-gray-500/70'}`}
                  aria-label={nextBackgroundLabel}
                >
                  <RefreshIcon className="w-5 h-5" />
                </button>
                <ViewportTooltip visible={nextBackgroundTooltip.visible} className="whitespace-nowrap">
                  {nextBackgroundLabel}
                </ViewportTooltip>
              </div>
            )}
            {!isPwaInstalled && (
              <div
                className="relative"
                {...installTooltip.handlers}
              >
                <button
                  onClick={() => {
                    dismissAllTooltips()
                    handleInstallClick()
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                  aria-label="安装为应用"
                >
                  <InstallIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <ViewportTooltip visible={installTooltip.visible} className="whitespace-nowrap">
                  安装为应用
                </ViewportTooltip>
              </div>
            )}
            <div
              className="relative"
              {...helpTooltip.handlers}
            >
              <button
                onClick={() => {
                  dismissAllTooltips()
                  setShowHelp(true)
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                aria-label="操作指南"
              >
                <HelpCircleIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={helpTooltip.visible} className="whitespace-nowrap">
                操作指南
              </ViewportTooltip>
            </div>
            <div
              className="relative"
              {...settingsTooltip.handlers}
            >
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                aria-label="设置"
              >
                <SettingsIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={settingsTooltip.visible} className="whitespace-nowrap">
                设置
              </ViewportTooltip>
            </div>
          </div>
        </div>
        <div className={`safe-area-x sm:hidden overflow-hidden transition-all duration-300 ease-in-out ${appMode === 'gallery' && scrollDirection === 'down' ? 'max-h-0 opacity-0 pb-0' : 'max-h-20 opacity-100 pb-2'}`}>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-100/70 dark:bg-white/[0.04] p-1 mx-2">
            <button
              type="button"
              onClick={() => setAppMode('gallery')}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${appMode === 'gallery' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              画廊
            </button>
            <button
              type="button"
              onClick={() => setAppMode('agent')}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${appMode === 'agent' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              Agent
            </button>
          </div>
        </div>
      </header>

      {showHistoryModal && (
        <HistoryModal onClose={() => setShowHistoryModal(false)} ignoreOutsideClickRef={historyButtonRef} />
      )}

      {titleEditorOpen && activeConversation && (
        <div
          ref={titleEditorRef}
          role="dialog"
          aria-label="编辑对话名称"
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-50 hidden w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/75 bg-white/90 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:block dark:border-white/[0.10] dark:bg-gray-950/92 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        >
          <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-white/75 bg-white/90 dark:border-white/[0.10] dark:bg-gray-950/92" />
          <div className="relative flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              <EditIcon className="h-4 w-4" />
            </div>
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={handleTitleEditorKeyDown}
              className="min-w-0 flex-1 rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white dark:focus:border-blue-400"
              placeholder="输入对话名称"
              maxLength={40}
            />
            <button
              type="button"
              onClick={closeTitleEditor}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
              aria-label="取消"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={saveTitleEditor}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-white/[0.08]"
              aria-label="保存"
              disabled={!titleDraft.trim()}
            >
              <CheckIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      
      <div className="safe-area-top invisible pointer-events-none max-h-[500px] opacity-100 transition-all duration-300 ease-in-out" aria-hidden="true">
        <div className="safe-header-inner" />
        <div className={`safe-area-x sm:hidden overflow-hidden transition-all duration-300 ease-in-out ${appMode === 'gallery' && scrollDirection === 'down' ? 'max-h-0 pb-0' : 'max-h-20 pb-2'}`}>
          <div className="p-1">
            <div className="py-1.5 text-sm">占位</div>
          </div>
        </div>
      </div>
      {showHelp && <HelpModal appMode={appMode} isFavoriteCollectionOverview={appMode === 'gallery' && filterFavorite && !activeFavoriteCollectionId} onClose={() => setShowHelp(false)} />}
    </>
  )
}
