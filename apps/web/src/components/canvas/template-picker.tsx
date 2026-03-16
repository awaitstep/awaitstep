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
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-8 scrollbar-none">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-white/90">Start with a template</h2>
          <p className="mt-1 text-sm text-white/40">
            Choose a production-ready workflow or start from scratch.
          </p>
        </div>

        {/* Start from scratch */}
        <button
          onClick={onDismiss}
          className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-white/[0.1] bg-transparent p-4 text-left transition-all hover:border-white/20 hover:bg-white/[0.02]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/40 transition-colors group-hover:bg-white/[0.1] group-hover:text-white/60">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[13px] font-medium text-white/90">Start from scratch</div>
            <div className="text-[12px] text-white/40">Empty canvas — drag nodes from the palette to build your workflow.</div>
          </div>
        </button>

        {/* Categories */}
        {templateCategories.map((category) => {
          const templates = workflowTemplates.filter((t) => t.category === category.id)
          if (templates.length === 0) return null

          return (
            <div key={category.id} className="space-y-3">
              <div>
                <h3 className="text-[13px] font-semibold text-white/70">{category.name}</h3>
                <p className="text-[11px] text-white/30">{category.description}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelect(template)}
                    className="group flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition-all hover:border-primary/30 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                        {ICON_MAP[template.icon]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-white/90">
                          {template.name}
                        </div>
                        <div className="text-[11px] text-white/30">
                          {template.nodeCount} nodes
                        </div>
                      </div>
                    </div>
                    <p className="text-[12px] leading-relaxed text-white/40">
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
  )
}
