import { countBySeverity, type Problem } from '../../lib/ide/problems'
import { fileLanguage } from '../../lib/ide/file-tree'
import { filePathOfTab } from '../../lib/ide/tabs'
import { useIdeStore } from '../../stores/ide-store'

const LANGUAGE_LABEL: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  json: 'JSON',
}

/** Problem counts, the caret and the file's language (28d's status bar). */
export function LibraryStatusBar({ problems }: { problems: Problem[] }) {
  const cursor = useIdeStore((s) => s.cursor)
  const activePath = useIdeStore((s) => s.activePath)
  const file = filePathOfTab(activePath)
  const counts = countBySeverity(problems)
  const language = file ? (LANGUAGE_LABEL[fileLanguage(file)] ?? 'Plain text') : null
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-card px-3 text-2xs text-muted-foreground">
      <span>
        {counts.error === 0 && counts.warning === 0
          ? 'No problems'
          : `${counts.error} errors · ${counts.warning} warnings`}
      </span>
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
