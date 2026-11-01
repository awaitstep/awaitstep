import { FileCode2, FileJson, FileText } from 'lucide-react'
import type { GeneratedFileRole } from '@awaitstep/codegen'
import { cn } from '../../lib/utils'

const ROLE_TITLES: Record<GeneratedFileRole, string> = {
  entry: 'Entry: the Worker module uploaded first',
  module: 'Module: code bundled with the entry',
  handlers: 'Handlers: @fetch / @queue / @scheduled, compiled into the entry',
  config: 'Config: toolchain configuration',
  meta: 'Metadata: package manifest',
  asset: 'Asset: written to the deploy as-is',
}

export function roleTitle(role: GeneratedFileRole): string {
  return ROLE_TITLES[role]
}

export function FileIcon({ role, className }: { role: GeneratedFileRole; className?: string }) {
  const classes = cn('h-3.5 w-3.5 shrink-0', className)
  switch (role) {
    case 'entry':
      return <FileCode2 className={cn(classes, 'text-primary')} />
    case 'module':
      return <FileCode2 className={cn(classes, 'text-muted-foreground')} />
    case 'handlers':
      return <FileCode2 className={cn(classes, 'text-status-success/80')} />
    case 'config':
      return <FileJson className={cn(classes, 'text-status-warning/80')} />
    case 'meta':
    case 'asset':
      return <FileText className={cn(classes, 'text-muted-foreground/70')} />
  }
}
