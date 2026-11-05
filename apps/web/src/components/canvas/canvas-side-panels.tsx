import { useEffect, useState } from 'react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useCanvasLayoutStore } from '../../stores/canvas-layout-store'
import { useShallow } from 'zustand/react/shallow'
import { WorkflowSettings } from './workflow-settings'
import { NodeConfigPanel } from './node-config-panel'
import { LocalTestPanel } from './local-test-panel'
import { cn } from '../../lib/utils'
import { focusMoreActions } from '../workflows/top-bar-focus'

interface CanvasSidePanelsProps {
  showLocalTest: boolean
  onCloseLocalTest: () => void
  workflowId: string
}

function SlideIn({
  show,
  width,
  panel,
  label,
  onEscape,
  children,
}: {
  show: boolean
  width: string
  /** Names the panel for the ⋯ menu, which moves focus into it when it opens one. */
  panel?: string
  label?: string
  /** Esc closes the panel and hands focus back to ⋯, which is where it was opened from. */
  onEscape?: () => void
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (show) {
      requestAnimationFrame(() => setMounted(true))
    } else {
      setMounted(false)
    }
  }, [show])

  if (!show) return null

  function handleKeyDown(event: React.KeyboardEvent) {
    // A popover inside the panel (a select, a menu) takes its own Esc first.
    if (event.key !== 'Escape' || event.defaultPrevented || !onEscape) return
    onEscape()
    focusMoreActions()
  }

  return (
    <aside
      data-panel={panel}
      aria-label={label}
      tabIndex={panel ? -1 : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        'h-full border-l outline-none border-border bg-card shadow-lg transition-transform duration-200 ease-out',
        width,
        mounted ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {children}
    </aside>
  )
}

export function CanvasSidePanels({
  showLocalTest,
  onCloseLocalTest,
  workflowId,
}: CanvasSidePanelsProps) {
  const { showSettings, selectedNodeId } = useWorkflowStore(
    useShallow((s) => ({ showSettings: s.showSettings, selectedNodeId: s.selectedNodeId })),
  )

  function handleCloseSettings() {
    useWorkflowStore.getState().setShowSettings(false)
  }

  const inspectorOpen = useCanvasLayoutStore((s) => s.inspectorOpen)
  const showInspector = !showSettings && !!selectedNodeId && inspectorOpen

  const hasPanel = showSettings || showInspector || showLocalTest
  if (!hasPanel) return null

  return (
    <div className="absolute right-0 top-0 z-10 flex h-full" onKeyDown={(e) => e.stopPropagation()}>
      <SlideIn
        show={showSettings}
        width="w-[380px]"
        panel="settings"
        label="Workflow settings"
        onEscape={handleCloseSettings}
      >
        <WorkflowSettings />
      </SlideIn>
      <SlideIn show={showInspector} width="w-[380px]">
        <NodeConfigPanel />
      </SlideIn>
      <SlideIn
        show={showLocalTest}
        width="w-[480px]"
        panel="local-test"
        label="Local test"
        onEscape={onCloseLocalTest}
      >
        <LocalTestPanel workflowId={workflowId} onClose={onCloseLocalTest} />
      </SlideIn>
    </div>
  )
}
