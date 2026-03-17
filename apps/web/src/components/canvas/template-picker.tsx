import {
  ShoppingCart,
  ShoppingBag,
  CreditCard,
  UserCheck,
  Database,
  GitFork,
  Webhook,
  Mail,
  MessageSquare,
  Siren,
  Plus,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { workflowTemplates, templateCategories, type WorkflowTemplate } from '../../lib/workflow-templates'
import { useWorkflowStore, type FlowNode } from '../../stores/workflow-store'

const ICON_MAP: Record<string, ReactNode> = {
  ShoppingCart: <ShoppingCart className="h-5 w-5" />,
  ShoppingBag: <ShoppingBag className="h-5 w-5" />,
  CreditCard: <CreditCard className="h-5 w-5" />,
  UserCheck: <UserCheck className="h-5 w-5" />,
  Database: <Database className="h-5 w-5" />,
  GitFork: <GitFork className="h-5 w-5" />,
  Webhook: <Webhook className="h-5 w-5" />,
  Mail: <Mail className="h-5 w-5" />,
  MessageSquare: <MessageSquare className="h-5 w-5" />,
  Siren: <Siren className="h-5 w-5" />,
}

export function TemplatePicker({ onDismiss }: { onDismiss: () => void }) {
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow)

  const handleSelect = (template: WorkflowTemplate) => {
    const flowNodes: FlowNode[] = template.ir.nodes.map((irNode) => ({
      id: irNode.id,
      type: irNode.type,
      position: irNode.position,
      data: { irNode },
    }))

    const flowEdges = template.ir.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
    }))

    loadWorkflow(
      { ...template.ir.metadata, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      flowNodes,
      flowEdges,
    )
    onDismiss()
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/90">
      <div className="relative max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-md border border-border bg-card shadow-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">New Workflow</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose a template or start with a blank canvas.</p>
          </div>
          <button
            onClick={onDismiss}
            className="rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground/60"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 scrollbar-none" style={{ maxHeight: 'calc(80vh - 72px)' }}>
          {/* Start from scratch */}
          <button
            onClick={onDismiss}
            className="group flex w-full items-center gap-3 rounded-md border border-dashed border-border bg-transparent p-4 text-left transition-all hover:border-border hover:bg-muted/30"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground/60">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[13px] font-medium text-foreground">Start from scratch</div>
              <div className="text-[12px] text-muted-foreground">Empty canvas — drag nodes from the palette.</div>
            </div>
          </button>

          {/* Categories */}
          {templateCategories.map((category) => {
            const templates = workflowTemplates.filter((t) => t.category === category.id)
            if (templates.length === 0) return null

            return (
              <div key={category.id} className="mt-6 space-y-3">
                <div>
                  <h3 className="text-[13px] font-semibold text-foreground/70">{category.name}</h3>
                  <p className="text-[11px] text-muted-foreground/60">{category.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleSelect(template)}
                      className="group flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                          {ICON_MAP[template.icon]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium text-foreground">
                            {template.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground/60">
                            {template.nodeCount} nodes
                          </div>
                        </div>
                      </div>
                      <p className="text-[12px] leading-relaxed text-muted-foreground">
                        {template.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
