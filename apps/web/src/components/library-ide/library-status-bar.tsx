import { Check, CircleAlert } from 'lucide-react'
import { plural } from '../../lib/plural'
import { countBySeverity, type Problem } from '../../lib/ide/problems'
import { fileLanguage } from '../../lib/ide/file-tree'
import { filePathOfTab } from '../../lib/ide/tabs'
import { useIdeStore } from '../../stores/ide-store'

const LANGUAGE_LABEL: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  json: 'JSON',
}

/** Problem counts, the caret and the file's language: 28d's status bar, under the editor and dock. */
export function LibraryStatusBar({ problems }: { problems: Problem[] }) {
  const cursor = useIdeStore((s) => s.cursor)
  const activePath = useIdeStore((s) => s.activePath)
  const file = filePathOfTab(activePath)
  const counts = countBySeverity(problems)
  const clean = counts.error === 0 && counts.warning === 0
  const language = file ? (LANGUAGE_LABEL[fileLanguage(file)] ?? 'Plain text') : null
  return (
    <footer className="flex h-7 shrink-0 items-center gap-2.5 border-t border-border bg-card px-4 text-2xs text-muted-foreground">
      {clean ? (
        <span className="flex items-center gap-1.5 text-primary-ink">
          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
          No problems
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-status-error">
          <CircleAlert className="size-3" aria-hidden="true" />
          {plural(counts.error, 'error')} · {plural(counts.warning, 'warning')}
        </span>
      )}
      <span className="flex-1" />
      {file && (
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
      )}
      {language && <span>{language}</span>}
    </footer>
  )
}
