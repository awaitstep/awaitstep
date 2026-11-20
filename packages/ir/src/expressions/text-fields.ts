/** How a built-in node's text fields take expressions; see {@link BUILTIN_TEXT_FIELDS}. */
export interface TextFields {
  /** Fields whose string, or whose map's string values, the runtime receives as text. */
  fields: ReadonlySet<string>
  /**
   * The generator also takes a hand-written, closed `${…}` in these strings as
   * code (the HTTP node documents it). Otherwise a typed `${` stays text.
   */
  rawInterpolation: boolean
}

/**
 * Built-in fields whose strings the runtime receives as text, not code: an
 * HTTP URL, header and query values, a sub-script's URL and headers. A
 * `{{…}}` there becomes `${…}` in a template string. A map field (headers,
 * query params) is read one level deep: each string value is a text field.
 *
 * This is the one list the expression surface is judged by: the resolver
 * compiles these values, and the finder, the problem check and the readers
 * scan walk the same maps, so a header expression is resolved, checked and
 * tracked like a URL one. A field missing here is not walked as a map.
 */
export const BUILTIN_TEXT_FIELDS: Readonly<Record<string, TextFields>> = {
  http_request: { fields: new Set(['url', 'headers', 'queryParams']), rawInterpolation: true },
  sub_script: { fields: new Set(['url', 'headers']), rawInterpolation: false },
}

/** The node type's text fields, or undefined when it has none. */
export function textFieldsOf(type: string | undefined): TextFields | undefined {
  return type !== undefined && Object.hasOwn(BUILTIN_TEXT_FIELDS, type)
    ? BUILTIN_TEXT_FIELDS[type]
    : undefined
}

/** A plain object whose string values are text fields (a header or query map). */
export function isTextMap(
  type: string | undefined,
  field: string,
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    textFieldsOf(type)?.fields.has(field) === true
  )
}
