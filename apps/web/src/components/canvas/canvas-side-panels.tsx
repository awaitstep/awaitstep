import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { WorkflowSettings } from './workflow-settings'
import { NodeConfigPanel } from './node-config-panel'

interface CanvasSidePanelsProps {
  showCode: boolean
  LazyCodePreview: React.LazyExoticComponent<React.ComponentType>
}

export function CanvasSidePanels({ showCode, LazyCodePreview }: CanvasSidePanelsProps) {
  const showSettings = useWorkflowStore((s) => s.showSettings)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)

  if (!showSettings && !selectedNodeId && !showCode) return null

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
      {showCode && (
        <aside className="h-full w-[380px] border-l border-border bg-card shadow-lg">
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" /></div>}>
            <LazyCodePreview />
          </Suspense>
        </aside>
      )}
    </div>
  )
}
