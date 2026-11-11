import type {
  DeploymentConfigUiField,
  DeploymentConfigUiGroup,
  DeploymentConfigUiSchema,
} from '@awaitstep/codegen'
import {
  buildDefaults,
  buildOffs,
  isVisible,
  readPath,
  switchedOn,
  writePath,
  type DefaultsByPath,
  type OffsByPath,
} from './config-paths'

type Config = Record<string, unknown>

/** What the schema says about its toggle parents: their full form (`true`) and their off form. */
export interface ConfigHints {
  objects: DefaultsByPath
  offs: OffsByPath
}

export function buildHints(schema: DeploymentConfigUiSchema): ConfigHints {
  return { objects: buildDefaults(schema), offs: buildOffs(schema) }
}

function blank(item: unknown): boolean {
  if (typeof item === 'string') return item.trim() === ''
  if (item && typeof item === 'object') {
    return Object.values(item).every((v) => typeof v !== 'string' || v.trim() === '')
  }
  return item == null
}

function shownFor(config: Config, field: DeploymentConfigUiField, hints: ConfigHints): boolean {
  return isVisible(field, config, hints.objects, hints.offs)
}

/**
 * A field's value as the page compares and shows it: a switch is on or off
 * (its stored off form reads as off), a list keeps only its filled-in items,
 * and an empty list or blank text is unset.
 */
export function fieldValue(config: Config, field: DeploymentConfigUiField, hints: ConfigHints) {
  const raw = readPath(config, field.path, hints.objects)
  if (field.widget === 'boolean') return switchedOn(raw, field.offObject)
  if (Array.isArray(raw)) {
    const filled = raw.filter((item) => !blank(item))
    return filled.length > 0 ? filled : undefined
  }
  if (raw === '' || raw === null) return undefined
  return raw
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Whether a field differs between two configs. A field neither shows (a
 * sub-setting of a switch that is off on both sides) can't differ.
 */
function fieldDiffers(
  field: DeploymentConfigUiField,
  config: Config,
  other: Config,
  hints: ConfigHints,
) {
  if (!shownFor(config, field, hints) && !shownFor(other, field, hints)) return false
  // A sub-setting that appears or disappears with its switch is that switch's change.
  if (field.visibleWhen && shownFor(config, field, hints) !== shownFor(other, field, hints)) {
    return false
  }
  return !same(fieldValue(config, field, hints), fieldValue(other, field, hints))
}

/** A group is Changed when any of its fields differs from the provider's defaults. */
export function groupChanged(
  group: DeploymentConfigUiGroup,
  config: Config,
  defaults: Config,
  hints: ConfigHints,
): boolean {
  return group.fields.some((field) => fieldDiffers(field, config, defaults, hints))
}

function shown(value: unknown): string {
  if (value === true) return 'on'
  if (value === false) return 'off'
  if (value === undefined) return 'none'
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === 'string') ? value.join(', ') : String(value.length)
  }
  if (typeof value === 'object') return 'set'
  return String(value)
}

/**
 * A group's values in one line ("Logs on · Sampling 1"), from the fields the
 * provider gave a summary label, shown or not; "Defaults" when none is set.
 */
export function groupSummary(
  group: DeploymentConfigUiGroup,
  config: Config,
  hints: ConfigHints,
): string {
  const parts = group.fields
    .filter((field) => field.summaryLabel && shownFor(config, field, hints))
    .flatMap((field) => {
      const value = fieldValue(config, field, hints)
      return value === undefined ? [] : [`${field.summaryLabel} ${shown(value)}`]
    })
  return parts.length > 0 ? parts.join(' · ') : 'Defaults'
}

export interface SettingChange {
  what: string
  now: string
  before: string
}

/** Each field that differs from `baseline` (what was deployed), as "Cron 0 * * * * (was none)". */
export function settingChanges(
  schema: DeploymentConfigUiSchema,
  config: Config,
  baseline: Config,
  hints: ConfigHints,
): SettingChange[] {
  return schema.groups.flatMap((group) =>
    group.fields
      .filter((field) => fieldDiffers(field, config, baseline, hints))
      .map((field) => ({
        what: field.summaryLabel ?? field.label ?? field.path,
        now: shown(fieldValue(config, field, hints)),
        before: shown(fieldValue(baseline, field, hints)),
      })),
  )
}

/**
 * Every setting the schema shows back to the provider's defaults; what it
 * doesn't show (bindings, queue consumers) is kept.
 */
export function resetToDefaults(
  schema: DeploymentConfigUiSchema,
  config: Config,
  defaults: Config,
): Config {
  const out: Config = { ...config }
  for (const group of schema.groups) {
    for (const field of group.fields) {
      const top = field.path.split('.')[0]!
      if (top in defaults) out[top] = structuredClone(defaults[top])
      else delete out[top]
    }
  }
  return out
}

/**
 * The config as it is sent: list items left blank (an Add never filled in)
 * are dropped, so they neither fail the provider's schema nor read as a change.
 */
export function withoutBlankItems(
  schema: DeploymentConfigUiSchema,
  config: Config,
  hints: ConfigHints,
): Config {
  let out = config
  for (const group of schema.groups) {
    for (const field of group.fields) {
      if (field.widget !== 'array' && field.widget !== 'array-of-objects') continue
      const raw = readPath(out, field.path, hints.objects)
      if (!Array.isArray(raw) || !raw.some(blank)) continue
      const filled = raw.filter((item) => !blank(item))
      out = writePath(out, field.path, filled.length > 0 ? filled : undefined, hints.objects)
    }
  }
  return out
}
