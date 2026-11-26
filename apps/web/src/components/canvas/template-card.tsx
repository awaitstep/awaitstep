import {
  TEMPLATE_ICONS,
  templateRegistryNodes,
  type WorkflowTemplate,
} from '../../lib/workflow-templates'
import { Tile } from '../ui/tile'

interface TemplateCardProps {
  template: WorkflowTemplate
  onSelect: (template: WorkflowTemplate) => void
}

/** One template in the picker: icon, name, node count, what it's for and the nodes to install. */
export function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const Icon = TEMPLATE_ICONS[template.icon]
  const uses = templateRegistryNodes(template)

  function handleClick() {
    onSelect(template)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-4 text-left transition-colors hover:border-primary-ink/30 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-2.5">
        <Tile
          size="sm"
          className="bg-primary-ink/10 text-primary-ink transition-colors group-hover:bg-primary-ink/20"
        >
          <Icon />
        </Tile>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{template.name}</span>
          <span className="text-xs text-muted-foreground/60">{template.ir.nodes.length} nodes</span>
        </span>
      </span>
      <span className="text-sm leading-relaxed text-muted-foreground">{template.description}</span>
      {uses.length > 0 && (
        <span className="mt-auto text-xs text-muted-foreground/70">Uses {uses.join(', ')}</span>
      )}
    </button>
  )
}
