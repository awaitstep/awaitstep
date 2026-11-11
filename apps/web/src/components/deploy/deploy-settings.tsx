import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { DeploymentConfigUiGroup, DeploymentConfigUiSchema } from '@awaitstep/codegen'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { Button } from '../ui/button'
import { isVisible, readPath, writePath } from './config-paths'
import { groupChanged, groupSummary, type ConfigHints } from './deploy-settings-model'
import { SettingField } from './deploy-setting-field'

type Config = Record<string, unknown>

interface DeploySettingsProps {
  schema: DeploymentConfigUiSchema
  config: Config
  defaults: Config
  hints: ConfigHints
  onChange: (config: Config) => void
  onReset: () => void
}

/**
 * Deploy's settings (25a, 25b): one row a group with what it is set to and
 * whether that's the default; one group open at a time.
 */
export function DeploySettings({
  schema,
  config,
  defaults,
  hints,
  onChange,
  onReset,
}: DeploySettingsProps) {
  const [open, setOpen] = useState<string | null>(null)
  const changed = schema.groups.filter((g) => groupChanged(g, config, defaults, hints))

  const caption =
    changed.length === 0 ? 'All at their defaults' : `${changed.length} changed from the defaults`
  const resetAction =
    changed.length > 0 ? (
      <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onReset}>
        Reset to defaults
      </Button>
    ) : null

  return (
    <OverviewCard title="Settings" caption={caption} action={resetAction}>
      <div className="divide-y divide-border">
        {schema.groups.map((group) => (
          <SettingsGroup
            key={group.title}
            group={group}
            config={config}
            hints={hints}
            changed={changed.includes(group)}
            open={open === group.title}
            onToggle={setOpen}
            onChange={onChange}
          />
        ))}
      </div>
    </OverviewCard>
  )
}

interface SettingsGroupProps {
  group: DeploymentConfigUiGroup
  config: Config
  hints: ConfigHints
  changed: boolean
  open: boolean
  onToggle: (title: string | null) => void
  onChange: (config: Config) => void
}

function SettingsGroup({
  group,
  config,
  hints,
  changed,
  open,
  onToggle,
  onChange,
}: SettingsGroupProps) {
  const fields = group.fields.filter((f) => isVisible(f, config, hints.objects, hints.offs))
  const panelId = `deploy-group-${group.title.replace(/\W+/g, '-').toLowerCase()}`

  function handleToggle() {
    onToggle(open ? null : group.title)
  }

  return (
    <div className={cn('flex flex-col', open && 'bg-muted/30')}>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={handleToggle}
        className="h-auto w-full justify-start gap-3 rounded-none px-5 py-3.5 text-left font-normal"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90 text-foreground',
          )}
        />
        <span className="w-[150px] shrink-0 text-[13.5px] font-medium text-foreground">
          {group.title}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
          {groupSummary(group, config, hints)}
        </span>
        <Badge variant={changed ? 'warning' : 'neutral'}>{changed ? 'Changed' : 'Default'}</Badge>
      </Button>
      {open && (
        <div id={panelId} className="flex flex-col gap-3.5 pb-5 pl-[46px] pr-5 pt-0.5">
          {fields.map((field) => (
            <GroupField
              key={field.path}
              field={field}
              config={config}
              hints={hints}
              onChange={onChange}
            />
          ))}
          {group.description && (
            <span className="text-xs text-muted-foreground">{group.description}</span>
          )}
        </div>
      )}
    </div>
  )
}

function GroupField({
  field,
  config,
  hints,
  onChange,
}: {
  field: DeploymentConfigUiGroup['fields'][number]
  config: Config
  hints: ConfigHints
  onChange: (config: Config) => void
}) {
  function handleChange(value: unknown) {
    onChange(writePath(config, field.path, value, hints.objects))
  }
  return (
    <SettingField
      field={field}
      value={readPath(config, field.path, hints.objects)}
      onChange={handleChange}
    />
  )
}
