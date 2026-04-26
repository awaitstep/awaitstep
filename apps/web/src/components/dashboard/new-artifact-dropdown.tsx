import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, Plus, Workflow, Zap } from 'lucide-react'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { useSheetStore } from '../../stores/sheet-store'
import { NEW_FUNCTION_NAV, NEW_WORKFLOW_NAV } from '../../lib/nav'

interface NewArtifactDropdownProps {
  size?: 'sm' | 'default'
}

/**
 * The "New" button shared between the workflows index page and the dashboard
 * workflow list. Surfaces both artifact kinds (Workflow + Function) so users
 * can discover Function creation from either entry point.
 */
export function NewArtifactDropdown({ size = 'sm' }: NewArtifactDropdownProps) {
  const navigate = useNavigate()
  const { guardAction } = useSheetStore()

  const goNew = (target: 'workflow' | 'function') => {
    guardAction('project', () =>
      navigate(target === 'function' ? NEW_FUNCTION_NAV : NEW_WORKFLOW_NAV),
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem onSelect={() => goNew('workflow')}>
          <Workflow className="h-4 w-4" />
          <div className="flex flex-col">
            <span>Workflow</span>
            <span className="text-xs text-muted-foreground">
              Durable, multi-step, with sleeps and waits
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => goNew('function')}>
          <Zap className="h-4 w-4" />
          <div className="flex flex-col">
            <span className="flex items-center gap-1.5">
              Function
              <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                Beta
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              Stateless, runs synchronously, returns immediately
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
