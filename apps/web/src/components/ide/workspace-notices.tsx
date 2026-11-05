import { describeHandlerDeclarations, type HandlerConversionPreview } from '../../lib/api-client'
import { useSwitchView } from '../../hooks/use-switch-view'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { RouterShellLink } from '../navigation/router-shell-link'
import { Button } from '../ui/button'

const NO_SAVED_VERSION_MESSAGE = 'Save a version on the canvas to see its code here.'

/** What deleting a folder removes, counted over the files the editor knows (saved or not). */
export function describeFolderDelete(
  dir: string | null,
  files: ReadonlyMap<string, { hash?: string }>,
): string {
  const count = dir ? [...files].filter(([p, f]) => p.startsWith(`${dir}/`) && f.hash).length : 0
  if (count === 0) return 'Deletes this folder.'
  return count === 1
    ? 'Deletes this folder and its 1 file. Imports of it will break.'
    : `Deletes this folder and its ${count} files. Imports of them will break.`
}

/** The conversion, in the user's terms, from the server's dry run. */
export function describeConversion(
  preview: HandlerConversionPreview | undefined,
  error: Error | null,
): string {
  if (error) return `The conversion cannot run: ${error.message}`
  if (!preview) return 'Working out what the handlers become…'
  const origin = {
    file: 'handlers.ts is replaced by',
    setting: 'The trigger-code setting becomes',
    version: 'The trigger code saved with this version becomes',
  }[preview.source]
  const parts = [`${origin} ${preview.paths.join(', ')}.`]
  const facts = describeHandlerDeclarations(preview.declarations)
  if (facts.length > 0) parts.push(`Moving to the deployment config: ${facts.join('; ')}.`)
  parts.push('Modules are plain TypeScript: typed, importable, no annotations.')
  return parts.join(' ')
}

function Notice({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{description}</p>
        <div className="mt-4">{action}</div>
      </div>
    </div>
  )
}

export function UnsavedWorkflowNotice() {
  const switchView = useSwitchView('new')

  function handleOpenCanvas() {
    void switchView('canvas')
  }

  return (
    <Notice
      title="Save the workflow first"
      description={NO_SAVED_VERSION_MESSAGE}
      action={
        <Button size="sm" variant="outline" onClick={handleOpenCanvas}>
          Open canvas
        </Button>
      }
    />
  )
}

export function LoadFailure({ workflowId, message }: { workflowId: string; message?: string }) {
  const links = useWorkflowLinks(workflowId)
  return (
    <Notice
      title="Couldn’t load the source"
      description={message || 'Unknown error'}
      action={
        <RouterShellLink href={links.overview}>
          <Button size="sm" variant="outline">
            Back to overview
          </Button>
        </RouterShellLink>
      }
    />
  )
}
