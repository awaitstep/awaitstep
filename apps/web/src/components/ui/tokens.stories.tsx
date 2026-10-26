import type { Meta, StoryObj } from '@storybook/react-vite'

const workspaceColours = [
  { name: 'Green', tile: 'bg-workspace-green text-workspace-green-foreground' },
  { name: 'Blue', tile: 'bg-workspace-blue text-workspace-blue-foreground' },
  { name: 'Amber', tile: 'bg-workspace-amber text-workspace-amber-foreground' },
  { name: 'Purple', tile: 'bg-workspace-purple text-workspace-purple-foreground' },
  { name: 'Rose', tile: 'bg-workspace-rose text-workspace-rose-foreground' },
]

const tones = [
  { name: 'ok', className: 'bg-tone-ok text-status-success', label: 'Deployed · v12' },
  { name: 'fail', className: 'bg-tone-fail text-status-error', label: 'Failed 5m ago' },
  { name: 'warn', className: 'bg-tone-warn text-status-warning', label: 'Update available' },
  { name: 'info', className: 'bg-tone-info text-status-info', label: 'Shared from IT' },
]

function Tokens() {
  return (
    <div className="flex max-w-xl flex-col gap-8 text-foreground">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Workspace colours</h2>
        <div className="flex flex-wrap gap-3">
          {workspaceColours.map((c) => (
            <div key={c.name} className="flex flex-col items-center gap-1.5">
              <span
                className={`flex size-11 items-center justify-center rounded-xl text-lg font-semibold ${c.tile}`}
              >
                {c.name[0]}
              </span>
              <span className="text-2xs text-muted-foreground">{c.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Tones</h2>
        <div className="flex flex-wrap gap-2">
          {tones.map((t) => (
            <span key={t.name} className={`rounded-full px-2.5 py-1 text-2xs ${t.className}`}>
              {t.label}
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Inherited border</h2>
        <div className="rounded-xl border border-border bg-card p-4 text-xs">Only in Sales</div>
        <div className="rounded-xl border border-dashed border-inherited-border p-4 text-xs text-muted-foreground">
          From Project 101 · Inherited
        </div>
      </section>
    </div>
  )
}

const meta = {
  title: 'Foundations/Tokens',
  component: Tokens,
} satisfies Meta<typeof Tokens>

export default meta

export const Default: StoryObj<typeof meta> = {}
