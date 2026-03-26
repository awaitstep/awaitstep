import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useShallow } from 'zustand/react/shallow'
import { WorkflowSettings } from './workflow-settings'
import { NodeConfigPanel } from './node-config-panel'
import { LocalTestPanel } from './local-test-panel'

interface CanvasSidePanelsProps {
  showEditor: boolean
  showLocalTest: boolean
  onCloseLocalTest: () => void
  workflowId: string
  LazyEditorPanel: React.LazyExoticComponent<React.ComponentType>
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

  if (!showSettings && !selectedNodeId && !showEditor && !showLocalTest) return null

  return (
    <div className="absolute right-0 top-0 z-10 flex h-full">
      {showSettings && (
        <aside className="h-full w-[380px] border-l border-border bg-card shadow-lg">
          <WorkflowSettings />
        </aside>
      )}
      {!showSettings && selectedNodeId && (
        <aside className="h-full w-[380px] border-l border-border bg-card shadow-lg">
          <NodeConfigPanel />
        </aside>
      )}
      {showEditor && (
        <aside className="h-full w-[760px] border-l border-border bg-card shadow-lg">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
              </div>
            }
          >
            <LazyEditorPanel />
          </Suspense>
        </aside>
      )}
      {showLocalTest && (
        <aside className="h-full w-[480px] border-l border-border bg-card shadow-lg">
          <LocalTestPanel workflowId={workflowId} onClose={onCloseLocalTest} />
        </aside>
      )}
    </div>
  )
}
