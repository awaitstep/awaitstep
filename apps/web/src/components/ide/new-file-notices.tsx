import { importSpecifier } from '../../lib/ide/project'
import { Button } from '../ui/button'
import { EditorBanner } from './editor-banner'

/** `handlers/scheduled.ts` with nothing to run it: the deploy would refuse. */
export function ScheduleBanner({ onOpenCanvas }: { onOpenCanvas: () => void }) {
  return (
    <EditorBanner
      tone="warn"
      actions={
        <Button size="sm" variant="outline" onClick={onOpenCanvas} className="h-6 px-2 text-xs">
          Open canvas
        </Button>
      }
    >
      This handler has no schedule yet. Add a cron trigger to the deployment config before you
      deploy.
    </EditorBanner>
  )
}

/** One line over an empty module, so a new file is not a blank page. */
export function EmptyFileHint({ path }: { path: string }) {
  const specifier = importSpecifier(path)
  return (
    <p className="pointer-events-none absolute left-16 top-1 z-10 text-xs italic text-muted-foreground">
      {specifier ? `Export something, then import it as ${specifier}` : 'Empty file'}
    </p>
  )
}
