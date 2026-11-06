import {
  MASKED_SECRET_VALUE,
  NAME_PATTERN,
  parseEnvString,
  secretDisplayName,
  splitSecretName,
} from '../env-var-parser'

/** A variable as the editor names it: a secret carries the `SECRET_` prefix. */
export interface EnvRow {
  name: string
  value: string
}

export type EnvGroup = 'attention' | 'secrets' | 'variables'

/**
 * A row being edited: the stored name it started from (null for one just
 * added) and the group it was listed under when the dialog opened. The group
 * is fixed while editing, so a row never jumps away from the field being typed in.
 */
export interface DraftEnvRow extends EnvRow {
  from: string | null
  group: EnvGroup
}

const GLOBAL_REFERENCE = /^\{\{global\.env\.([A-Z][A-Z0-9_]*)\}\}$/

/** The global variable a value points at, or null for an ordinary value. */
export function linkedGlobal(value: string): string | null {
  return GLOBAL_REFERENCE.exec(value.trim())?.[1] ?? null
}

/** A named variable with nothing to read: a secret's mask counts as a value. */
export function needsValue(row: EnvRow): boolean {
  return row.name.trim() !== '' && row.value.trim() === ''
}

/** Where a row is listed: problems first, then secrets, then the rest. */
export function groupOf(row: EnvRow): EnvGroup {
  if (needsValue(row)) return 'attention'
  return splitSecretName(row.name.trim()).isSecret ? 'secrets' : 'variables'
}

/** What the footer counts, over rows that are variables at all. */
export function summarize(rows: readonly EnvRow[]) {
  const named = rows.filter((row) => row.name.trim() !== '')
  return {
    total: named.length,
    secrets: named.filter((row) => splitSecretName(row.name.trim()).isSecret).length,
    linked: named.filter((row) => linkedGlobal(row.value) !== null).length,
    missing: named.filter(needsValue).length,
  }
}

/** Rows from a `.env` file's text: the lines that parse, and how many were left out. */
export function rowsFromDotenv(text: string, existingNames: readonly string[]) {
  const have = new Set(existingNames.map((name) => splitSecretName(name.trim()).name))
  const rows: EnvRow[] = []
  let invalid = 0
  let present = 0
  for (const line of parseEnvString(text)) {
    if (line.error) invalid += 1
    else if (have.has(line.name)) present += 1
    else {
      have.add(line.name)
      rows.push({ name: secretDisplayName(line.name, line.isSecret), value: line.value })
    }
  }
  return { rows, invalid, present }
}

/** The workflow's stored variables (JSON text, secrets masked) as editor rows. */
export function parseEnvVars(json: string | null | undefined): EnvRow[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.map((v: { name: string; value: string; isSecret?: boolean }) => ({
      name: secretDisplayName(v.name, v.isSecret ?? false),
      value: v.value,
    }))
  } catch {
    return []
  }
}

/**
 * What the API takes. A blank row, or a bare "SECRET_", is a half-typed line
 * and not a variable: sending it would fail the name check for the whole list.
 */
export function toApiEnvVars(rows: readonly EnvRow[]) {
  return rows.flatMap((row) => {
    // Trimmed first: a space before SECRET_ must not turn a secret into a plain variable.
    const { name, isSecret } = splitSecretName(row.name.trim())
    const trimmed = name.trim()
    return trimmed ? [{ name: trimmed, isSecret, value: row.value }] : []
  })
}

/** The refusal for a list the API would refuse, in words; null when it is fine. */
export function envVarsError(rows: readonly EnvRow[]): string | null {
  // A secret and a plain variable of one name are the same variable to the worker.
  const seen = new Set<string>()
  for (const { name } of toApiEnvVars(rows)) {
    if (!NAME_PATTERN.test(name)) {
      return `“${name}” isn’t a valid name. Use capital letters, digits and underscores, starting with a letter.`
    }
    if (seen.has(name)) return `“${name}” is used more than once. Rename one.`
    seen.add(name)
  }
  return null
}

/**
 * The names a version declares (`runtime.env`, no values), for a workflow whose
 * variables were never stored: an import carries them that way.
 */
export function declaredEnvRows(irJson: string | null | undefined): EnvRow[] {
  if (!irJson) return []
  try {
    const env = (JSON.parse(irJson) as { runtime?: { env?: unknown } }).runtime?.env
    if (!Array.isArray(env)) return []
    return env.flatMap((d: { name?: unknown; secret?: unknown }) =>
      typeof d?.name === 'string' && d.name
        ? [{ name: secretDisplayName(d.name, d.secret === true), value: '' }]
        : [],
    )
  } catch {
    return []
  }
}

/**
 * A variable with a name and nothing to read is not saved: the step that reads
 * it would get an empty string. A link to a global counts as a value.
 */
export function missingValueError(rows: readonly EnvRow[]): string | null {
  const row = rows.find((r) => needsValue(r) && linkedGlobal(r.value) === null)
  return row
    ? `“${row.name.trim()}” needs a value. Add one, link it to a global, or delete it.`
    : null
}

/**
 * A secret's value is only ever the mask; the server keeps the stored one when
 * the same secret comes back masked. Renamed, or no longer secret, there is
 * nothing to keep, so the value has to be typed again.
 */
export function maskedRenameError(rows: readonly DraftEnvRow[]): string | null {
  for (const row of rows) {
    if (row.value === MASKED_SECRET_VALUE && row.name.trim() !== row.from) {
      return `Type the value for “${row.name.trim() || 'this variable'}” again. A renamed secret can’t keep its old value.`
    }
  }
  return null
}
