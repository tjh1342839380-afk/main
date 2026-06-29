import { useMemo, useRef, useState, useEffect, type CSSProperties } from 'react'
import { useStore, reuseConfig, editOutputs, removeTask, taskMatchesFavoriteScope, taskMatchesFilterStatus, taskMatchesSearchQuery } from '../store'
import TaskCard from './TaskCard'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

const TASKS_PER_PAGE = 12
const PAGINATION_TASK_THRESHOLD = TASKS_PER_PAGE

export default function TaskGrid() {
  const tasks = useStore((s) => s.tasks)
  const searchQuery = useStore((s) => s.searchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const selectedTaskIds = useStore((s) => s.selectedTaskIds)
  const setSelectedTaskIds = useStore((s) => s.setSelectedTaskIds)
  const clearSelection = useStore((s) => s.clearSelection)
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [selectionBox, setSelectionBox] = useState<{ startPageX: number; startPageY: number; currentPageX: number; currentPageY: number } | null>(null)
  const dragStart = useRef<{ pageX: number; pageY: number } | null>(null)
  const lastClientPoint = useRef<{ x: number; y: number } | null>(null)
  const hasDragged = useRef(false)
  const isDragging = useRef(false)
  const dragScrollIntervalRef = useRef<number | null>(null)
  const dragScrollDirectionRef = useRef<-1 | 1 | null>(null)
  const lastToastTimeRef = useRef(0)
  const suppressClickUntil = useRef(0)
  const startedOnCard = useRef(false)
  const startedWithCtrl = useRef(false)
  const initialSelection = useRef<string[]>([])
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const [pageIndex, setPageIndex] = useState(0)

  const filteredTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt)
    const q = searchQuery.trim().toLowerCase()
    
    return sorted.filter((t) => {
      if (!taskMatchesFavoriteScope(t, filterFavorite, activeFavoriteCollectionId)) return false
      if (!taskMatchesFilterStatus(t, filterStatus)) return false
      return taskMatchesSearchQuery(t, q)
    })
  }, [tasks, searchQuery, filterStatus, filterFavorite, activeFavoriteCollectionId])

  const pageSize = TASKS_PER_PAGE
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / pageSize))
  const currentPageIndex = Math.min(pageIndex, pageCount - 1)
  const pageStart = currentPageIndex * pageSize
  const visibleTasks = useMemo(() => {
    return filteredTasks.slice(pageStart, pageStart + pageSize)
  }, [filteredTasks, pageSize, pageStart])
  const showPagination = filteredTasks.length > PAGINATION_TASK_THRESHOLD
  const canGoPrev = currentPageIndex > 0
  const canGoNext = currentPageIndex < pageCount - 1

  useEffect(() => {
    setPageIndex(0)
  }, [searchQuery, filterStatus, filterFavorite, activeFavoriteCollectionId])

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1))
  }, [pageCount])

  useEffect(() => {
    document.documentElement.style.setProperty('--task-grid-bottom-clearance', showPagination ? '5rem' : '2rem')
    return () => {
      document.documentElement.style.removeProperty('--task-grid-bottom-clearance')
    }
  }, [showPagination])

  const goToPage = (nextPageIndex: number) => {
    const next = Math.min(Math.max(nextPageIndex, 0), pageCount - 1)
    if (next === currentPageIndex) return

    setPageIndex(next)

    const root = rootRef.current
    if (!root) return

    window.requestAnimationFrame(() => {
      const top = Math.max(0, root.getBoundingClientRect().top + window.scrollY - 96)
      window.scrollTo({ top, behavior: 'smooth' })
    })
  }

  const handleDelete = (task: typeof tasks[0]) => {
    setConfirmDialog({
      title: '删除任务',
      message: '确定要删除这个任务吗？关联的图片资源也会被清理（如果没有其他任务引用）。',
      action: () => removeTask(task),
    })
  }

  const getPagePoint = (clientX: number, clientY: number) => ({
    pageX: clientX + window.scrollX,
    pageY: clientY + window.scrollY,
  })

  const beginSelection = (target: HTMLElement, clientX: number, clientY: number, isCtrl: boolean) => {
    const point = getPagePoint(clientX, clientY)

    startedOnCard.current = Boolean(target.closest('.task-card-wrapper'))
    startedWithCtrl.current = isCtrl
    initialSelection.current = [...useStore.getState().selectedTaskIds]

    isDragging.current = true
    hasDragged.current = false
    dragStart.current = point
    lastClientPoint.current = { x: clientX, y: clientY }
    document.body.classList.add('select-none')
    document.body.classList.add('drag-selecting')
    setSelectionBox({
      startPageX: point.pageX,
      startPageY: point.pageY,
      currentPageX: point.pageX,
      currentPageY: point.pageY,
    })
  }

  const updateSelectionFromPoint = (pageX: number, pageY: number) => {
    const start = dragStart.current
    if (!start || !gridRef.current) return

    const minX = Math.min(start.pageX, pageX)
    const maxX = Math.max(start.pageX, pageX)
    const minY = Math.min(start.pageY, pageY)
    const maxY = Math.max(start.pageY, pageY)

    const cards = gridRef.current.querySelectorAll('.task-card-wrapper')
    const newSelected = new Set(initialSelection.current)
    const initialSelected = new Set(initialSelection.current)

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect()
      const taskId = card.getAttribute('data-task-id')
      if (!taskId) return

      const cardLeft = rect.left + window.scrollX
      const cardRight = rect.right + window.scrollX
      const cardTop = rect.top + window.scrollY
      const cardBottom = rect.bottom + window.scrollY

      const isIntersecting =
        minX < cardRight && maxX > cardLeft && minY < cardBottom && maxY > cardTop

      if (isIntersecting) {
        if (initialSelected.has(taskId)) {
          newSelected.delete(taskId)
        } else {
          newSelected.add(taskId)
        }
      } else if (!initialSelected.has(taskId)) {
        newSelected.delete(taskId)
      }
    })

    setSelectedTaskIds(Array.from(newSelected))
  }

  useEffect(() => {
    const stopDragScroll = () => {
      if (dragScrollIntervalRef.current) {
        clearInterval(dragScrollIntervalRef.current)
        dragScrollIntervalRef.current = null
      }
      dragScrollDirectionRef.current = null
    }

    const startDragScroll = (direction: -1 | 1) => {
      if (dragScrollIntervalRef.current && dragScrollDirectionRef.current === direction) return
      stopDragScroll()
      dragScrollDirectionRef.current = direction
      dragScrollIntervalRef.current = window.setInterval(() => {
        window.scrollBy({ top: direction * 15, behavior: 'instant' })
      }, 16)
    }

    const endSelection = (clearEmptySurfaceClick = false, suppressClick = false) => {
      if (isDragging.current) {
        document.body.classList.remove('select-none')
        document.body.classList.remove('drag-selecting')
      }
      if (isDragging.current && clearEmptySurfaceClick && !hasDragged.current && !startedOnCard.current && !startedWithCtrl.current) {
        clearSelection()
      }
      if (isDragging.current && suppressClick && hasDragged.current) {
        suppressClickUntil.current = Date.now() + 250
      }
      stopDragScroll()
      isDragging.current = false
      dragStart.current = null
      lastClientPoint.current = null
      setSelectionBox(null)
    }

    const getEventElement = (e: MouseEvent) => {
      if (e.target instanceof Element) return e.target
      return document.elementFromPoint(e.clientX, e.clientY)
    }

    const handleDocumentMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = getEventElement(e)
      if (!target) return
      if (!target.closest('[data-drag-select-surface]')) return
      if (target.closest('[data-input-bar]')) return
      if (target.closest('[data-no-drag-select], [data-lightbox-root]')) return
      if (target.closest('button, a, input, textarea, select')) return

      const isCtrl = isMac ? e.metaKey : e.ctrlKey
      beginSelection(target as HTMLElement, e.clientX, e.clientY, isCtrl)
      e.preventDefault()
    }

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dragStart.current) return

      const start = dragStart.current
      const point = getPagePoint(e.clientX, e.clientY)
      lastClientPoint.current = { x: e.clientX, y: e.clientY }
      const distance = Math.hypot(point.pageX - start.pageX, point.pageY - start.pageY)
      if (distance < 6 && !hasDragged.current) return

      hasDragged.current = true
      setSelectionBox({
        startPageX: start.pageX,
        startPageY: start.pageY,
        currentPageX: point.pageX,
        currentPageY: point.pageY,
      })
      updateSelectionFromPoint(point.pageX, point.pageY)
      e.preventDefault()

      const scrollThreshold = 40
      if (e.clientY < scrollThreshold) {
        startDragScroll(-1)
      } else if (e.clientY > window.innerHeight - scrollThreshold) {
        startDragScroll(1)
      } else {
        stopDragScroll()
      }
    }

    const handleDocumentScroll = () => {
      if (!isDragging.current || !dragStart.current || !lastClientPoint.current || !hasDragged.current) return

      const point = getPagePoint(lastClientPoint.current.x, lastClientPoint.current.y)
      const start = dragStart.current
      setSelectionBox({
        startPageX: start.pageX,
        startPageY: start.pageY,
        currentPageX: point.pageX,
        currentPageY: point.pageY,
      })
      updateSelectionFromPoint(point.pageX, point.pageY)
    }

    const handleDocumentWheel = (e: WheelEvent) => {
      if (!isDragging.current) return
      if ((e.buttons & 1) === 0) {
        endSelection()
        return
      }
      if (!hasDragged.current) return
      if (!e.ctrlKey && !e.metaKey) return

      e.preventDefault()
      const now = Date.now()
      if (now - lastToastTimeRef.current > 3000) {
        lastToastTimeRef.current = now
        const keyName = isMac ? '⌘' : 'Ctrl'
        useStore.getState().showToast(`松开 ${keyName} 键使用滚轮，或拖至边缘自动滚动`, 'info')
      }
    }

    const handleDocumentMouseUp = () => {
      endSelection(true, true)
    }

    document.addEventListener('mousedown', handleDocumentMouseDown, true)
    document.addEventListener('mousemove', handleDocumentMouseMove, true)
    document.addEventListener('mouseup', handleDocumentMouseUp, true)
    document.addEventListener('wheel', handleDocumentWheel, { capture: true, passive: false })
    window.addEventListener('scroll', handleDocumentScroll, true)
    return () => {
      stopDragScroll()
      document.removeEventListener('mousedown', handleDocumentMouseDown, true)
      document.removeEventListener('mousemove', handleDocumentMouseMove, true)
      document.removeEventListener('mouseup', handleDocumentMouseUp, true)
      document.removeEventListener('wheel', handleDocumentWheel, true)
      window.removeEventListener('scroll', handleDocumentScroll, true)
    }
  }, [clearSelection, isMac])

  if (!filteredTasks.length) {
    return (
      <div className="text-center py-20 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]">
        {searchQuery || filterFavorite ? (
          <p className="text-sm">没有找到匹配的任务</p>
        ) : (
          <>
            <svg
              className="w-16 h-16 mx-auto mb-4 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm">输入提示词开始生成图片</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div 
      ref={rootRef}
      data-task-grid-root
      className="relative min-h-[50vh]"
      style={{ '--task-card-height': showPagination ? '156px' : '172px' } as CSSProperties}
    >
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
        {visibleTasks.map((task) => (
          <div key={task.id} className="task-card-wrapper" data-task-id={task.id}>
            <TaskCard
              task={task}
              onClick={(e) => {
                if (Date.now() < suppressClickUntil.current) {
                  e.preventDefault()
                  return
                }
                suppressClickUntil.current = 0
                const isCtrl = isMac ? e.metaKey : e.ctrlKey
                if (isCtrl) {
                  useStore.getState().toggleTaskSelection(task.id)
                  return
                }

                setDetailTaskId(task.id)
              }}
              onReuse={() => reuseConfig(task)}
              onEditOutputs={() => editOutputs(task)}
              onDelete={() => handleDelete(task)}
              isSelected={selectedTaskIds.includes(task.id)}
            />
          </div>
        ))}
      </div>
      {showPagination && (
        <div data-no-drag-select className="task-grid-pager-shell">
          <div className="liquid-glass-pager flex items-center gap-1 rounded-full border px-1.5 py-1.5 text-gray-700 shadow-[0_14px_34px_rgba(15,23,42,0.18)] ring-1 ring-black/5 dark:text-gray-200 dark:ring-white/10">
            <button
              type="button"
              onClick={() => goToPage(currentPageIndex - 1)}
              disabled={!canGoPrev}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-all hover:bg-white/60 hover:text-gray-900 active:scale-95 disabled:pointer-events-none disabled:opacity-35 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
              aria-label="上一页"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <div className="flex min-w-[4.75rem] items-center justify-center gap-1 px-2 text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">
              <span>{currentPageIndex + 1}</span>
              <span className="text-gray-400 dark:text-gray-500">/</span>
              <span>{pageCount}</span>
            </div>
            <button
              type="button"
              onClick={() => goToPage(currentPageIndex + 1)}
              disabled={!canGoNext}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-all hover:bg-white/60 hover:text-gray-900 active:scale-95 disabled:pointer-events-none disabled:opacity-35 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
              aria-label="下一页"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {selectionBox && (
        <div
          className="fixed bg-blue-500/20 border border-blue-500/50 pointer-events-none z-[30]"
          style={{
            left: Math.min(selectionBox.startPageX, selectionBox.currentPageX) - window.scrollX,
            top: Math.min(selectionBox.startPageY, selectionBox.currentPageY) - window.scrollY,
            width: Math.abs(selectionBox.currentPageX - selectionBox.startPageX),
            height: Math.abs(selectionBox.currentPageY - selectionBox.startPageY),
          }}
        />
      )}
    </div>
  )
}
