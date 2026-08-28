import type { ParsedLine } from '../../lib/env-var-parser'

interface EnvEditorProps {
  value: string
  onChange: (value: string) => void
  errors: ParsedLine[]
}

const PLACEHOLDER =
  '# One variable per line\n# Prefix with SECRET_ to mark as secret\nSECRET_MY_API_KEY=sk_live_abc123\nDATABASE_URL=postgres://...'

/** Line-numbered .env-style plain text editor. */
export function EnvEditor({ value, onChange, errors }: EnvEditorProps) {
  const lineCount = value.split('\n').length

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value)
  }

  return (
    <div>
      <div className="relative rounded-lg border border-border bg-card font-mono text-sm">
        <div className="pointer-events-none absolute left-0 top-0 w-10 select-none py-3 pr-2 text-right text-2xs leading-6 text-muted-foreground/40">
          {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
            <div key={i} className="h-6">
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          value={value}
          onChange={handleChange}
          placeholder={PLACEHOLDER}
          className="min-h-[55vh] w-full resize-y bg-transparent py-3 pl-12 pr-3 leading-6 outline-none placeholder:text-muted-foreground/30"
          rows={Math.max(lineCount + 2, 6)}
          spellCheck={false}
        />
      </div>

      {errors.length > 0 && (
        <div className="mt-2 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-destructive">
              <span className="font-mono font-medium">{e.name || '(empty)'}</span>: {e.error}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
