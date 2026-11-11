import type { Meta, StoryObj } from '@storybook/react-vite'
import { cn } from '../../lib/utils'

const scale = [
  { token: 'text-3xs', size: '10 / 14', role: 'Uppercase micro tag' },
  { token: 'text-2xs', size: '11 / 16', role: 'Meta, badge, timestamp' },
  { token: 'text-xs', size: '12 / 18', role: 'Label, nav, table cell' },
  { token: 'text-sm', size: '14 / 20', role: 'Body, input, button, section/row title' },
  { token: 'text-base', size: '16 / 24', role: 'Card and dialog title' },
  { token: 'text-lg', size: '18 / 26', role: 'Panel and feature title' },
  { token: 'text-xl', size: '20 / 28', role: 'Stat value, avatar initials' },
  { token: 'text-2xl', size: '24 / 32', role: 'Page h1' },
  { token: 'text-3xl', size: '30 / 36', role: 'Empty-state / marketing hero' },
]

const roles = [
  { name: 'Page title', className: 'text-2xl font-semibold tracking-tight', sample: 'Projects' },
  { name: 'Panel title', className: 'text-lg font-semibold', sample: 'Deployment history' },
  { name: 'Dialog title', className: 'text-base font-semibold', sample: 'Create a workspace' },
  { name: 'Section heading', className: 'text-sm font-semibold', sample: 'Recent runs' },
  { name: 'Row title', className: 'text-sm font-semibold', sample: 'Lead enrichment' },
  {
    name: 'Body / description',
    className: 'text-sm text-muted-foreground',
    sample: 'Enrich new CRM leads with company data.',
  },
  {
    name: 'Field label',
    className: 'text-xs font-medium text-foreground/80',
    sample: 'Workspace name',
  },
  {
    name: 'Meta / badge',
    className: 'text-2xs text-muted-foreground',
    sample: 'Failed 5m ago · 12 steps',
  },
  { name: 'Micro tag', className: 'text-3xs uppercase tracking-wider', sample: 'Trigger' },
]

/** The dashboard type scale, one row per size and per role. */
function Typography() {
  return (
    <div className="flex max-w-3xl flex-col gap-10 text-foreground">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Scale</h2>
        <div className="overflow-hidden rounded-xl border border-border">
          {scale.map((row) => (
            <div
              key={row.token}
              className="flex items-baseline gap-4 border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="w-24 shrink-0 font-mono text-2xs text-muted-foreground">
                {row.token}
              </span>
              <span className={cn('min-w-0 flex-1 truncate', row.token)}>
                The quick brown fox jumps over the lazy dog
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-2xs tabular-nums text-muted-foreground">
                {row.size}
              </span>
            </div>
          ))}
        </div>
        <p className="text-2xs text-muted-foreground">
          Sizes are nominal px / line-height. The marketing hero uses Tailwind display sizes
          (`text-4xl` and up) outside the dashboard scale.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Roles</h2>
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          {roles.map((role) => (
            <div key={role.name} className="flex flex-col gap-1">
              <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                {role.name}
              </span>
              <span className={role.className}>{role.sample}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Dense chrome</h2>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-4">
          <span className="rounded border border-primary/40 bg-primary/10 px-1 py-px text-3xs uppercase tracking-wider text-primary">
            Entry
          </span>
          <span className="rounded bg-muted px-1 py-px text-3xs uppercase tracking-wider text-muted-foreground">
            Retry
          </span>
          <span className="font-mono text-2xs text-muted-foreground">step.fetch-user · 124 ms</span>
          <span className="rounded-full bg-muted px-1.5 text-2xs tabular-nums text-muted-foreground">
            3
          </span>
        </div>
      </section>
    </div>
  )
}

const meta = {
  title: 'Foundations/Typography',
  component: Typography,
} satisfies Meta<typeof Typography>

export default meta

export const Default: StoryObj<typeof meta> = {}
