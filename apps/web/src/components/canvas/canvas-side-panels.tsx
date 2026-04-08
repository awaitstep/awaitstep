import { Suspense, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useShallow } from 'zustand/react/shallow'
import { WorkflowSettings } from './workflow-settings'
import { NodeConfigPanel } from './node-config-panel'
import { LocalTestPanel } from './local-test-panel'
import { cn } from '../../lib/utils'

interface CanvasSidePanelsProps {
  showEditor: boolean
  showLocalTest: boolean
  onCloseLocalTest: () => void
  workflowId: string
  LazyEditorPanel: React.LazyExoticComponent<React.ComponentType>
}

function SlideIn({
  show,
  width,
  children,
}: {
  show: boolean
  width: string
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

  return (
    <aside
      className={cn(
        'h-full border-l border-border bg-card shadow-lg transition-transform duration-200 ease-out',
        width,
        mounted ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {children}
    </aside>
  )
}

export function CanvasSidePanels({
  showEditor,
  showLocalTest,
  onCloseLocalTest,
  workflowId,
  LazyEditorPanel,
}: CanvasSidePanelsProps) {
  const { showSettings, selectedNodeId } = useWorkflowStore(
    useShallow((s) => ({ showSettings: s.showSettings, selectedNodeId: s.selectedNodeId })),
  )

  const hasPanel = showSettings || !!selectedNodeId || showEditor || showLocalTest
  if (!hasPanel) return null

  return (
    <div className="absolute right-0 top-0 z-10 flex h-full" onKeyDown={(e) => e.stopPropagation()}>
      <SlideIn show={showSettings} width="w-[380px]">
        <WorkflowSettings />
      </SlideIn>
      <SlideIn show={!showSettings && !!selectedNodeId} width="w-[380px]">
        <NodeConfigPanel />
      </SlideIn>
      <SlideIn show={showEditor} width="w-[760px]">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
            </div>
          }
        >
          <LazyEditorPanel />
        </Suspense>
      </SlideIn>
      <SlideIn show={showLocalTest} width="w-[480px]">
        <LocalTestPanel workflowId={workflowId} onClose={onCloseLocalTest} />
      </SlideIn>
    </div>
  )
}
