// The id an app extension is known by: the API mounts it at `/api/ext/<id>`,
// lists it in `GET /api/instance` → `features`, and the dashboard shows the
// web extension of the same id. One definition for all three.

/** Lowercase letters, digits and inner dashes, at most 64 characters: `agent-chat`, `x1`. */
export const EXTENSION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/** Whether `id` can name an extension (a single URL segment). */
export function isExtensionId(id: unknown): id is string {
  return typeof id === 'string' && EXTENSION_ID_PATTERN.test(id)
}
