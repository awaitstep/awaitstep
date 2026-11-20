import { fallbackPosition } from '../../lib/hydrate-workflow'
import { Plus, X } from 'lucide-react'
import {
  workflowTemplates,
  templateCategories,
  type WorkflowTemplate,
} from '../../lib/workflow-templates'
import { useWorkflowStore, type FlowNode } from '../../stores/workflow-store'
import { Button } from '../ui/button'
import { PillTab, PillTabsList } from '../ui/pill-tabs'
import { Tabs, TabsContent } from '../ui/tabs'
import { Tile } from '../ui/tile'
import { focusMoreActions } from '../workflows/top-bar-focus'
import { TemplateCard } from './template-card'

const sections = templateCategories
  .map((category) => ({
    ...category,
    templates: workflowTemplates.filter((t) => t.category === category.id),
  }))
  .filter((section) => section.templates.length > 0)

export function TemplatePicker({ onDismiss }: { onDismiss: () => void }) {
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow)

  const handleSelect = (template: WorkflowTemplate) => {
    const flowNodes: FlowNode[] = template.ir.nodes.map((irNode, i) => ({
      id: irNode.id,
      type: irNode.type,
      position: irNode.position ?? fallbackPosition(i),
      data: { irNode },
    }))

    const flowEdges = template.ir.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
    }))

    // A workflow that already exists was named when it was created: the
    // template brings its steps, not its name. An unsaved `/new` one takes both.
    const { workflowId, metadata } = useWorkflowStore.getState()
    const named = !!workflowId && workflowId !== 'new'
    loadWorkflow(
      {
        ...template.ir.metadata,
        ...(named && { name: metadata.name, description: metadata.description }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      flowNodes,
      flowEdges,
    )
    onDismiss()
  }

  // Focus goes back to the toolbar's "More actions", where Templates is opened from.
  function handleClose() {
    onDismiss()
    focusMoreActions()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    handleClose()
  }

  return (
    <div
      role="region"
      data-panel="templates"
      aria-label="Templates"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/90 outline-none"
    >
      {/* A fixed height, so switching tabs never resizes the dialog. */}
      <div className="relative flex h-[min(80vh,46rem)] w-full flex-col max-w-3xl overflow-hidden rounded-md border border-border bg-card shadow-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">New Workflow</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose a template or start with a blank canvas.
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={handleClose}>
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 scrollbar-none">
          {/* Start from scratch */}
          <button
            type="button"
            onClick={handleClose}
            className="group flex w-full items-center gap-3 rounded-md border border-dashed border-border bg-transparent p-4 text-left transition-colors hover:border-border hover:bg-muted/30"
          >
            <Tile size="sm">
              <Plus />
            </Tile>
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Start from scratch</span>
              <span className="text-xs text-muted-foreground">
                Empty canvas. Drag nodes from the palette.
              </span>
            </span>
          </button>

          <Tabs defaultValue={sections[0]?.id} className="mt-6">
            <PillTabsList>
              {sections.map((section) => (
                <PillTab key={section.id} value={section.id} count={section.templates.length}>
                  {section.name}
                </PillTab>
              ))}
            </PillTabsList>
            {sections.map((section) => (
              <TabsContent key={section.id} value={section.id} className="pt-4">
                <p className="mb-3 text-xs text-muted-foreground/60">{section.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  {section.templates.map((template) => (
                    <TemplateCard key={template.id} template={template} onSelect={handleSelect} />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  )
}
