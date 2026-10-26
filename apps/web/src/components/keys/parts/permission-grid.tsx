import { useId, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { SegmentedFilter, type FilterOption } from '../../ui/segmented-filter'
import type {
  KeyAction,
  KeyLevel,
  KeyPermissions,
  KeyPreset,
  KeyResource,
} from '../../../types/dashboard/api-keys'
import {
  KEY_ACTIONS,
  KEY_ACTION_LABEL,
  KEY_CATALOG,
  KEY_PRESETS,
  KEY_PRESET_LABEL,
  hasGrant,
  matchPreset,
  presetPermissions,
  toggleGrant,
  type CatalogResource,
} from './key-permissions'

type PresetChoice = KeyPreset | 'custom'

interface PermissionGridProps {
  level: KeyLevel
  value: KeyPermissions
  onChange: (next: KeyPermissions) => void
  /** The line under the grid, e.g. `describeReach(level, names)`. */
  note?: ReactNode
}

/**
 * The resource × action grid of the Create API key dialog. Only the cells
 * valid at `level` are checkboxes. The pressed preset follows the ticks;
 * Custom stays pressed once chosen, until a preset is picked again.
 */
export function PermissionGrid({ level, value, onChange, note }: PermissionGridProps) {
  const headingId = useId()
  const [customChosen, setCustomChosen] = useState(false)
  const matched = matchPreset(level, value)
  const pressed: PresetChoice = customChosen ? 'custom' : matched

  const presetOptions: FilterOption<PresetChoice>[] = [
    ...KEY_PRESETS[level].map((preset) => ({ id: preset, label: KEY_PRESET_LABEL[preset] })),
    { id: 'custom', label: 'Custom' },
  ]

  function handlePreset(choice: PresetChoice) {
    if (choice === 'custom') {
      setCustomChosen(true)
      return
    }
    setCustomChosen(false)
    onChange(presetPermissions(level, choice))
  }

  function handleToggle(resource: KeyResource, action: KeyAction) {
    onChange(toggleGrant(level, value, resource, action))
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span id={headingId} className="text-xs font-medium text-foreground">
          Permissions
        </span>
        <SegmentedFilter
          label="Preset"
          options={presetOptions}
          value={pressed}
          onChange={handlePreset}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table aria-labelledby={headingId} className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="sticky left-0 bg-card px-3.5 py-2.5 text-left font-medium">
                Resource
              </th>
              {KEY_ACTIONS.map((action) => (
                <th
                  key={action}
                  scope="col"
                  className="bg-card px-2 py-2.5 text-center font-medium"
                >
                  {KEY_ACTION_LABEL[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KEY_CATALOG[level].map((resource) => (
              <GridRow
                key={resource.id}
                resource={resource}
                value={value}
                onToggle={handleToggle}
              />
            ))}
          </tbody>
        </table>
      </div>
      {note && (
        <p className="flex items-start gap-2 text-2xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {note}
        </p>
      )}
    </div>
  )
}

interface GridRowProps {
  resource: CatalogResource
  value: KeyPermissions
  onToggle: (resource: KeyResource, action: KeyAction) => void
}

function GridRow({ resource, value, onToggle }: GridRowProps) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="sticky left-0 bg-card px-3.5 py-2 text-left font-normal">
        <span className="flex flex-col">
          <span className="text-xs font-medium text-foreground">{resource.label}</span>
          <span className="text-2xs text-muted-foreground">{resource.hint}</span>
        </span>
      </th>
      {KEY_ACTIONS.map((action) => (
        <td key={action} className="px-2 py-2 text-center">
          {resource.actions.includes(action) ? (
            <GridCell resource={resource} action={action} value={value} onToggle={onToggle} />
          ) : (
            <span aria-hidden="true" className="text-muted-foreground/50">
              ·
            </span>
          )}
        </td>
      ))}
    </tr>
  )
}

interface GridCellProps {
  resource: CatalogResource
  action: KeyAction
  value: KeyPermissions
  onToggle: (resource: KeyResource, action: KeyAction) => void
}

function GridCell({ resource, action, value, onToggle }: GridCellProps) {
  function handleChange() {
    onToggle(resource.id, action)
  }

  return (
    <input
      type="checkbox"
      checked={hasGrant(value, resource.id, action)}
      onChange={handleChange}
      aria-label={`${resource.label}: ${KEY_ACTION_LABEL[action]}`}
      className="size-4 cursor-pointer align-middle accent-primary"
    />
  )
}
