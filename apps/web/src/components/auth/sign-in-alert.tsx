import { CircleAlert } from 'lucide-react'
import type { ProblemCopy } from './sign-in-problem'

/** The red panel under the heading when a sign-in failed: what happened, then what to do. */
export function SignInAlert({ title, body }: ProblemCopy) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-status-error/50 bg-card px-4 py-3.5"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-status-error" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-semibold leading-snug text-status-error">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{body}</span>
      </div>
    </div>
  )
}
